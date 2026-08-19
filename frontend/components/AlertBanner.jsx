"use client";

/**
 * AlertBanner
 * A hard-to-miss strip pinned under the top bar whenever there's an
 * un-dismissed alarm (delayed service or a service's time finishing) —
 * pairs with the audio siren + tab-title flash in lib/socket.js so the
 * alert is both heard and seen. Purely presentational; DashboardShell
 * decides which notification (if any) to show here.
 */
export default function AlertBanner({ notification, onDismiss }) {
  if (!notification) return null;

  const isDelay = notification.type === "DELAYED_SERVICE";

  return (
    <div
      className={`flex items-center justify-between gap-4 px-6 py-3 text-sm font-medium text-white ${
        isDelay ? "bg-status-busy" : "bg-brass-600"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cream-50" />
        </span>
        <span>{notification.message}</span>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-lg border border-white/30 px-3 py-1 text-xs hover:bg-white/10 transition"
      >
        Dismiss
      </button>
    </div>
  );
}
