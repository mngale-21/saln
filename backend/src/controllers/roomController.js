// ============================================================================
// Room Controller
// Rooms + their staff/service roster. A room is a physical space that can
// run several services at once — availability lives on each individual
// RoomAssignment (one room can have multiple simultaneous live sessions,
// each with a different staff member), never on the room as a whole. The
// room's own `status` field is only an admin "take the whole room offline
// for maintenance" toggle.
// ============================================================================

const prisma = require("../config/prismaClient");

const LIVE_STATUSES = ["PENDING_ARRIVAL", "ACTIVE", "AWAITING_CASHIER"];

/**
 * GET /api/rooms?branchId=...
 * Returns every room for a branch with its staff/service roster, and — for
 * each assignment — the currently live session there (if any), plus a
 * still-unpaid just-completed session so the cashier can collect payment.
 */
async function getRoomsByBranch(req, res) {
  try {
    const { branchId } = req.query;
    if (!branchId) {
      return res.status(400).json({ message: "branchId query param is required." });
    }

    const PERSON_SELECT = { select: { id: true, firstName: true, lastName: true } };

    const [rooms, relevantSessions, onHold] = await Promise.all([
      prisma.room.findMany({
        where: { branchId },
        orderBy: { roomNumber: "asc" },
        include: {
          assignments: {
            include: {
              staff: PERSON_SELECT,
              service: true,
            },
          },
        },
      }),
      prisma.session.findMany({
        where: {
          branchId,
          OR: [
            { status: { in: LIVE_STATUSES } },
            { status: "COMPLETED", transaction: { status: { in: ["UNPAID", "PARTIAL"] } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          service: true,
          staff: PERSON_SELECT,
          startedBy: PERSON_SELECT,
          endedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
          transaction: true,
        },
      }),
      // On-hold customers no longer occupy a room slot (that's the whole
      // point — the room is released to Free), so they're surfaced as
      // their own list rather than inside a room's assignment.
      prisma.session.findMany({
        where: { branchId, status: "ON_HOLD" },
        orderBy: { holdStartedAt: "asc" },
        include: {
          room: true,
          service: true,
          staff: PERSON_SELECT,
          transaction: true,
        },
      }),
    ]);

    // Key by "<roomId>::<serviceId>" — the most recent session found for
    // that exact pair wins (there should only ever be one live at a time).
    const sessionByAssignment = new Map();
    // A staff member can only ever be serving one live (not-yet-completed)
    // session at a time — track which staff currently have one, anywhere
    // in the branch, so an assignment slot with no session of its own can
    // still be correctly shown as unavailable if its staff member is busy
    // elsewhere.
    const busyStaffIds = new Set();
    for (const session of relevantSessions) {
      const key = `${session.roomId}::${session.serviceId}`;
      if (!sessionByAssignment.has(key)) sessionByAssignment.set(key, session);
      if (LIVE_STATUSES.includes(session.status) && session.staffId) {
        busyStaffIds.add(session.staffId);
      }
    }

    const shaped = rooms.map((room) => ({
      ...room,
      assignments: room.assignments.map((a) => {
        const currentSession = sessionByAssignment.get(`${room.id}::${a.serviceId}`) || null;
        return {
          ...a,
          currentSession,
          // Only meaningful when this exact slot has no session of its
          // own — it means the staff member is tied up with a different
          // customer somewhere else right now.
          staffBusyElsewhere: !currentSession && busyStaffIds.has(a.staffId),
        };
      }),
    }));

    return res.status(200).json({ rooms: shaped, onHold });
  } catch (error) {
    console.error("getRoomsByBranch error:", error);
    return res.status(500).json({ message: "Server error fetching rooms." });
  }
}

/**
 * POST /api/rooms
 * ADMIN only. Body: { roomNumber, name, branchId, salonAreaId?, serviceId, staffId }
 * A room must be created with at least one staffed service — serviceId and
 * staffId are required so a room is never left without anyone able to
 * receive a customer. Additional services can be added afterwards.
 */
async function createRoom(req, res) {
  try {
    const { roomNumber, name, branchId, salonAreaId, serviceId, staffId } = req.body;
    if (!roomNumber || !name || !branchId) {
      return res.status(400).json({ message: "roomNumber, name and branchId are required." });
    }
    if (!serviceId || !staffId) {
      return res.status(400).json({
        message: "Pick a service and the staff member who will deliver it in this room before creating it.",
      });
    }

    const [staff, service] = await Promise.all([
      prisma.user.findUnique({ where: { id: staffId } }),
      prisma.service.findUnique({ where: { id: serviceId } }),
    ]);
    if (!staff || staff.role !== "STAFF") {
      return res.status(400).json({ message: "staffId must belong to a STAFF user." });
    }
    if (!service) return res.status(404).json({ message: "Service not found." });
    if (staff.branchId !== branchId || service.branchId !== branchId) {
      return res.status(400).json({ message: "The selected staff and service must belong to this branch." });
    }

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: { roomNumber, name, branchId, salonAreaId: salonAreaId || null },
      });
      await tx.roomAssignment.create({
        data: { roomId: created.id, staffId, serviceId },
      });
      return tx.room.findUnique({
        where: { id: created.id },
        include: {
          assignments: {
            include: { staff: { select: { id: true, firstName: true, lastName: true } }, service: true },
          },
        },
      });
    });

    return res.status(201).json({
      message: "Room created and staffed.",
      room: { ...room, assignments: room.assignments.map((a) => ({ ...a, currentSession: null, staffBusyElsewhere: false })) },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "A room with that number or name already exists at this branch." });
    }
    console.error("createRoom error:", error);
    return res.status(500).json({ message: "Server error creating the room." });
  }
}

/**
 * DELETE /api/rooms/:roomId
 * ADMIN only. Refuses to delete a room with any live session in progress.
 */
async function deleteRoom(req, res) {
  try {
    const { roomId } = req.params;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ message: "Room not found." });

    const liveSession = await prisma.session.findFirst({
      where: { roomId, status: { in: LIVE_STATUSES } },
    });
    if (liveSession) {
      return res.status(409).json({ message: "Can't delete a room with a service currently in progress." });
    }

    await prisma.room.delete({ where: { id: roomId } });
    return res.status(200).json({ message: "Room removed." });
  } catch (error) {
    console.error("deleteRoom error:", error);
    return res.status(500).json({ message: "Server error removing the room." });
  }
}

/**
 * PATCH /api/rooms/:roomId/status
 * ADMIN only. Body: { status: "AVAILABLE" | "MAINTENANCE" }
 * Toggles the whole room offline (blocks new bookings for every service in
 * it) or back online. Doesn't touch any session already in progress there.
 */
async function setRoomStatus(req, res) {
  try {
    const { roomId } = req.params;
    const { status } = req.body;
    if (!["AVAILABLE", "MAINTENANCE"].includes(status)) {
      return res.status(400).json({ message: 'status must be "AVAILABLE" or "MAINTENANCE".' });
    }
    const room = await prisma.room.update({ where: { id: roomId }, data: { status } });
    return res.status(200).json({ message: `Room marked ${status.toLowerCase()}.`, room });
  } catch (error) {
    console.error("setRoomStatus error:", error);
    return res.status(500).json({ message: "Server error updating the room." });
  }
}

/**
 * POST /api/rooms/:roomId/assignments
 * ADMIN only. Body: { staffId, serviceId }
 * Assigns a staff member to deliver a given service inside this room —
 * this is what lets one room run several services at once, each with a
 * different person. Each service in a room can only ever have one staff
 * member (enforced by the DB's unique constraint too).
 */
async function assignStaffToRoom(req, res) {
  try {
    const { roomId } = req.params;
    const { staffId, serviceId } = req.body;
    if (!staffId || !serviceId) {
      return res.status(400).json({ message: "staffId and serviceId are required." });
    }

    const [room, staff, service] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomId } }),
      prisma.user.findUnique({ where: { id: staffId } }),
      prisma.service.findUnique({ where: { id: serviceId } }),
    ]);
    if (!room) return res.status(404).json({ message: "Room not found." });
    if (!staff || staff.role !== "STAFF") {
      return res.status(400).json({ message: "staffId must belong to a STAFF user." });
    }
    if (!service) return res.status(404).json({ message: "Service not found." });
    if (service.branchId !== room.branchId || staff.branchId !== room.branchId) {
      return res.status(400).json({ message: "Room, staff, and service must all belong to the same branch." });
    }

    const assignment = await prisma.roomAssignment.upsert({
      where: { roomId_serviceId: { roomId, serviceId } },
      update: { staffId },
      create: { roomId, staffId, serviceId },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
        service: true,
      },
    });

    return res.status(201).json({ message: "Staff assigned to service in this room.", assignment });
  } catch (error) {
    console.error("assignStaffToRoom error:", error);
    return res.status(500).json({ message: "Server error creating the assignment." });
  }
}

/**
 * DELETE /api/rooms/assignments/:assignmentId
 * ADMIN only. Refuses to remove an assignment with a live session.
 */
async function removeAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const assignment = await prisma.roomAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });

    const liveSession = await prisma.session.findFirst({
      where: { roomId: assignment.roomId, serviceId: assignment.serviceId, status: { in: LIVE_STATUSES } },
    });
    if (liveSession) {
      return res.status(409).json({ message: "Can't unassign a service that's currently in progress." });
    }

    await prisma.roomAssignment.delete({ where: { id: assignmentId } });
    return res.status(200).json({ message: "Assignment removed." });
  } catch (error) {
    console.error("removeAssignment error:", error);
    return res.status(500).json({ message: "Server error removing the assignment." });
  }
}

/**
 * GET /api/rooms/:roomId/analytics
 * ADMIN only. Powers the interactive Admin Overview: pick a room from the
 * list and see live, room-specific metrics — today's and all-time revenue
 * and session counts, its current live occupancy, and how often it's run
 * into delays, cancellations, or no-shows.
 */
async function getRoomAnalytics(req, res) {
  try {
    const { roomId } = req.params;
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        assignments: {
          include: { staff: { select: { id: true, firstName: true, lastName: true } }, service: true },
        },
      },
    });
    if (!room) return res.status(404).json({ message: "Room not found." });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      todaySessions,
      allTimeSessions,
      liveSessions,
      delayedCount,
      cancelledCount,
      expiredCount,
      onHoldCount,
    ] = await Promise.all([
      prisma.session.findMany({
        where: { roomId, registeredAt: { gte: startOfToday } },
        include: { transaction: true },
      }),
      prisma.session.findMany({ where: { roomId }, include: { transaction: true } }),
      prisma.session.findMany({
        where: { roomId, status: { in: LIVE_STATUSES } },
        include: { service: true, staff: { select: { firstName: true, lastName: true } }, customer: true },
      }),
      prisma.session.count({ where: { roomId, delayed: true } }),
      prisma.session.count({ where: { roomId, status: "CANCELLED" } }),
      prisma.session.count({ where: { roomId, status: "EXPIRED" } }),
      prisma.session.count({ where: { roomId, status: "ON_HOLD" } }),
    ]);

    const sumPaid = (sessions) =>
      sessions.reduce((sum, s) => sum + (s.transaction?.status === "PAID" ? Number(s.transaction.amount) : 0), 0);

    return res.status(200).json({
      room: { id: room.id, name: room.name, roomNumber: room.roomNumber, status: room.status, assignments: room.assignments },
      today: { sessionCount: todaySessions.length, revenue: sumPaid(todaySessions) },
      allTime: { sessionCount: allTimeSessions.length, revenue: sumPaid(allTimeSessions) },
      liveSessions,
      delayedCount,
      cancelledCount,
      expiredCount,
      onHoldCount,
    });
  } catch (error) {
    console.error("getRoomAnalytics error:", error);
    return res.status(500).json({ message: "Server error building room analytics." });
  }
}

module.exports = {
  getRoomsByBranch,
  createRoom,
  deleteRoom,
  setRoomStatus,
  assignStaffToRoom,
  removeAssignment,
  getRoomAnalytics,
};
