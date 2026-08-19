# Salon System — Multi-Branch Management System

Full-stack app: **Express.js + Prisma (PostgreSQL) + Socket.IO** backend, **Next.js (App Router) + Tailwind CSS** frontend. Supports three branches out of the box — Dar es Salaam, Dodoma, Arusha — with role-based access for **Admin**, **Cashier**, and **Staff**.

## Project structure

```
salon-management-system/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Branch, User, SalonArea, Room, RoomAssignment,
│   │   │                      # Service, Session, Transaction, Notification
│   │   └── seed.js            # Seeds 3 branches, an admin, sample cashiers/staff,
│   │                           # rooms, services, and a staff/service roster
│   ├── src/
│   │   ├── config/prismaClient.js
│   │   ├── controllers/       # auth, branch, room, service, session, employee,
│   │   │                      # notification, report
│   │   ├── middleware/authMiddleware.js   # protect + authorize(...roles)
│   │   ├── routes/
│   │   ├── utils/notify.js    # persists + broadcasts notifications over Socket.IO
│   │   └── server.js          # Express + Socket.IO + the background delay sweep
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── app/
    │   ├── login/page.jsx
    │   ├── dashboard/admin/page.jsx
    │   ├── dashboard/cashier/page.jsx
    │   └── dashboard/staff/page.jsx
    ├── components/
    │   ├── DashboardShell.jsx      # sticky sidebar + top bar, shared by every role
    │   ├── RoomCard.jsx            # cashier's room grid tile (timers, delay alert)
    │   ├── StaffSessionCard.jsx    # staff's assigned session (confirm/timer/add-on)
    │   ├── RegisterCustomerModal.jsx
    │   ├── RoomsManager.jsx        # admin: rooms + staff/service roster
    │   ├── EmployeesManager.jsx    # admin: cashiers/staff by branch, with delete
    │   ├── ReportsPanel.jsx        # admin: delay/loss summary + PDF download
    │   ├── NotificationBell.jsx
    │   ├── ChangePasswordModal.jsx
    │   ├── ServicesManager.jsx, RegisterStaffModal.jsx, BranchSelector.jsx,
    │   │   StatCard.jsx, StatusBadge.jsx
    ├── lib/ (api.js, auth.js, i18n.js, socket.js)
    ├── .env.local.example
    └── package.json
```

## 1. Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL to your PostgreSQL instance and a real JWT_SECRET

npm install
npx prisma migrate dev --name init   # creates tables in Postgres
npm run seed                          # seeds branches, admin, cashiers, staff, rooms, roster
npm run dev                           # starts API + Socket.IO on http://localhost:5001
```

**Bootstrap admin login:** username `admin`, password `admin`. Every branch gets its own cashier (`cashier.<branchcode>` / password `cashier`) and two staff accounts, each with a distinct name per branch so nothing looks duplicated across branches — e.g. Dar es Salaam seeds `amina.dsm` (password `juma`) and `baraka.dsm` (password `mushi`); Dodoma seeds `neema.dod` / `elias.dod`; Arusha seeds `zawadi.ars` / `godfrey.ars`. Each staff member's password is their seeded last name, lowercased. Change any of these after first login via the sidebar's **Change password**.

## 2. Frontend setup

```bash
cd frontend
cp .env.local.example .env.local   # points at http://localhost:5001 by default

npm install
npm run dev                        # starts Next.js on http://localhost:3000
```

Visit `http://localhost:3000` → redirects to `/login`.

## 3. The timer, payment, and on-hold engine — how it actually works

Every timer is an absolute `DateTime` column, recomputed on every read — never a client-side counter — so **logging out and back in never pauses or resets anything**, and a server restart doesn't lose time either.

**A payment decision is mandatory and happens up front, before any service timer starts.** `registerCustomer` requires a payment type — `cash`, `mobile_money`, `card`, or the explicit `unpaid` choice — and creates the `Transaction` (status `PAID`, or `UNPAID` if the customer was let through without paying) in the same database write as the `Session` itself. There is no code path that lets a booking exist without that decision being made and recorded — an unpaid customer shows up honestly everywhere money is tracked (the Payments ledger, Reports' "lost/uncollected" total) instead of the payment step just being silently skipped. The same rule applies to an additional service: `confirmAdditionalService` is where its payment decision is made, and only then does its timer start.

**Availability is tracked per (room, service) pair, never per room as a whole.** A room is a physical space that can run several services at once, each with a different staff member and its own independent timer — e.g. Room 2 can have a Massage in progress with Staff A while a Manicure runs at the same time with Staff B in the same room. A room's own status is only used for an admin "take the whole room offline" maintenance toggle.

**But one staff member can only ever be serving one customer at a time.** A staff member can be on the roster for several (room, service) combinations, but the moment they're actively serving someone — from the instant a cashier registers and pays for a customer (`PENDING_ARRIVAL`) until that task is completed, cancelled, or resolved — every other slot they're on the roster for shows as "busy elsewhere" and can't be booked. `isStaffBusy()` in `sessionController.js` is the single source of truth for this.

1. **Cashier registers the customer and confirms payment.** Either against a specific room+service (clicking **Register** on that service's row), or by picking just a service/task via **Quick register**, which automatically finds any room/staff offering it that isn't currently busy. `POST /api/sessions` requires `paymentMethod` (cash / mobile money / card), records the payment as `PAID`, and stores `pendingExpiresAt = now + 10 minutes`. This is *not* the service timer — it's "time for the customer to walk to the room."
2. **Staff confirms arrival.** The assigned staff member (or an Admin) presses **Confirm arrival**. `POST /api/sessions/:id/confirm-arrival` stops the 10-minute countdown immediately and starts the service duration timer (`serviceEndsAt = now + service.durationMins`).
3. **More than 10 minutes late → On-Hold, and the room is released.** A background sweep (`checkForDelays`, run every 10s, independent of anyone being logged in) moves any session past its 10-minute window to `ON_HOLD` — critically, this frees the (room, service) slot back to Free (since `ON_HOLD` isn't a "busy" status), so a different customer can be booked with that same staff member or room while the late one waits. An audible, repeating alarm (siren + flashing tab title + on-screen banner + device push) goes to the assigned staff, the cashier, and every Admin. The customer isn't lost — they stay visible in the cashier's **On Hold** panel and the staff member's own dashboard.
4. **Customer shows up → Clear hold & resume.** A Cashier/Admin can clear the hold and resume service either back in the original room (if it's free again) or reassigned to a different available one; the originally assigned staff member can clear their own hold too, but only into their own original slot (`POST /api/sessions/:id/clear-hold`). This starts the service timer exactly like a normal arrival confirmation.
5. **Never cleared → Expires automatically.** If a hold is never cleared (and never cancelled), the same sweep auto-closes it as `EXPIRED` after 30 more minutes — a true no-show, distinct from a deliberate cancellation, freeing the staff member for good. Since payment was already taken, the cashier is pointed toward issuing a refund if appropriate.
6. **Cancelling a booking.** If a customer says they're not coming, either the assigned staff member *or* a cashier/admin can cancel it — while it's `PENDING_ARRIVAL` or `ON_HOLD`. This is the "remove a customer" action; because payment already happened up front, the cashier/admin is reminded a refund may be owed.
7. **Ending a service.** A Cashier, Admin, or the assigned staff member can end a session at any time, early or on schedule (`POST /api/sessions/:id/end`). Whoever ends it is recorded (`endedById`) and the *other* side is always notified. If ended before the natural duration, it's flagged `endedEarly` and reported to every Admin.
8. **Adding another service.** Once a service is finished, the assigned staff member can request one additional service via **Add another service**. This creates a new linked session in `AWAITING_CASHIER`; the cashier must **confirm and pay** for it (same mandatory-payment rule) before it starts.
9. **Refunds.** A Cashier or Admin can issue a full or partial refund on any `PAID` transaction (`POST /api/rooms/transactions/:id/refund`), with an optional reason — recorded with who issued it and when.

## 4. Rooms & the staff/service roster

Each room has a **room number** (`roomNumber`) plus a **roster**: a list of `(service, staff)` pairs. A room can run several services **at the same time**, but each service inside that room maps to exactly one staff member (enforced by a unique DB constraint) — so if Room 2 offers both a Haircut and a Massage, a different person must be assigned to each, and both can be in progress simultaneously. A room must be created with at least one staffed service (picked right in the creation form), so it's never left unusable. Admins manage the full roster, take a room fully offline for maintenance, or delete it outright, from `/dashboard/admin/rooms`.

**Services can be grouped into categories.** A `Service.category` field is optional — leave it blank for a standalone offering (e.g. "Haircut"), or give several services the same category (e.g. "Massage") to represent variants, each with its own name, price, and duration ("Full Body Massage", "Four-Hand Massage"). The catalog (`/dashboard/admin/services`) and every service picker in the app groups by category automatically (`lib/groupServices.js`).

## 5. Real-time notifications & audio/device alerts

`backend/src/utils/notify.js` persists every alert (delay, time's-up, additional-service request, early-end/cancellation report) to a `Notification` table, pushes it instantly over Socket.IO to whoever is connected, and sends it as a **real Web Push device notification**. The frontend (`lib/socket.js`) plays a repeating siren tone, flashes the browser tab title, and triggers a device notification for anything flagged `playSound` — and `AlertBanner.jsx` pins a dismissible on-screen banner for it too. The bell icon (`NotificationBell.jsx`) also shows notification history so nothing is lost if a device was offline.

**Web Push — alerts that reach the device even when signed out.** Unlike the Socket.IO push (which only works while the app is open and connected), Web Push is delivered by the browser's own push service straight to the phone/desktop, independent of the app's login session. Once someone grants notification permission (prompted automatically on first dashboard visit), their device stays subscribed even after they log out — that's deliberate, since a delayed-service alert or a finished-timer alert should still reach the assigned staff member's phone whether or not they're actively signed in.

To enable it, generate a VAPID keypair and add it to `backend/.env`:

```bash
cd backend
npx web-push generate-vapid-keys
```

Paste the output into `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, set `VAPID_SUBJECT` to a `mailto:` address, and restart the API. Until these are set, push sends are silently skipped — the in-app bell, Socket.IO updates, and audio alarm all keep working regardless. Someone can revoke device notifications any time from their browser's site settings; there's no in-app "turn off" toggle by design, since these are meant to be the reliable, always-on channel.

## 6. Admin tools

The Admin dashboard is now a set of **dedicated pages**, not one long scrolling page — clicking a sidebar item navigates to that page and shows only that page's content:

- **Overview** (`/dashboard/admin`) — summary only: total revenue, services in use, branch count, and a per-branch revenue breakdown.
- **Branches** (`/dashboard/admin/branches`) — add a new branch (`name`, `code`, optional `address`). Two independent controls: **Suspend/Reactivate** (`PATCH /api/branches/:id/status`) is a quick, fully reversible pause — e.g. for renovation — with no side effects and no safety checks; a suspended branch disappears from every branch list and stops taking new bookings, but nothing about it (employees, rooms, history) is touched, and reactivating brings it straight back. **Remove** is closer to real deletion, and is refused if the branch still has any employee assigned (reassign or remove them first) or a service currently in progress — a brand-new branch with no history is fully deleted, one with real history is archived instead (same reversible-by-reactivation pattern), so past reports stay intact.
- **Rooms** (`/dashboard/admin/rooms`) — three things on one page: an interactive room-analytics picker (click any room, see its live metrics — today's/all-time revenue and session counts, current occupancy, delay/cancellation/no-show/on-hold counts, via `GET /api/rooms/:roomId/analytics`), the branch-wide **on-hold customers** list (see below), and the room/roster manager itself — create rooms (with room numbers and an initial staffed service), manage the full roster, toggle a room's maintenance status, or delete a room outright (refused while it has a live session).
- **On-hold customers** — surfaced on both the Cashier dashboard and here on the Admin Rooms page (`AdminOnHoldPanel.jsx`, branch-selectable for Admin). This is deliberately a list of *customers*, not rooms: going on hold releases the room they were assigned to back to Free, so it's shown as freed on the room grid/analytics — the on-hold list is where you find and act on the customer themselves, with **Clear hold — resume here**, **Reassign** to a different available room, or **Cancel booking**.
- **Employees** (`/dashboard/admin/employees`) — every Cashier and Staff account, grouped by branch, with a delete action. An employee with historical sessions/transactions is deactivated instead of hard-deleted (to keep past reports intact) and then disappears from this list — pass `?includeInactive=true` to `GET /api/employees` to see deactivated accounts too. Deletion is refused outright if the employee has a service in progress (or a customer on hold waiting for them) right now.
- **Customers** (`/dashboard/admin/customers`) — a directory built automatically the first time someone registers a customer with a phone number (matched by `branchId + phone`; a walk-in with no phone just stays a name/phone snapshot on their session and never clutters the directory). Search by name or phone, see visit count and total spend at a glance, and open one for full visit history.
- **Services** (`/dashboard/admin/services`) — the per-branch service catalog Cashiers pick from. Each service can optionally belong to a **category** (e.g. "Massage") to group several priced/timed variants together ("Full Body Massage", "Four-Hand Massage") — leave it blank for a standalone service like "Haircut", exactly as before. Every service picker across the app (registration, quick-register, room roster assignment) groups by category automatically.
- **Payments** (`/dashboard/admin/payments`) — a dedicated, straightforward ledger of every transaction (`GET /api/payments`), filterable by branch, status (paid/unpaid/partial/refunded), date, or customer search — separate from the broader Reports module, which covers the full set of service scenarios rather than just the payment ledger. Refund directly from any row.
- **Reports** (`/dashboard/admin/reports`) — filter by branch and by date (a specific day, or **all time since launch**), and see the results as an **interactive on-screen table** before deciding to export anything. Every service scenario is tracked and shown — completed, cancelled, delayed confirmation, ended early, on hold, and **expired** (a true no-show). Financials are split into three honest categories: **received** (paid), **lost/uncollected** (a service was delivered but the payment hasn't been fully collected), and **refunded** — netted into a bottom-line total. Every row traces back to exactly who started the booking, who ended or cancelled it, who took the payment, and (if applicable) who issued the refund. A **Refund** action is available right from the table for any paid transaction (full or partial, with an optional reason). The same filtered data is available as a **Download PDF report** (`GET /api/reports/pdf`, built with `pdfkit`) — the on-screen table is always a preview of exactly what the PDF will contain, never a different view of the data.

Each page shares the same auth-check-and-branch-loading logic via `lib/useAdminSession.js`, so adding another admin page later doesn't mean re-copying that boilerplate.

## 7. Sticky sidebar, password, and language

`DashboardShell.jsx` renders a sidebar that stays fixed on screen (`position: sticky`, full height, independently scrollable) across every dashboard, with role-appropriate navigation (real routes for the Admin console, not in-page anchors), a **Change password** action (`PATCH /api/auth/change-password`), and an **English / Kiswahili** language switch (`PATCH /api/auth/language`, persisted per-user so it follows them to any device — see `lib/i18n.js`). The notification bell supports clearing a single notification or all of them (`DELETE /api/notifications/:id` / `DELETE /api/notifications`), in addition to marking as read.

## 8. Login page

Deliberately minimal — a single centered card labeled **Spa**, username + password, no marketing copy.

## 9. Auth flow

- `POST /api/auth/login` → verifies via `bcrypt.compare`, issues a JWT `{ id, username, role, branchId }` valid 12 hours. The same token authenticates both REST calls and the Socket.IO connection.
- `protect` middleware validates the `Authorization: Bearer <token>` header on every protected route and re-checks the user is still active.
- `authorize(...roles)` middleware restricts routes to specific roles.
- `restrictToOwnBranch(source)` middleware (`"query"` or `"body"`, wherever a route's `branchId` lives) enforces that a Cashier or Staff member can only ever read or act on data for the single branch an Admin assigned them to — never any other branch, no matter what a client sends. It's applied to every branch-scoped route (rooms, sessions, services, availability), and the same check is duplicated inline inside `cancelSession`, `endSession`, `confirmAdditionalService`, and `receivePayment` in `sessionController.js`, since those operate on a record by ID rather than a `branchId` query param. `GET /api/branches` only ever returns a non-admin's own branch, so the frontend never even offers a branch switcher outside the Admin console — Admins are exempt everywhere, by design, since they have full cross-branch access.

## 10. Extending the schema

`SalonArea` is already modeled for grouping rooms. Follow the existing controller/route pattern (e.g. `sessionController.js`, `roomController.js`) to extend further — per-cashier shift reports, service-duration-based scheduling, multi-day delay trend charts, etc.
