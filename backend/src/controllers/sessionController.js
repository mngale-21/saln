// ============================================================================
// Session Controller — the timer + payment + hold engine.
//
// IMPORTANT: availability is tracked per (room, service) pair, and — within
// that — a staff member can only ever be serving ONE live customer at a
// time (see isStaffBusy). A room is a physical space that can run several
// services at once, each with a different staff member and its own
// independent timer.
//
// A payment DECISION is now MANDATORY and happens UP FRONT, before any
// service timer starts: registerCustomer requires a payment type — cash,
// mobile money, card, or the explicit "unpaid" choice — and creates the
// Transaction (PAID or UNPAID accordingly) in the same database write as
// the Session itself. There is no code path that lets a session exist
// without that decision being made and recorded — a customer let through
// unpaid shows up honestly as such everywhere money is tracked (Payments,
// Reports), rather than the payment step simply being skipped. The same
// rule applies to an additional service: confirmAdditionalService is where
// its payment decision is made, and only then does its timer start.
//
// Lifecycle:
//  1. Cashier registers the customer AND confirms payment received, against
//     a (room, service) pair — or just a service, letting the system
//     auto-pick any available room/staff offering it. A Session is created
//     PAID and in PENDING_ARRIVAL, with pendingExpiresAt = now + 10 minutes
//     (the "walking to the room" countdown).
//  2. The assigned staff member confirms arrival -> stops the countdown,
//     starts the service duration timer.
//  3. If arrival isn't confirmed within 10 minutes, a background sweep
//     moves the session to ON_HOLD and — critically — releases the
//     (room, service) slot back to Free, so someone else can be booked
//     into it while this customer is late. The on-hold customer isn't
//     lost: they stay visible with a "Clear hold" action.
//  4. When the customer does show up, a Cashier/Admin (optionally
//     reassigning to a different available room/staff) or the original
//     assigned staff member (their own slot only) clears the hold, which
//     resumes the session straight into ACTIVE and starts its service
//     timer, exactly like a normal arrival confirmation.
//  5. If a hold is never cleared, the same sweep auto-closes it as EXPIRED
//     after a longer grace period — a true no-show, distinct from a
//     deliberate cancellation, and it frees the staff member for good.
//  6. Either the assigned staff member OR a cashier/admin can cancel a
//     still-pending or on-hold booking, or end an in-progress one — early
//     or on time. Whoever does it is recorded (endedById) so a report can
//     say exactly who ended a given service, and the other side is always
//     notified.
//  7. Once a service is COMPLETED, its staff member can request ONE
//     additional service for the same customer — the cashier confirms it
//     AND takes payment for it before it goes live.
//
// Every timestamp is an absolute DateTime written once and re-read fresh
// on every request — never an in-memory counter — so nothing here depends
// on any particular tab, device, or user staying logged in.
// ============================================================================

const prisma = require("../config/prismaClient");
const { notify } = require("../utils/notify");

const PENDING_ARRIVAL_MINUTES = 10;
const ON_HOLD_EXPIRE_AFTER_MINUTES = 30;
const LIVE_STATUSES = ["PENDING_ARRIVAL", "ACTIVE", "AWAITING_CASHIER"];
const PAYMENT_METHODS = ["cash", "mobile_money", "card"];
// "unpaid" isn't a real payment method — it's the explicit "let them
// through without paying yet" choice a cashier can make. It still counts
// as a deliberate decision (not a bug or an oversight): the service is
// allowed to start, but the transaction is recorded as UNPAID instead of
// PAID, so it shows up honestly everywhere money is tracked — Payments,
// Reports, the "lost/uncollected" total — as a customer who was let
// through without paying, not as a payment that was simply never taken.
const PAYMENT_TYPES = [...PAYMENT_METHODS, "unpaid"];

function minutesFromNow(mins) {
  return new Date(Date.now() + mins * 60 * 1000);
}

const SESSION_INCLUDE = {
  service: true,
  staff: { select: { id: true, firstName: true, lastName: true } },
  startedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  endedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  holdClearedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  transaction: true,
  room: true,
  customer: true,
  followUps: { select: { id: true, status: true } },
};

/** Is this staff member currently tied up with ANY live session, anywhere in the branch? */
async function isStaffBusy(staffId) {
  if (!staffId) return false;
  const existing = await prisma.session.findFirst({
    where: { staffId, status: { in: LIVE_STATUSES } },
  });
  return Boolean(existing);
}

/**
 * Finds or creates a Customer directory entry, matched by phone within the
 * branch. No phone means no directory entry — the name/phone still get
 * snapshotted directly onto the Session, but a one-off walk-in with no
 * contact info doesn't clutter the customer list.
 */
async function findOrCreateCustomer(branchId, name, phone) {
  if (!phone) return null;
  const trimmedPhone = phone.trim();
  if (!trimmedPhone) return null;

  return prisma.customer.upsert({
    where: { branchId_phone: { branchId, phone: trimmedPhone } },
    update: { name: name || undefined },
    create: { branchId, name: name || "Customer", phone: trimmedPhone },
  });
}

/**
 * POST /api/sessions
 * CASHIER/ADMIN. Body: { branchId, serviceId, customerName, customerPhone,
 * roomId?, paymentMethod, paymentAmount? }
 *
 * Every registration goes through a payment decision — paymentMethod must
 * be "cash", "mobile_money", "card", or the explicit "unpaid" choice — and
 * the Transaction is created in the same database write as the Session,
 * with status PAID for a real method or UNPAID for "unpaid". A customer is
 * never registered without that decision being made and recorded; letting
 * them through unpaid is a deliberate, visible choice, not a silent gap.
 * paymentAmount defaults to the service's list price; pass a different
 * value for a negotiated/discounted price.
 *
 * Two ways to pick where they go:
 *  - A specific room: pass roomId + serviceId. Fails if that exact
 *    (room, service) pairing's staff member is already busy.
 *  - Just a service/task: the system finds any room+staff on the roster
 *    for that service, in that branch, that isn't currently busy.
 */
async function registerCustomer(req, res) {
  try {
    const { branchId, roomId, serviceId, customerName, customerPhone, paymentMethod, paymentAmount } = req.body;

    if (!branchId || !serviceId || !customerName) {
      return res.status(400).json({ message: "branchId, serviceId and customerName are required." });
    }
    if (!PAYMENT_TYPES.includes(paymentMethod)) {
      return res.status(400).json({
        message: `A payment decision is required before the service can start. Choose a payment type (${PAYMENT_TYPES.join(", ")}).`,
      });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ message: "Branch not found." });
    if (!branch.isActive) {
      return res.status(409).json({ message: "This branch is suspended and isn't taking bookings right now." });
    }

    let assignment;
    let room;

    if (roomId) {
      room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return res.status(404).json({ message: "Room not found." });
      if (room.status === "MAINTENANCE") {
        return res.status(409).json({ message: "This room is under maintenance and can't take bookings." });
      }
      assignment = await prisma.roomAssignment.findUnique({
        where: { roomId_serviceId: { roomId, serviceId } },
        include: { staff: true, service: true },
      });
      if (!assignment) {
        return res.status(400).json({
          message: "No staff member is assigned to that service in this room. Ask an admin to assign one first.",
        });
      }
      if (await isStaffBusy(assignment.staffId)) {
        return res.status(409).json({
          message: `${assignment.staff.firstName} is already busy with another customer right now.`,
        });
      }
    } else {
      const candidates = await prisma.roomAssignment.findMany({
        where: { serviceId, room: { branchId, status: { not: "MAINTENANCE" } } },
        include: { staff: true, room: true, service: true },
        orderBy: { room: { roomNumber: "asc" } },
      });
      if (candidates.length === 0) {
        return res.status(400).json({ message: "No room offers this service yet — ask an admin to assign one." });
      }
      for (const candidate of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await isStaffBusy(candidate.staffId))) {
          assignment = candidate;
          room = candidate.room;
          break;
        }
      }
      if (!assignment) {
        return res.status(409).json({
          message: "Every staff member offering this service is busy right now across all rooms. Please wait or pick a different service.",
        });
      }
    }

    const customer = await findOrCreateCustomer(branchId, customerName, customerPhone);
    const amount = paymentAmount != null ? Number(paymentAmount) : Number(assignment.service.price);
    if (!(amount > 0)) {
      return res.status(400).json({ message: "Payment amount must be greater than zero." });
    }

    const now = new Date();
    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          branchId: room.branchId,
          roomId: room.id,
          serviceId,
          staffId: assignment.staffId,
          startedById: req.user.id,
          customerId: customer?.id || null,
          customerName,
          customerPhone: customerPhone || null,
          status: "PENDING_ARRIVAL",
          registeredAt: now,
          pendingExpiresAt: minutesFromNow(PENDING_ARRIVAL_MINUTES),
        },
      });
      await tx.transaction.create({
        data: {
          branchId: room.branchId,
          sessionId: created.id,
          cashierId: req.user.id,
          amount,
          status: paymentMethod === "unpaid" ? "UNPAID" : "PAID",
          method: paymentMethod === "unpaid" ? null : paymentMethod,
        },
      });
      return tx.session.findUnique({ where: { id: created.id }, include: SESSION_INCLUDE });
    });

    const io = req.app.get("io");
    await notify(io, {
      branchId: room.branchId,
      userId: assignment.staffId,
      type: "GENERAL",
      message: `${customerName} has been registered and paid for ${room.name} (${session.service?.name || "service"}) — please confirm when they arrive.`,
      sessionId: session.id,
      playSound: true,
    });
    io?.to(`branch:${room.branchId}`).emit("session:update", { roomId: room.id });

    return res.status(201).json({
      message:
        paymentMethod === "unpaid"
          ? `${customerName} registered as UNPAID in ${room.name} with ${assignment.staff.firstName} — this will show as uncollected in Payments and Reports. 10-minute arrival countdown started.`
          : `Payment confirmed. ${customerName} registered in ${room.name} with ${assignment.staff.firstName}. 10-minute arrival countdown started.`,
      session,
    });
  } catch (error) {
    console.error("registerCustomer error:", error);
    return res.status(500).json({ message: "Server error registering the customer." });
  }
}

/**
 * GET /api/services/:serviceId/availability?branchId=...
 */
async function getServiceAvailability(req, res) {
  try {
    const { serviceId } = req.params;
    const { branchId } = req.query;
    if (!branchId) return res.status(400).json({ message: "branchId query param is required." });

    const assignments = await prisma.roomAssignment.findMany({
      where: { serviceId, room: { branchId } },
      include: { staff: { select: { id: true, firstName: true, lastName: true } }, room: true },
      orderBy: { room: { roomNumber: "asc" } },
    });

    const results = await Promise.all(
      assignments.map(async (a) => ({
        assignmentId: a.id,
        room: a.room,
        staff: a.staff,
        available: a.room.status !== "MAINTENANCE" && !(await isStaffBusy(a.staffId)),
      }))
    );

    return res.status(200).json({ options: results });
  } catch (error) {
    console.error("getServiceAvailability error:", error);
    return res.status(500).json({ message: "Server error checking availability." });
  }
}

/**
 * POST /api/sessions/:id/confirm-arrival
 * STAFF (must be the assigned staff, or ADMIN). Stops the countdown —
 * even if time remained — and starts the service duration timer.
 */
async function confirmArrival(req, res) {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id }, include: { service: true, room: true } });
    if (!session) return res.status(404).json({ message: "Session not found." });

    if (session.status !== "PENDING_ARRIVAL") {
      return res.status(409).json({ message: "This session is not awaiting arrival confirmation." });
    }
    if (req.user.role === "STAFF" && session.staffId !== req.user.id) {
      return res.status(403).json({ message: "Only the assigned staff member can confirm this session." });
    }

    const now = new Date();
    const durationMins = session.service?.durationMins ?? 30;

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: "ACTIVE",
        arrivalConfirmedAt: now,
        serviceEndsAt: new Date(now.getTime() + durationMins * 60 * 1000),
      },
      include: SESSION_INCLUDE,
    });

    const io = req.app.get("io");
    io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });

    return res.status(200).json({ message: "Arrival confirmed. Service timer started.", session: updated });
  } catch (error) {
    console.error("confirmArrival error:", error);
    return res.status(500).json({ message: "Server error confirming arrival." });
  }
}

/**
 * POST /api/sessions/:id/clear-hold
 * CASHIER/ADMIN (may reassign to a different room/service via optional
 * { roomId, serviceId } in the body), or the ORIGINAL assigned STAFF member
 * (may only resume their own original slot — no reassignment). The
 * customer showed up after all: this resumes the session straight into
 * ACTIVE, exactly like a normal arrival confirmation.
 */
async function clearHold(req, res) {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id }, include: { room: true } });
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (session.status !== "ON_HOLD") {
      return res.status(409).json({ message: "This session isn't on hold." });
    }
    if (req.user.role !== "ADMIN" && session.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only act on sessions in your own branch." });
    }

    let targetRoomId = session.roomId;
    let targetServiceId = session.serviceId;

    if (req.user.role === "STAFF") {
      if (session.staffId !== req.user.id) {
        return res.status(403).json({ message: "Only the originally assigned staff member can clear this hold." });
      }
      // Staff may only resume their own original slot — no reassignment.
    } else {
      if (req.body?.roomId) targetRoomId = req.body.roomId;
      if (req.body?.serviceId) targetServiceId = req.body.serviceId;
    }

    const assignment = await prisma.roomAssignment.findUnique({
      where: { roomId_serviceId: { roomId: targetRoomId, serviceId: targetServiceId } },
      include: { staff: true, service: true, room: true },
    });
    if (!assignment) {
      return res.status(400).json({ message: "No staff member is assigned to that service in that room." });
    }
    if (assignment.room.status === "MAINTENANCE") {
      return res.status(409).json({ message: "That room is under maintenance right now." });
    }
    if (await isStaffBusy(assignment.staffId)) {
      return res.status(409).json({
        message: `${assignment.staff.firstName} is currently busy with another customer — choose a different room or wait.`,
      });
    }

    const now = new Date();
    const durationMins = assignment.service?.durationMins ?? 30;

    const updated = await prisma.session.update({
      where: { id },
      data: {
        roomId: targetRoomId,
        serviceId: targetServiceId,
        staffId: assignment.staffId,
        status: "ACTIVE",
        holdClearedAt: now,
        holdClearedById: req.user.id,
        arrivalConfirmedAt: now,
        serviceEndsAt: new Date(now.getTime() + durationMins * 60 * 1000),
      },
      include: SESSION_INCLUDE,
    });

    const io = req.app.get("io");
    const reassigned = targetRoomId !== session.roomId;
    await notify(io, {
      branchId: session.branchId,
      userId: assignment.staffId,
      type: "SESSION_HOLD_CLEARED",
      message: `${session.customerName || "The customer"} has arrived — service resumed${reassigned ? ` in ${assignment.room.name}` : ""}.`,
      sessionId: session.id,
    });
    io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });
    if (reassigned) io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: targetRoomId });

    return res.status(200).json({ message: "Hold cleared. Service resumed.", session: updated });
  } catch (error) {
    console.error("clearHold error:", error);
    return res.status(500).json({ message: "Server error clearing the hold." });
  }
}

/**
 * GET /api/sessions?branchId=...&mine=true
 * `mine=true` (used by the Staff Desk) filters to sessions where the
 * current user is the assigned staff member.
 */
async function listSessions(req, res) {
  try {
    const { branchId, mine } = req.query;
    if (!branchId) return res.status(400).json({ message: "branchId query param is required." });

    const recentCutoff = new Date(Date.now() - 60 * 60 * 1000); // last hour
    const where = {
      branchId,
      OR: [
        { status: { in: [...LIVE_STATUSES, "ON_HOLD"] } },
        { status: "COMPLETED", updatedAt: { gte: recentCutoff } },
      ],
    };
    if (mine === "true") where.staffId = req.user.id;

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: SESSION_INCLUDE,
    });

    return res.status(200).json({ sessions });
  } catch (error) {
    console.error("listSessions error:", error);
    return res.status(500).json({ message: "Server error fetching sessions." });
  }
}

/**
 * POST /api/sessions/:id/additional-service
 * STAFF/ADMIN. Body: { serviceId }
 * Only allowed once the current session has finished (status COMPLETED).
 * No payment is taken here — that happens when the cashier confirms it.
 */
async function requestAdditionalService(req, res) {
  try {
    const { id } = req.params;
    const { serviceId } = req.body;
    if (!serviceId) return res.status(400).json({ message: "serviceId is required." });

    const original = await prisma.session.findUnique({ where: { id }, include: { room: true } });
    if (!original) return res.status(404).json({ message: "Session not found." });

    if (original.status !== "COMPLETED") {
      return res.status(409).json({
        message: "You can only add another service after the current service has finished.",
      });
    }
    if (req.user.role === "STAFF" && original.staffId !== req.user.id) {
      return res.status(403).json({ message: "Only the assigned staff member can request this." });
    }

    const existingFollowUp = await prisma.session.findFirst({
      where: { parentSessionId: original.id, status: { not: "CANCELLED" } },
    });
    if (existingFollowUp) {
      return res.status(409).json({ message: "An additional service has already been requested for this visit." });
    }

    const assignment = await prisma.roomAssignment.findUnique({
      where: { roomId_serviceId: { roomId: original.roomId, serviceId } },
    });
    if (!assignment) {
      return res.status(400).json({ message: "No staff member is assigned to that service in this room." });
    }
    if (await isStaffBusy(assignment.staffId)) {
      return res.status(409).json({ message: "That staff member is currently busy with another customer." });
    }

    const followUp = await prisma.session.create({
      data: {
        branchId: original.branchId,
        roomId: original.roomId,
        serviceId,
        staffId: assignment.staffId,
        startedById: req.user.id,
        customerId: original.customerId,
        customerName: original.customerName,
        customerPhone: original.customerPhone,
        parentSessionId: original.id,
        status: "AWAITING_CASHIER",
      },
      include: SESSION_INCLUDE,
    });

    const io = req.app.get("io");
    await notify(io, {
      branchId: original.branchId,
      targetRole: "CASHIER",
      type: "ADDITIONAL_SERVICE_REQUEST",
      message: `${original.customerName || "Customer"} in ${original.room.name} would like an additional service — please confirm and take payment before it starts.`,
      sessionId: followUp.id,
      playSound: true,
    });
    io?.to(`branch:${original.branchId}`).emit("session:update", { roomId: original.roomId });

    return res.status(201).json({ message: "Additional service requested. Cashier notified for payment confirmation.", session: followUp });
  } catch (error) {
    console.error("requestAdditionalService error:", error);
    return res.status(500).json({ message: "Server error requesting the additional service." });
  }
}

/**
 * POST /api/sessions/:id/confirm-additional
 * CASHIER/ADMIN. Body: { paymentMethod, paymentAmount? }
 * This is the button staff's "Add another service" request turns into for
 * the cashier: confirming it always means making a payment decision first
 * — "cash" / "mobile_money" / "card", or the explicit "unpaid" choice if
 * the customer is being let through without paying (recorded as such, not
 * silently skipped). The customer is already physically present, so this
 * moves straight to ACTIVE once that decision is recorded.
 */
async function confirmAdditionalService(req, res) {
  try {
    const { id } = req.params;
    const { paymentMethod, paymentAmount } = req.body || {};
    if (!PAYMENT_TYPES.includes(paymentMethod)) {
      return res.status(400).json({
        message: `A payment decision is required before this service can start. Choose a payment type (${PAYMENT_TYPES.join(", ")}).`,
      });
    }

    const session = await prisma.session.findUnique({ where: { id }, include: { service: true } });
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (req.user.role !== "ADMIN" && session.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only act on sessions in your own branch." });
    }
    if (session.status !== "AWAITING_CASHIER") {
      return res.status(409).json({ message: "This session is not awaiting cashier confirmation." });
    }

    const amount = paymentAmount != null ? Number(paymentAmount) : Number(session.service?.price || 0);
    if (!(amount > 0)) {
      return res.status(400).json({ message: "Payment amount must be greater than zero." });
    }

    const now = new Date();
    const durationMins = session.service?.durationMins ?? 30;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          branchId: session.branchId,
          sessionId: session.id,
          cashierId: req.user.id,
          amount,
          status: paymentMethod === "unpaid" ? "UNPAID" : "PAID",
          method: paymentMethod === "unpaid" ? null : paymentMethod,
        },
      });
      return tx.session.update({
        where: { id },
        data: {
          status: "ACTIVE",
          arrivalConfirmedAt: now,
          serviceEndsAt: new Date(now.getTime() + durationMins * 60 * 1000),
        },
        include: SESSION_INCLUDE,
      });
    });

    const io = req.app.get("io");
    io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });

    return res.status(200).json({
      message:
        paymentMethod === "unpaid"
          ? "Additional service started as UNPAID — it will show as uncollected in Payments and Reports."
          : "Payment confirmed. Additional service started.",
      session: updated,
    });
  } catch (error) {
    console.error("confirmAdditionalService error:", error);
    return res.status(500).json({ message: "Server error confirming the additional service." });
  }
}

/**
 * POST /api/sessions/:id/cancel
 * CASHIER/ADMIN, or the assigned STAFF member. For a booking that hasn't
 * started yet — PENDING_ARRIVAL or ON_HOLD. Since payment is taken up
 * front, a paid booking that gets cancelled will usually need a refund —
 * the cashier/admin is pointed at that explicitly.
 */
async function cancelSession(req, res) {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: { room: true, service: true, transaction: true },
    });
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (req.user.role !== "ADMIN" && session.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only act on sessions in your own branch." });
    }

    if (!["PENDING_ARRIVAL", "ON_HOLD"].includes(session.status)) {
      return res.status(409).json({ message: "Only a booking that hasn't started yet can be cancelled — use End service instead." });
    }
    if (req.user.role === "STAFF" && session.staffId !== req.user.id) {
      return res.status(403).json({ message: "Only the assigned staff member can cancel this session." });
    }

    const updated = await prisma.session.update({
      where: { id },
      data: { status: "CANCELLED", endedAt: new Date(), endedById: req.user.id },
      include: SESSION_INCLUDE,
    });

    const io = req.app.get("io");
    const actorLabel = req.user.role === "STAFF" ? "the assigned staff member" : "the cashier";
    const paidNote = session.transaction?.status === "PAID" ? " Payment was already collected — a refund may be owed." : "";
    await notify(io, {
      branchId: session.branchId,
      targetRole: req.user.role === "STAFF" ? "CASHIER" : undefined,
      userId: req.user.role !== "STAFF" ? session.staffId : undefined,
      type: "SESSION_CANCELLED",
      message: `${session.customerName || "A customer"}'s booking for ${session.service?.name || "a service"} in ${session.room.name} was cancelled by ${actorLabel}.${paidNote}`,
      sessionId: session.id,
    });
    io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });

    return res.status(200).json({ message: "Booking cancelled." + paidNote, session: updated });
  } catch (error) {
    console.error("cancelSession error:", error);
    return res.status(500).json({ message: "Server error cancelling the session." });
  }
}

/**
 * POST /api/sessions/:id/end
 * CASHIER, ADMIN, or the assigned STAFF member — any of the three can end
 * a service, at any time, early or on schedule. Payment was already taken
 * up front, so this never creates a new Transaction — it just closes out
 * the session and flags endedEarly when stopped before the natural
 * duration, always recording exactly who (endedById) did it.
 */
async function endSession(req, res) {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id }, include: { service: true, room: true } });
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (req.user.role !== "ADMIN" && session.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only act on sessions in your own branch." });
    }
    if (!["ACTIVE", "PENDING_ARRIVAL", "ON_HOLD", "AWAITING_CASHIER"].includes(session.status)) {
      return res.status(409).json({ message: "This session cannot be ended from its current state." });
    }
    if (req.user.role === "STAFF" && session.staffId !== req.user.id) {
      return res.status(403).json({ message: "Only the assigned staff member can end this session." });
    }

    const now = new Date();
    const wasEndedEarly = session.status === "ACTIVE" && session.serviceEndsAt && now < session.serviceEndsAt;

    const updatedSession = await prisma.session.update({
      where: { id },
      data: { status: "COMPLETED", endedAt: now, endedById: req.user.id, endedEarly: wasEndedEarly },
      include: SESSION_INCLUDE,
    });

    const io = req.app.get("io");
    const actorLabel =
      req.user.role === "STAFF"
        ? `staff member ${req.user.firstName || ""}`.trim()
        : req.user.role === "ADMIN"
        ? "an admin"
        : "the cashier";

    if (req.user.role === "STAFF") {
      await notify(io, {
        branchId: session.branchId,
        targetRole: "CASHIER",
        type: wasEndedEarly ? "SESSION_ENDED_EARLY" : "GENERAL",
        message: `${session.room.name}: ${actorLabel} ${wasEndedEarly ? "ended early" : "finished"} the service for ${session.customerName || "a customer"}.`,
        sessionId: session.id,
        playSound: wasEndedEarly,
      });
    } else if (session.staffId) {
      await notify(io, {
        branchId: session.branchId,
        userId: session.staffId,
        type: wasEndedEarly ? "SESSION_ENDED_EARLY" : "GENERAL",
        message: `${session.room.name}: ${actorLabel} ended the service for ${session.customerName || "a customer"}${wasEndedEarly ? " before it was finished" : ""}.`,
        sessionId: session.id,
        playSound: wasEndedEarly,
      });
    }

    if (wasEndedEarly) {
      const minutesShort = Math.round((session.serviceEndsAt.getTime() - now.getTime()) / 60000);
      await notify(io, {
        branchId: session.branchId,
        targetRole: "ADMIN",
        type: "SESSION_ENDED_EARLY",
        message: `${session.room.name}: service for ${session.customerName || "a customer"} was ended ${minutesShort} min early by ${actorLabel}. Consider a partial refund.`,
        sessionId: session.id,
      });
    }
    io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });

    return res.status(200).json({
      message: wasEndedEarly ? "Session ended early. Reported to the admin." : "Session ended.",
      session: updatedSession,
    });
  } catch (error) {
    console.error("endSession error:", error);
    return res.status(500).json({ message: "Server error ending the session." });
  }
}

/**
 * POST /api/rooms/transactions/:transactionId/pay
 * Kept as a manual safety-net for the rare UNPAID/PARTIAL transaction (e.g.
 * an admin correction) — not part of the normal flow anymore now that
 * payment happens up front at registration.
 */
async function receivePayment(req, res) {
  try {
    const { transactionId } = req.params;
    const { method } = req.body;

    const existing = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { session: true },
    });
    if (!existing) return res.status(404).json({ message: "Transaction not found." });
    if (req.user.role !== "ADMIN" && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only act on transactions in your own branch." });
    }

    const transaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "PAID", method: method || "cash" },
    });

    const io = req.app.get("io");
    io?.to(`branch:${existing.branchId}`).emit("session:update", { roomId: existing.session.roomId });

    return res.status(200).json({ message: "Payment received.", transaction });
  } catch (error) {
    console.error("receivePayment error:", error);
    return res.status(500).json({ message: "Server error recording payment." });
  }
}

/**
 * POST /api/rooms/transactions/:transactionId/refund
 * CASHIER/ADMIN. Body: { amount?, reason? }
 * Only allowed on a PAID transaction. Records who issued it, when, how
 * much (defaults to the full original amount), and why.
 */
async function refundTransaction(req, res) {
  try {
    const { transactionId } = req.params;
    const { amount, reason } = req.body || {};

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { session: { include: { room: true } } },
    });
    if (!transaction) return res.status(404).json({ message: "Transaction not found." });
    if (req.user.role !== "ADMIN" && transaction.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only act on transactions in your own branch." });
    }
    if (transaction.status !== "PAID") {
      return res.status(409).json({ message: "Only a paid transaction can be refunded." });
    }

    const refundAmount = amount != null ? Number(amount) : Number(transaction.amount);
    if (!(refundAmount > 0) || refundAmount > Number(transaction.amount)) {
      return res.status(400).json({ message: "Refund amount must be greater than zero and no more than the original payment." });
    }

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "REFUNDED",
        refundAmount,
        refundReason: reason || null,
        refundedAt: new Date(),
        refundedById: req.user.id,
      },
    });

    const io = req.app.get("io");
    await notify(io, {
      branchId: transaction.branchId,
      targetRole: "ADMIN",
      type: "REFUND_ISSUED",
      message: `A refund of TZS ${refundAmount.toLocaleString()} was issued for ${transaction.session.customerName || "a customer"} in ${transaction.session.room.name}.`,
      sessionId: transaction.sessionId,
    });

    return res.status(200).json({ message: "Refund recorded.", transaction: updated });
  } catch (error) {
    console.error("refundTransaction error:", error);
    return res.status(500).json({ message: "Server error recording the refund." });
  }
}

/**
 * Background sweep — called on an interval from server.js. Three jobs:
 *  1. PENDING_ARRIVAL past its 10-minute window -> ON_HOLD, releasing the
 *     (room, service) slot back to Free. Alarm to staff/cashier/admin.
 *  2. ACTIVE session whose duration naturally reached zero -> "time's up"
 *     alarm, so a finished service is never silently unattended.
 *  3. ON_HOLD for longer than ON_HOLD_EXPIRE_AFTER_MINUTES and never
 *     cleared -> EXPIRED, a true no-show, closed for good.
 */
async function checkForDelays(io) {
  const now = new Date();

  try {
    const overdue = await prisma.session.findMany({
      where: { status: "PENDING_ARRIVAL", pendingExpiresAt: { lt: now } },
      include: { room: true, service: true },
    });

    for (const session of overdue) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: "ON_HOLD", delayed: true, holdStartedAt: now },
      });

      const message = `${session.customerName || "A customer"} is more than ${PENDING_ARRIVAL_MINUTES} minutes late for ${session.service?.name || "their service"} in ${session.room.name} — moved to On-Hold and the room has been released.`;

      if (session.staffId) {
        // eslint-disable-next-line no-await-in-loop
        await notify(io, {
          branchId: session.branchId,
          userId: session.staffId,
          type: "SESSION_ON_HOLD",
          message,
          sessionId: session.id,
          playSound: true,
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await notify(io, {
        branchId: session.branchId,
        userId: session.startedById,
        type: "SESSION_ON_HOLD",
        message,
        sessionId: session.id,
        playSound: true,
      });
      // eslint-disable-next-line no-await-in-loop
      await notify(io, {
        branchId: session.branchId,
        targetRole: "ADMIN",
        type: "SESSION_ON_HOLD",
        message,
        sessionId: session.id,
        playSound: true,
      });

      io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });
    }
  } catch (error) {
    console.error("checkForDelays (on-hold) error:", error);
  }

  try {
    const justFinished = await prisma.session.findMany({
      where: { status: "ACTIVE", finishedAlertSent: false, serviceEndsAt: { lt: now } },
      include: { room: true, service: true },
    });

    for (const session of justFinished) {
      await prisma.session.update({ where: { id: session.id }, data: { finishedAlertSent: true } });

      const message = `Time's up: ${session.service?.name || "the service"} for ${session.customerName || "a customer"} in ${session.room.name} has reached its scheduled duration.`;

      if (session.staffId) {
        // eslint-disable-next-line no-await-in-loop
        await notify(io, {
          branchId: session.branchId,
          userId: session.staffId,
          type: "SERVICE_TIME_FINISHED",
          message,
          sessionId: session.id,
          playSound: true,
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await notify(io, {
        branchId: session.branchId,
        targetRole: "CASHIER",
        type: "SERVICE_TIME_FINISHED",
        message,
        sessionId: session.id,
        playSound: true,
      });

      io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });
    }
  } catch (error) {
    console.error("checkForDelays (finished) error:", error);
  }

  try {
    const expiryThreshold = new Date(now.getTime() - ON_HOLD_EXPIRE_AFTER_MINUTES * 60 * 1000);
    const noShows = await prisma.session.findMany({
      where: { status: "ON_HOLD", holdStartedAt: { lt: expiryThreshold } },
      include: { room: true, service: true, transaction: true },
    });

    for (const session of noShows) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: "EXPIRED", endedAt: now },
      });

      const paidNote = session.transaction?.status === "PAID" ? " Payment was already collected — a refund may be owed." : "";
      const message = `${session.customerName || "A customer"}'s on-hold booking for ${session.service?.name || "a service"} in ${session.room.name} expired — never cleared within ${ON_HOLD_EXPIRE_AFTER_MINUTES} minutes.${paidNote}`;

      if (session.staffId) {
        // eslint-disable-next-line no-await-in-loop
        await notify(io, {
          branchId: session.branchId,
          userId: session.staffId,
          type: "SESSION_EXPIRED",
          message,
          sessionId: session.id,
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await notify(io, {
        branchId: session.branchId,
        targetRole: "ADMIN",
        type: "SESSION_EXPIRED",
        message,
        sessionId: session.id,
      });

      io?.to(`branch:${session.branchId}`).emit("session:update", { roomId: session.roomId });
    }
  } catch (error) {
    console.error("checkForDelays (expire) error:", error);
  }
}

module.exports = {
  registerCustomer,
  getServiceAvailability,
  confirmArrival,
  clearHold,
  listSessions,
  requestAdditionalService,
  confirmAdditionalService,
  cancelSession,
  endSession,
  receivePayment,
  refundTransaction,
  checkForDelays,
};
