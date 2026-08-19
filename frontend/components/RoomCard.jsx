"use client";

import AssignmentRow from "./AssignmentRow";

/**
 * RoomCard
 * A room is a space, not a single bookable slot — it lists every staffed
 * service (assignment) in it, each with its own independent status/timer,
 * since a room can run more than one service at the same time with
 * different staff members.
 *
 * Props:
 *  - room: { id, name, roomNumber, status, assignments: [assignment] }
 *  - onRegister, onCancel, onEnd, onReceivePayment, onConfirmAdditional: (assignment) => void
 *  - busyAssignmentId: id of the assignment currently mid-request (disables its buttons)
 */
export default function RoomCard({
  room,
  onRegister,
  onCancel,
  onEnd,
  onReceivePayment,
  onConfirmAdditional,
  busyAssignmentId,
}) {
  const underMaintenance = room.status === "MAINTENANCE";
  const liveCount = (room.assignments || []).filter((a) =>
    ["PENDING_ARRIVAL", "ACTIVE", "AWAITING_CASHIER"].includes(a.currentSession?.status)
  ).length;

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-900/8 bg-sage-50/60">
        <div>
          <h3 className="font-medium text-ink-950">
            {room.name} <span className="text-ink-700/40 font-normal">#{room.roomNumber}</span>
          </h3>
          <p className="text-[11px] text-ink-700/50">
            {underMaintenance
              ? "Under maintenance"
              : `${liveCount} of ${room.assignments?.length || 0} services occupied`}
          </p>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {!room.assignments || room.assignments.length === 0 ? (
          <p className="text-xs text-ink-700/50 py-3 text-center">No services staffed in this room yet.</p>
        ) : (
          room.assignments.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              roomUnderMaintenance={underMaintenance}
              onRegister={onRegister}
              onCancel={onCancel}
              onEnd={onEnd}
              onReceivePayment={onReceivePayment}
              onConfirmAdditional={onConfirmAdditional}
              isBusy={busyAssignmentId === assignment.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
