"use client";

import { useState } from "react";
import { useLanguage } from "../lib/i18n";

/**
 * NotificationBell
 * Lives in the sticky sidebar / top bar. Purely presentational — the
 * notification stream itself is owned by DashboardShell (a single shared
 * Socket.IO connection) and passed down as props, so the bell and the
 * alarm banner never open two separate connections.
 */
export default function NotificationBell({ notifications, unreadCount, onMarkRead, onClear, onClearAll }) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  void t;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 rounded-full border border-ink-900/12 flex items-center justify-center text-ink-700/70 hover:bg-ink-800/5 hover:text-ink-950 transition"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path
            d="M6 8a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-status-busy text-[10px] leading-4 text-white text-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-xl z-50 text-ink-900">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-900/8">
            <span className="font-medium text-sm">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="text-xs text-ink-700/50 hover:text-status-busy transition"
              >
                Clear all
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-700/50 text-center">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-ink-800/10">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 text-sm flex items-start justify-between gap-2 ${n.read ? "text-ink-700/60" : "text-ink-900 bg-brass-500/5"}`}
                >
                  <div className="min-w-0 cursor-pointer" onClick={() => !n.read && onMarkRead(n.id)}>
                    <p>{n.message}</p>
                    <p className="text-[11px] text-ink-700/40 mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onClear(n.id)}
                    className="shrink-0 text-ink-700/40 hover:text-status-busy transition text-xs"
                    aria-label="Clear notification"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
