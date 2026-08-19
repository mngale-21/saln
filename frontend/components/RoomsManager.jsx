"use client";

import { useEffect, useState } from "react";
import api from "../lib/api";
import { groupServicesByCategory } from "../lib/groupServices";

/**
 * RoomsManager
 * Admin-only. Two jobs:
 *  1. Create rooms (each with a room number) for a branch.
 *  2. Build the roster: assign a staff member to deliver a specific
 *     service inside a specific room. A room can offer many services, but
 *     each service in that room maps to exactly one staff member — picking
 *     a different staff member for a service already assigned just
 *     replaces who delivers it.
 *
 * Props:
 *  - branches: [{ id, name }]
 */
export default function RoomsManager({ branches }) {
  const [branchId, setBranchId] = useState(branches?.[0]?.id || "");
  const [rooms, setRooms] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roomForm, setRoomForm] = useState({ roomNumber: "", name: "", serviceId: "", staffId: "" });
  const [assignForm, setAssignForm] = useState({}); // roomId -> { staffId, serviceId }
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (branchId) loadAll(branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  async function loadAll(id) {
    setIsLoading(true);
    try {
      const [roomsRes, servicesRes, employeesRes] = await Promise.all([
        api.get("/rooms", { params: { branchId: id } }),
        api.get("/services", { params: { branchId: id } }),
        api.get("/employees"),
      ]);
      setRooms(roomsRes.data.rooms);
      setServices(servicesRes.data.services);
      const branchGroup = employeesRes.data.branches.find((b) => b.branchId === id);
      setStaff((branchGroup?.employees || []).filter((e) => e.role === "STAFF"));
    } catch (err) {
      if (err?.response?.status !== 401) {
        setError(err?.response?.data?.message || "Couldn't load rooms.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateRoom(e) {
    e.preventDefault();
    setError("");
    if (!roomForm.roomNumber || !roomForm.name) {
      setError("Room number and name are required.");
      return;
    }
    if (!roomForm.serviceId || !roomForm.staffId) {
      setError("Pick a service and the staff member who will deliver it in this room.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/rooms", { ...roomForm, branchId });
      setRoomForm({ roomNumber: "", name: "", serviceId: "", staffId: "" });
      await loadAll(branchId);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't create the room.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteRoom(roomId) {
    try {
      await api.delete(`/rooms/${roomId}`);
      await loadAll(branchId);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't remove that room.");
    }
  }

  async function handleAssign(roomId) {
    const form = assignForm[roomId];
    if (!form?.staffId || !form?.serviceId) return;
    setError("");
    try {
      await api.post(`/rooms/${roomId}/assignments`, form);
      setAssignForm((prev) => ({ ...prev, [roomId]: { staffId: "", serviceId: "" } }));
      await loadAll(branchId);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't create the assignment.");
    }
  }

  async function handleRemoveAssignment(assignmentId) {
    try {
      await api.delete(`/rooms/assignments/${assignmentId}`);
      await loadAll(branchId);
    } catch {
      setError("Couldn't remove that assignment.");
    }
  }

  async function handleToggleMaintenance(room) {
    const nextStatus = room.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE";
    try {
      await api.patch(`/rooms/${room.id}/status`, { status: nextStatus });
      await loadAll(branchId);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't update the room.");
    }
  }

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-900/8">
        <h3 className="font-medium text-ink-950">Rooms & staff roster</h3>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
        >
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="px-5 py-4 space-y-5">
        {error && <p className="text-xs text-status-busy">{error}</p>}

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-ink-800/5 animate-pulse" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-ink-700/50 py-2">No rooms yet for this branch.</p>
        ) : (
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li key={room.id} className="rounded-lg border border-ink-900/8 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-ink-900">
                    {room.name} <span className="text-ink-700/40 font-normal">#{room.roomNumber}</span>
                    {room.status === "MAINTENANCE" && (
                      <span className="ml-2 rounded-full bg-ink-700/10 text-ink-700 text-[10px] uppercase tracking-wide px-2 py-0.5">
                        Maintenance
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleMaintenance(room)}
                      className="text-xs text-ink-700/60 hover:underline"
                    >
                      {room.status === "MAINTENANCE" ? "Mark available" : "Mark maintenance"}
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room.id)}
                      className="text-xs text-status-busy hover:underline"
                    >
                      Remove room
                    </button>
                  </div>
                </div>

                {room.assignments?.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {room.assignments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-xs text-ink-700/70">
                        <span>
                          {a.service?.name} → {a.staff?.firstName} {a.staff?.lastName}
                        </span>
                        <button
                          onClick={() => handleRemoveAssignment(a.id)}
                          className="text-status-busy hover:underline"
                        >
                          Unassign
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <select
                    value={assignForm[room.id]?.serviceId || ""}
                    onChange={(e) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        [room.id]: { ...prev[room.id], serviceId: e.target.value },
                      }))
                    }
                    className="flex-1 rounded-lg border border-ink-900/12 px-2 py-1.5 text-xs"
                  >
                    <option value="">Service…</option>
                    {groupServicesByCategory(services).map(([label, items]) => (
                      <optgroup key={label} label={label}>
                        {items.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select
                    value={assignForm[room.id]?.staffId || ""}
                    onChange={(e) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        [room.id]: { ...prev[room.id], staffId: e.target.value },
                      }))
                    }
                    className="flex-1 rounded-lg border border-ink-900/12 px-2 py-1.5 text-xs"
                  >
                    <option value="">Staff…</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAssign(room.id)}
                    className="rounded-lg bg-terracotta-600 text-cream-50 text-xs font-medium px-3 py-1.5 hover:bg-terracotta-700 transition"
                  >
                    Assign
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreateRoom} className="space-y-2 pt-2 border-t border-ink-900/8">
          <p className="text-xs font-medium text-ink-700/60 uppercase tracking-wide pt-2">Add a new room</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Room number (e.g. R-05)"
              value={roomForm.roomNumber}
              onChange={(e) => setRoomForm((f) => ({ ...f, roomNumber: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
            <input
              placeholder="Room name (e.g. Room 5)"
              value={roomForm.name}
              onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
          </div>
          <p className="text-xs text-ink-700/50">
            Every room needs at least one staffed service before it can be used — pick who covers what here.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <select
              required
              value={roomForm.serviceId}
              onChange={(e) => setRoomForm((f) => ({ ...f, serviceId: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm"
            >
              <option value="">Service… (required)</option>
              {groupServicesByCategory(services).map(([label, items]) => (
                <optgroup key={label} label={label}>
                  {items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              required
              value={roomForm.staffId}
              onChange={(e) => setRoomForm((f) => ({ ...f, staffId: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm"
            >
              <option value="">Staff… (required)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-terracotta-600 text-cream-50 text-sm font-medium py-2 hover:bg-terracotta-700 transition disabled:opacity-50"
          >
            {isSubmitting ? "Adding…" : "+ Add room"}
          </button>
        </form>
      </div>
    </div>
  );
}
