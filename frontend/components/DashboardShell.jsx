"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { clearSession } from "../lib/auth";
import { useLanguage } from "../lib/i18n";
import { useNotifications } from "../lib/socket";
import { registerForPushNotifications } from "../lib/push";
import NotificationBell from "./NotificationBell";
import ChangePasswordModal from "./ChangePasswordModal";
import AlertBanner from "./AlertBanner";

const ICONS = {
  overview: (
    <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z" strokeWidth="0" fill="currentColor" />
  ),
  rooms: (
    <path
      d="M4 21V7l8-4 8 4v14M9 21v-6h6v6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  employees: (
    <path
      d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  services: (
    <path
      d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 2z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  branches: (
    <path
      d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01M9 8h.01M15 8h.01"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  reports: (
    <path
      d="M9 17V9m6 8V5m-3 12v-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  customers: (
    <path
      d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  payments: (
    <path
      d="M2 9h20M6 15h4M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
};

const NAV_ITEMS = {
  ADMIN: [
    { key: "roomGrid", icon: "overview", label: "Overview", href: "/dashboard/admin" },
    { key: "branches", icon: "branches", label: "Branches", href: "/dashboard/admin/branches" },
    { key: "rooms", icon: "rooms", label: "Rooms", href: "/dashboard/admin/rooms" },
    { key: "employees", icon: "employees", label: "Employees", href: "/dashboard/admin/employees" },
    { key: "customers", icon: "customers", label: "Customers", href: "/dashboard/admin/customers" },
    { key: "services", icon: "services", label: "Services", href: "/dashboard/admin/services" },
    { key: "payments", icon: "payments", label: "Payments", href: "/dashboard/admin/payments" },
    { key: "reports", icon: "reports", label: "Reports", href: "/dashboard/admin/reports" },
  ],
  CASHIER: [{ key: "roomGrid", icon: "rooms", label: "Room Grid", href: "/dashboard/cashier" }],
  STAFF: [{ key: "staffDesk", icon: "overview", label: "Staff Desk", href: "/dashboard/staff" }],
};

/**
 * DashboardShell
 * Sticky/floating sidebar + top bar layout shared by every dashboard. The
 * sidebar stays fixed on screen so Rooms / Employees / Reports and the
 * account controls (password, language) are always one click away, no
 * matter how far the page content scrolls. Also owns the single shared
 * notification stream (one Socket.IO connection) used by both the bell and
 * the loud alarm banner for delays / finished-service alerts.
 *
 * Props:
 *  - user: current user object ({ firstName, lastName, role, branchName })
 *  - title: page title shown in the top bar
 *  - actions: optional React node rendered on the right of the top bar
 *  - children: page content
 */
export default function DashboardShell({ user, title, actions, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const { notifications, unreadCount, markRead, clearNotification, clearAll, requestPermission } = useNotifications();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dismissedAlarmIds, setDismissedAlarmIds] = useState([]);

  const navItems = NAV_ITEMS[user?.role] || [];
  const isAdmin = user?.role === "ADMIN";
  const isStaff = user?.role === "STAFF";
  const roleAccent = isAdmin ? "text-brass-400" : "text-status-available";
  const roleBadgeBg = isAdmin
    ? "bg-brass-500/20 border-brass-400/40 text-brass-400"
    : "bg-status-available/15 border-status-available/40 text-status-available";
  const consoleLabel = isAdmin ? t("adminConsole") : isStaff ? t("staffDesk") : t("roomGrid");

  useEffect(() => {
    requestPermission();
    // Registers this device for real push notifications — delivered even
    // when the app isn't open, and kept active across logout on purpose.
    registerForPushNotifications();
  }, [requestPermission]);

  // The most recent unread, un-dismissed alarm-worthy notification — shown
  // as a loud, pinned banner in addition to the audio siren + bell entry.
  const activeAlarm = useMemo(() => {
    return (
      notifications.find(
        (n) =>
          !n.read &&
          !dismissedAlarmIds.includes(n.id) &&
          (n.type === "DELAYED_SERVICE" || n.type === "SERVICE_TIME_FINISHED")
      ) || null
    );
  }, [notifications, dismissedAlarmIds]);

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  function isActiveNav(href) {
    // "/dashboard/admin" must match exactly (Overview), everything else
    // matches on prefix so a page never mistakenly appears active for
    // Overview too.
    if (href === "/dashboard/admin") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebarContent = (
    <>
      <div>
        <div className="px-6 py-6 border-b border-white/10">
          <span className={`text-xs uppercase tracking-[0.25em] ${roleAccent}`}>Salon System</span>
          <p className="font-display text-lg mt-1">{consoleLabel}</p>
          <span
            className={`inline-block mt-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${roleBadgeBg}`}
          >
            {isAdmin ? "Full access" : "Branch-level access"}
          </span>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = isActiveNav(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-white/10 text-white font-medium"
                    : "text-sage-100/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
                  {ICONS[item.icon]}
                </svg>
                {t(item.key) !== item.key ? t(item.key) : item.label}
              </Link>
            );
          })}
        </nav>

        {/* Account controls — always reachable, any role */}
        <div className="px-3 pt-2 space-y-1 border-t border-white/10 mt-2">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full text-left rounded-lg px-3 py-2.5 text-sm text-sage-100/80 hover:bg-white/5 hover:text-white transition"
          >
            {t("changePassword")}
          </button>
          <div className="px-3 py-2.5">
            <p className="text-xs text-sage-100/50 mb-1.5">{t("language")}</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setLanguage("en")}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  language === "en"
                    ? "border-brass-400 bg-brass-500/15 text-brass-300"
                    : "border-white/15 text-sage-100/70 hover:bg-white/5"
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLanguage("sw")}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  language === "sw"
                    ? "border-brass-400 bg-brass-500/15 text-brass-300"
                    : "border-white/15 text-sage-100/70 hover:bg-white/5"
                }`}
              >
                Kiswahili
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className={`h-9 w-9 rounded-full border flex items-center justify-center font-medium text-sm ${roleBadgeBg}`}>
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-sage-100/50 capitalize">{user?.role?.toLowerCase()}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm text-sage-100/80 hover:bg-white/5 hover:text-white transition"
        >
          {t("signOut")}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-cream-100">
      {/* Sticky sidebar — stays on screen while the main column scrolls */}
      <aside className="hidden md:flex w-60 flex-col justify-between bg-gradient-to-b from-ink-900 to-ink-950 text-sage-50 shrink-0 sticky top-0 h-screen overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-72 flex flex-col justify-between bg-gradient-to-b from-ink-900 to-ink-950 text-sage-50 h-full overflow-y-auto">
            {sidebarContent}
          </div>
          <button
            className="flex-1 bg-ink-950/40"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          />
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4 border-b border-ink-900/8 bg-cream-50/80 backdrop-blur px-4 md:px-6 py-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden h-9 w-9 rounded-lg border border-ink-900/12 flex items-center justify-center text-ink-700 shrink-0"
              aria-label="Open menu"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xl md:text-2xl text-ink-950 truncate">{title}</h1>
              {user?.branchName && <p className="text-sm text-ink-700/60">{user.branchName} branch</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {actions}
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onClear={clearNotification}
              onClearAll={clearAll}
            />
          </div>
        </header>

        <AlertBanner
          notification={activeAlarm}
          onDismiss={() => {
            if (activeAlarm) {
              markRead(activeAlarm.id);
              setDismissedAlarmIds((prev) => [...prev, activeAlarm.id]);
            }
          }}
        />

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}
