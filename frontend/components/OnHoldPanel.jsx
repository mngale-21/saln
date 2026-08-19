"use client";

import { useState } from "react";
import api from "../lib/api";

function minutesAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

/**
 * OnHoldPanel
 * Customers who were more than 10 minutes late — their room/staff slot has
 * already been released back to Free (see the room grid), but they aren't
 * lost: they stay here until someone clears the hold. Clearing resumes the
 * session straight into service, either back in the original room (if
 * it's free again) or reassigned to a different available one.
 *
 * Props:
 *  - onHold: [session] (each with room, service, staff, customerName,
 *    holdStartedAt, transaction)
 *  - onCleared: () => void — reload the parent's data after a change
 */
export default function OnHoldPanel({ onHold, onCleared }) {
  const [busyId, setBusyId] = useState(null);
  const [reassignId, setReassignId] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");

  if (!onHold || onHold.length === 0) return null;

  async function handleResumeOriginal(session) {
    setBusyId(session.id);
    setError("");
    try {
      await api.post(`/sessions/${session.id}/clear-hold`);
      onCleared();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't clear the hold.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleOpenReassign(session) {
    setReassignId(session.id);
    setOptions(null);
    try {
      const { data } = await api.get(`/services/${session.serviceId}/availability`, {
        params: { branchId: session.branchId },
      });
      setOptions(data.options.filter((o) => o.available));
    } catch {
      setOptions([]);
    }
  }

  async function handleReassign(session, option) {
    setBusyId(session.id);
    setError("");
    try {
      await api.post(`/sessions/${session.id}/clear-hold`, {
        roomId: option.room.id,
        serviceId: session.serviceId,
      });
      setReassignId(null);
      onCleared();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't reassign that customer.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6">
      <h2 className="font-display text-lg text-ink-950 mb-3 flex items-center gap-2">
        On hold
        <span className="rounded-full bg-status-busy text-cream-50 text-xs px-2 py-0.5">{onHold.length}</span>
      </h2>
      {error && <p className="text-xs text-status-busy mb-2">{error}</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {onHold.map((session) => (
          <div key={session.id} className="rounded-xl2 bg-status-busy/5 border border-status-busy/30 p-4 space-y-3">
            <div>
              <p className="font-medium text-ink-950">{session.customerName}</p>
              <p className="text-xs text-ink-700/60">
                {session.service?.name} · originally {session.room?.name} #{session.room?.roomNumber} with{" "}
                {session.staff?.firstName} {session.staff?.lastName}
              </p>
              <p className="text-xs text-status-busy font-medium mt-1">
                On hold for {minutesAgo(session.holdStartedAt)} min
              </p>
            </div>

            {reassignId === session.id ? (
              <div className="space-y-2">
                {options === null ? (
                  <p className="text-xs text-ink-700/50">Checking availability…</p>
                ) : options.length === 0 ? (
                  <p className="text-xs text-ink-700/50">No other room is free for this service right now.</p>
                ) : (
                  options.map((o) => (
                    <button
                      key={o.assignmentId}
                      onClick={() => handleReassign(session, o)}
                      disabled={busyId === session.id}
                      className="w-full text-left rounded-lg border border-ink-900/12 px-3 py-2 text-xs hover:bg-ink-900/5 transition disabled:opacity-50"
                    >
                      {o.room.name} #{o.room.roomNumber} with {o.staff.firstName} {o.staff.lastName}
                    </button>
                  ))
                )}
                <button
                  onClick={() => setReassignId(null)}
                  className="w-full rounded-lg border border-ink-900/12 py-2 text-xs text-ink-700 hover:bg-ink-900/5 transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => handleResumeOriginal(session)}
                  disabled={busyId === session.id}
                  className="flex-1 rounded-lg bg-terracotta-600 text-cream-50 text-xs font-medium py-2 hover:bg-terracotta-700 transition disabled:opacity-50"
                >
                  Clear hold — resume here
                </button>
                <button
                  onClick={() => handleOpenReassign(session)}
                  disabled={busyId === session.id}
                  className="flex-1 rounded-lg border border-ink-900/12 text-ink-800 text-xs font-medium py-2 hover:bg-ink-900/5 transition disabled:opacity-50"
                >
                  Reassign room
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
