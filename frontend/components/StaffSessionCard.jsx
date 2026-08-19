"use client";

import { useEffect, useState } from "react";

function formatDuration(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * StaffSessionCard
 * One assigned session on the Staff Desk.
 *  - PENDING_ARRIVAL: "Confirm arrival" stops the 10-min countdown and
 *    starts the service timer. "Cancel" is also available here — the
 *    customer never showed up, or the booking was a mistake.
 *  - ACTIVE: live countdown to serviceEndsAt. "End service" is always
 *    available (staff can end early now, same as a cashier) — the cashier
 *    is notified either way, and it's flagged in the report if it was
 *    ended before the timer naturally finished.
 *  - COMPLETED (and no follow-up requested yet): "Add another service"
 *    notifies the cashier for confirmation.
 *
 * Props:
 *  - session, availableServices: [{ id, name, durationMins, price }]
 *  - onConfirmArrival, onCancel, onEnd: (session) => void
 *  - onRequestAdditional: (session, serviceId) => void
 *  - isBusy: boolean
 */
export default function StaffSessionCard({
  session,
  availableServices,
  onConfirmArrival,
  onCancel,
  onEnd,
  onClearHold,
  onRequestAdditional,
  isBusy,
}) {
  const [now, setNow] = useState(Date.now());
  const [showAddService, setShowAddService] = useState(false);
  const [chosenServiceId, setChosenServiceId] = useState(availableServices?.[0]?.id || "");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isPendingArrival = session.status === "PENDING_ARRIVAL";
  const isOnHold = session.status === "ON_HOLD";
  const isActive = session.status === "ACTIVE";
  const isCompleted = session.status === "COMPLETED";
  const isAwaitingCashier = session.status === "AWAITING_CASHIER";
  const hasFollowUp = (session.followUps || []).some((f) => f.status !== "CANCELLED");

  const pendingRemaining = isPendingArrival && session.pendingExpiresAt
    ? Math.floor((new Date(session.pendingExpiresAt).getTime() - now) / 1000)
    : null;
  const serviceRemaining = isActive && session.serviceEndsAt
    ? Math.floor((new Date(session.serviceEndsAt).getTime() - now) / 1000)
    : null;
  const naturallyFinished = isActive && serviceRemaining !== null && serviceRemaining <= 0;

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 p-5 shadow-soft space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-ink-950">
            {session.room?.name} <span className="text-ink-700/40 font-normal">#{session.room?.roomNumber}</span>
          </h3>
          <p className="text-xs text-ink-700/50 mt-0.5">{session.service?.name}</p>
          <p className="text-xs text-ink-700/50">{session.customerName}</p>
        </div>
        {session.delayed && (
          <span className="rounded-full bg-status-busy/10 text-status-busy text-[10px] uppercase tracking-wide px-2 py-1 font-semibold">
            Delayed
          </span>
        )}
      </div>

      {isPendingArrival && (
        <div className="rounded-lg bg-status-pending/10 px-3 py-3 text-center space-y-2">
          <p className="text-[11px] font-medium text-status-pending uppercase tracking-wide">
            Waiting for customer to arrive
          </p>
          <span className="font-display text-3xl tabular-nums text-status-pending leading-none block">
            {formatDuration(pendingRemaining ?? 0)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onCancel(session)}
              disabled={isBusy}
              className="flex-1 rounded-lg border border-status-busy/40 text-status-busy text-sm font-medium py-2 hover:bg-status-busy/5 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirmArrival(session)}
              disabled={isBusy}
              className="flex-1 rounded-lg bg-terracotta-600 text-cream-50 text-sm font-medium py-2 hover:bg-terracotta-700 transition disabled:opacity-50"
            >
              Confirm arrival
            </button>
          </div>
        </div>
      )}

      {isOnHold && (
        <div className="rounded-lg bg-status-busy/10 px-3 py-3 text-center space-y-2">
          <p className="text-[11px] font-medium text-status-busy uppercase tracking-wide">
            More than 10 minutes late — room released
          </p>
          <p className="text-xs text-ink-700/60">The customer hasn't been marked as arrived yet.</p>
          <div className="flex gap-2">
            <button
              onClick={() => onCancel(session)}
              disabled={isBusy}
              className="flex-1 rounded-lg border border-status-busy/40 text-status-busy text-sm font-medium py-2 hover:bg-status-busy/5 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onClearHold(session)}
              disabled={isBusy}
              className="flex-1 rounded-lg bg-terracotta-600 text-cream-50 text-sm font-medium py-2 hover:bg-terracotta-700 transition disabled:opacity-50"
            >
              Clear hold — resume
            </button>
          </div>
        </div>
      )}

      {isActive && (
        <div className="rounded-lg bg-status-busy/5 px-3 py-3 text-center space-y-2">
          <p className="text-[11px] font-medium text-ink-700/50 uppercase tracking-wide">
            {naturallyFinished ? "Duration complete" : "Time remaining"}
          </p>
          <span
            className={`font-display text-3xl tabular-nums leading-none block ${
              naturallyFinished ? "text-status-available" : "text-status-busy"
            }`}
          >
            {formatDuration(serviceRemaining ?? 0)}
          </span>
          <button
            onClick={() => onEnd(session)}
            disabled={isBusy}
            className={`w-full rounded-lg text-sm font-medium py-2 transition disabled:opacity-50 ${
              naturallyFinished
                ? "bg-status-available text-white hover:opacity-90"
                : "border border-ink-900/12 text-ink-800 hover:bg-ink-800/5"
            }`}
          >
            {naturallyFinished ? "Mark service finished" : "End service"}
          </button>
        </div>
      )}

      {isAwaitingCashier && (
        <div className="rounded-lg bg-brass-500/10 px-3 py-3 text-center text-xs font-medium text-brass-600 uppercase tracking-wide">
          Waiting for cashier to confirm additional service
        </div>
      )}

      {isCompleted && !hasFollowUp && (
        <div className="space-y-2">
          {!showAddService ? (
            <button
              onClick={() => setShowAddService(true)}
              className="w-full rounded-lg border border-ink-900/12 text-ink-800 text-sm font-medium py-2 hover:bg-ink-800/5 transition"
            >
              Add another service
            </button>
          ) : (
            <div className="rounded-lg border border-ink-900/12 p-3 space-y-2">
              <select
                value={chosenServiceId}
                onChange={(e) => setChosenServiceId(e.target.value)}
                className="w-full rounded-lg border border-ink-900/12 px-3 py-2 text-sm"
              >
                {(availableServices || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMins} min)
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddService(false)}
                  className="flex-1 rounded-lg border border-ink-900/12 py-2 text-sm text-ink-800 hover:bg-ink-800/5 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onRequestAdditional(session, chosenServiceId)}
                  disabled={isBusy || !chosenServiceId}
                  className="flex-1 rounded-lg bg-terracotta-600 text-cream-50 py-2 text-sm font-medium hover:bg-terracotta-700 transition disabled:opacity-50"
                >
                  Request
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
