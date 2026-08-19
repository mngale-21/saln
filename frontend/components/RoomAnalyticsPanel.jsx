"use client";

import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

function formatMoney(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`;
}

/**
 * RoomAnalyticsPanel
 * The interactive part of the Admin Overview: a room list on the left,
 * live metrics for whichever one is selected on the right. Selecting a
 * different room fetches its own analytics — today's and all-time revenue
 * and session counts, current live occupancy, and delay/cancellation/
 * no-show history — independent of the room grid used for day-to-day
 * operations.
 *
 * Props:
 *  - branches: [{ id, name }]
 */
export default function RoomAnalyticsPanel({ branches }) {
  const [branchId, setBranchId] = useState(branches?.[0]?.id || "");
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!branchId) return;
    setIsLoadingRooms(true);
    setSelectedRoomId(null);
    api
      .get("/rooms", { params: { branchId } })
      .then(({ data }) => {
        setRooms(data.rooms);
        if (data.rooms.length > 0) setSelectedRoomId(data.rooms[0].id);
      })
      .catch((err) => setError(err?.response?.data?.message || "Couldn't load rooms."))
      .finally(() => setIsLoadingRooms(false));
  }, [branchId]);

  const loadAnalytics = useCallback(async (roomId) => {
    if (!roomId) return;
    setIsLoadingAnalytics(true);
    setError("");
    try {
      const { data } = await api.get(`/rooms/${roomId}/analytics`);
      setAnalytics(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load analytics for that room.");
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRoomId) loadAnalytics(selectedRoomId);
  }, [selectedRoomId, loadAnalytics]);

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-ink-900/8">
        <p className="text-xs text-ink-700/50">Select a room to see its live metrics</p>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm"
        >
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col md:flex-row">
        {/* Interactive room-picker sidebar */}
        <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-ink-900/8 max-h-72 md:max-h-none overflow-y-auto">
          {isLoadingRooms ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 rounded-lg bg-ink-900/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="py-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition ${
                      selectedRoomId === room.id
                        ? "bg-terracotta-600 text-cream-50 font-medium"
                        : "text-ink-800 hover:bg-ink-900/5"
                    }`}
                  >
                    {room.name} <span className="opacity-60">#{room.roomNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Live metrics for the selected room */}
        <div className="flex-1 p-5">
          {error && <p className="text-xs text-status-busy mb-3">{error}</p>}
          {isLoadingAnalytics || !analytics ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-ink-900/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h4 className="font-medium text-ink-950">
                  {analytics.room.name} <span className="text-ink-700/40 font-normal">#{analytics.room.roomNumber}</span>
                </h4>
                <p className="text-xs text-ink-700/50 mt-0.5">
                  {analytics.room.status === "MAINTENANCE" ? "Under maintenance" : `${analytics.room.assignments.length} services staffed`}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-status-available/5 border border-status-available/20 p-3">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Today</p>
                  <p className="font-display text-lg text-status-available">{formatMoney(analytics.today.revenue)}</p>
                  <p className="text-xs text-ink-700/50">{analytics.today.sessionCount} sessions</p>
                </div>
                <div className="rounded-lg bg-brass-500/5 border border-brass-500/20 p-3">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">All time</p>
                  <p className="font-display text-lg text-brass-700">{formatMoney(analytics.allTime.revenue)}</p>
                  <p className="text-xs text-ink-700/50">{analytics.allTime.sessionCount} sessions</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-ink-900/5 p-2">
                  <p className="font-display text-lg text-ink-900">{analytics.delayedCount}</p>
                  <p className="text-[10px] text-ink-700/50 uppercase tracking-wide">Delayed</p>
                </div>
                <div className="rounded-lg bg-ink-900/5 p-2">
                  <p className="font-display text-lg text-ink-900">{analytics.cancelledCount}</p>
                  <p className="text-[10px] text-ink-700/50 uppercase tracking-wide">Cancelled</p>
                </div>
                <div className="rounded-lg bg-ink-900/5 p-2">
                  <p className="font-display text-lg text-ink-900">{analytics.expiredCount}</p>
                  <p className="text-[10px] text-ink-700/50 uppercase tracking-wide">No-show</p>
                </div>
                <div className="rounded-lg bg-ink-900/5 p-2">
                  <p className="font-display text-lg text-ink-900">{analytics.onHoldCount}</p>
                  <p className="text-[10px] text-ink-700/50 uppercase tracking-wide">On hold</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-ink-700/60 uppercase tracking-wide mb-2">Live right now</p>
                {analytics.liveSessions.length === 0 ? (
                  <p className="text-sm text-ink-700/50">Nothing currently in progress in this room.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {analytics.liveSessions.map((s) => (
                      <li key={s.id} className="text-sm text-ink-800 flex items-center justify-between rounded-lg bg-ink-900/5 px-3 py-2">
                        <span>
                          {s.customerName} · {s.service?.name}
                        </span>
                        <span className="text-xs text-ink-700/50">
                          {s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : "—"} · {s.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
