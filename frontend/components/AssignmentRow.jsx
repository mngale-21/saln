"use client";

import { useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";

function formatDuration(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * AssignmentRow
 * One (service, staff) line inside a room. A room can run several of these
 * at once, each fully independent — e.g. a Massage with Staff A can be
 * mid-timer while a Manicure with Staff B in the same room hasn't started
 * yet. All timers here are absolute-timestamp based, same as everywhere
 * else in the system.
 *
 * Props:
 *  - assignment: { id, staff, service, currentSession }
 *  - roomUnderMaintenance: boolean
 *  - onRegister, onCancel, onEnd, onReceivePayment, onConfirmAdditional: (assignment) => void
 *  - isBusy: boolean — disables buttons mid-request
 */
export default function AssignmentRow({
  assignment,
  roomUnderMaintenance,
  onRegister,
  onCancel,
  onEnd,
  onReceivePayment,
  onConfirmAdditional,
  isBusy,
}) {
  const session = assignment.currentSession;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isPendingArrival = session?.status === "PENDING_ARRIVAL";
  const isActive = session?.status === "ACTIVE";
  const isAwaitingCashier = session?.status === "AWAITING_CASHIER";
  const isAwaitingPayment =
    session?.status === "COMPLETED" && ["UNPAID", "PARTIAL"].includes(session?.transaction?.status);
  const busyElsewhere = !session && assignment.staffBusyElsewhere;

  const badgeStatus = roomUnderMaintenance
    ? "MAINTENANCE"
    : isPendingArrival
    ? "PENDING"
    : isActive
    ? "BUSY"
    : isAwaitingCashier
    ? "AWAITING_CASHIER"
    : isAwaitingPayment
    ? "AWAITING_PAYMENT"
    : busyElsewhere
    ? "BUSY_ELSEWHERE"
    : "AVAILABLE";

  const pendingRemaining = isPendingArrival && session.pendingExpiresAt
    ? Math.floor((new Date(session.pendingExpiresAt).getTime() - now) / 1000)
    : null;
  const serviceRemaining = isActive && session.serviceEndsAt
    ? Math.floor((new Date(session.serviceEndsAt).getTime() - now) / 1000)
    : null;

  return (
    <div className="rounded-lg border border-ink-900/8 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-900 truncate">{assignment.service?.name}</p>
          <p className="text-xs text-ink-700/50 truncate">
            {assignment.staff?.firstName} {assignment.staff?.lastName} · TZS{" "}
            {Number(assignment.service?.price || 0).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={badgeStatus} />
      </div>

      {session?.delayed && (isPendingArrival || isActive) && (
        <div className="mt-2 rounded-md bg-status-busy/10 border border-status-busy/40 px-2.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-status-busy animate-pulse">
          Delayed — arrival not confirmed
        </div>
      )}

      {isPendingArrival && (
        <div className="mt-3 rounded-md bg-status-pending/10 px-3 py-2.5 text-center space-y-1">
          <span className="font-display text-2xl tabular-nums text-status-pending leading-none block">
            {formatDuration(pendingRemaining ?? 0)}
          </span>
          <p className="text-[11px] text-ink-700/50 truncate">{session.customerName}</p>
        </div>
      )}

      {isActive && (
        <div className="mt-3 rounded-md bg-status-busy/5 px-3 py-2.5 text-center space-y-1">
          <span
            className={`font-display text-2xl tabular-nums leading-none block ${
              serviceRemaining > 0 ? "text-status-busy" : "text-status-busy animate-pulse"
            }`}
          >
            {formatDuration(serviceRemaining ?? 0)}
          </span>
          <p className="text-[11px] text-ink-700/50 truncate">{session.customerName}</p>
        </div>
      )}

      {isAwaitingCashier && (
        <div className="mt-3 rounded-md bg-brass-500/10 px-3 py-2.5 text-center">
          <p className="text-[11px] font-medium text-brass-600 uppercase tracking-wide">Additional service requested</p>
          <p className="text-[11px] text-ink-700/50 truncate mt-0.5">{session.customerName}</p>
        </div>
      )}

      {isAwaitingPayment && (
        <div className="mt-3 rounded-md bg-status-pending/10 px-3 py-2.5 text-center">
          <span className="font-display text-lg text-ink-950 block">
            TZS {Number(session.transaction?.amount || 0).toLocaleString()}
          </span>
          <p className="text-[11px] text-ink-700/50">{session.customerName}</p>
        </div>
      )}

      {busyElsewhere && (
        <div className="mt-3 rounded-md bg-ink-800/5 px-3 py-2.5 text-center">
          <p className="text-[11px] text-ink-700/60">
            {assignment.staff?.firstName} is currently with another customer in a different room.
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {!session && !roomUnderMaintenance && !busyElsewhere && (
          <button
            onClick={() => onRegister(assignment)}
            disabled={isBusy}
            className="flex-1 rounded-lg bg-terracotta-600 text-cream-50 text-xs font-medium py-2 hover:bg-terracotta-700 transition disabled:opacity-50"
          >
            Register
          </button>
        )}

        {isPendingArrival && (
          <button
            onClick={() => onCancel(session)}
            disabled={isBusy}
            className="flex-1 rounded-lg border border-status-busy/40 text-status-busy text-xs font-medium py-2 hover:bg-status-busy/5 transition disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        {isActive && (
          <button
            onClick={() => onEnd(session)}
            disabled={isBusy}
            className="flex-1 rounded-lg border border-ink-900/12 text-ink-800 text-xs font-medium py-2 hover:bg-ink-800/5 transition disabled:opacity-50"
          >
            End service
          </button>
        )}

        {isAwaitingCashier && (
          <button
            onClick={() => onConfirmAdditional(session)}
            disabled={isBusy}
            className="flex-1 rounded-lg bg-status-available text-white text-xs font-medium py-2 hover:opacity-90 transition disabled:opacity-50"
          >
            Confirm payment
          </button>
        )}

        {isAwaitingPayment && (
          <button
            onClick={() => onReceivePayment(session)}
            disabled={isBusy}
            className="flex-1 rounded-lg bg-brass-500 text-white text-xs font-medium py-2 hover:bg-brass-600 transition disabled:opacity-50"
          >
            Receive payment
          </button>
        )}
      </div>
    </div>
  );
}
