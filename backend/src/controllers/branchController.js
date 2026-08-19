// ============================================================================
// Branch Controller
// Exposes the list of active branches (Dar es Salaam, Dodoma, Arusha, plus
// any added later) for the frontend BranchSelector and admin analytics.
// ============================================================================

const prisma = require("../config/prismaClient");

/**
 * GET /api/branches
 * Requires a valid logged-in user via `protect`. Admins see every active
 * branch (they have full cross-branch access by design). A Cashier or
 * Staff member only ever sees the single branch an Admin assigned them to
 * — they never get a choice of branch, since they shouldn't be able to
 * view or act on any other branch's data.
 */
/**
 * GET /api/branches?includeInactive=true
 * Requires a valid logged-in user via `protect`. Admins see every active
 * branch by default (they have full cross-branch access by design) —
 * pass ?includeInactive=true (ADMIN only) to also see suspended/archived
 * branches, so they can be reactivated. A Cashier or Staff member only
 * ever sees the single branch an Admin assigned them to, and only if it's
 * currently active — they never get a choice of branch, and a suspended
 * branch disappears for them entirely (no new bookings there).
 */
async function getActiveBranches(req, res) {
  try {
    const includeInactive = req.user.role === "ADMIN" && req.query.includeInactive === "true";
    const where = includeInactive ? {} : { isActive: true };

    if (req.user.role !== "ADMIN") {
      if (!req.user.branchId) {
        return res.status(200).json({ branches: [] });
      }
      where.id = req.user.branchId;
    }

    const branches = await prisma.branch.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, address: true, isActive: true },
    });

    return res.status(200).json({ branches });
  } catch (error) {
    console.error("getActiveBranches error:", error);
    return res.status(500).json({ message: "Server error fetching branches." });
  }
}

/**
 * GET /api/branches/:id
 * A Cashier/Staff member may only look up their own assigned branch.
 */
async function getBranchById(req, res) {
  try {
    const { id } = req.params;
    if (req.user.role !== "ADMIN" && id !== req.user.branchId) {
      return res.status(403).json({ message: "You can only access the branch you're assigned to." });
    }

    const branch = await prisma.branch.findUnique({ where: { id } });

    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }

    return res.status(200).json({ branch });
  } catch (error) {
    console.error("getBranchById error:", error);
    return res.status(500).json({ message: "Server error fetching branch." });
  }
}

/**
 * GET /api/branches/:id/summary
 * ADMIN-only high-level stats for one branch: revenue, active services, etc.
 * Used by the Admin analytics dashboard. "Busy" is now measured per
 * (room, service) assignment — a room itself is never simply busy/free
 * since it can run several services at once, each independently.
 */
async function getBranchSummary(req, res) {
  try {
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }

    const [totalRooms, totalAssignments, totalRevenueResult, activeSessions, pendingSessions] = await Promise.all([
      prisma.room.count({ where: { branchId: id } }),
      prisma.roomAssignment.count({ where: { room: { branchId: id } } }),
      prisma.transaction.aggregate({
        where: { branchId: id, status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.session.count({ where: { branchId: id, status: "ACTIVE" } }),
      prisma.session.count({ where: { branchId: id, status: { in: ["PENDING_ARRIVAL", "AWAITING_CASHIER"] } } }),
    ]);

    return res.status(200).json({
      branch: { id: branch.id, name: branch.name, code: branch.code },
      totalRooms,
      totalAssignments,
      busyRooms: activeSessions,
      availableRooms: Math.max(0, totalAssignments - activeSessions - pendingSessions),
      activeSessions,
      pendingSessions,
      totalRevenue: totalRevenueResult._sum.amount || 0,
    });
  } catch (error) {
    console.error("getBranchSummary error:", error);
    return res.status(500).json({ message: "Server error building branch summary." });
  }
}

/**
 * POST /api/branches
 * ADMIN only. Body: { name, code, address? }
 */
async function createBranch(req, res) {
  try {
    const { name, code, address } = req.body;
    if (!name || !code) {
      return res.status(400).json({ message: "name and code are required." });
    }

    const branch = await prisma.branch.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), address: address?.trim() || null },
    });

    return res.status(201).json({ message: "Branch created.", branch });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "A branch with that name or code already exists." });
    }
    console.error("createBranch error:", error);
    return res.status(500).json({ message: "Server error creating the branch." });
  }
}

/**
 * DELETE /api/branches/:id
 * ADMIN only. Refuses if the branch still has any employee assigned to it
 * (reassign or remove them first — mirrors the same safeguard used when
 * removing an employee) or a service currently in progress. A brand-new
 * branch with no history at all is fully removed; a branch that already
 * has completed sessions/transactions is archived instead (isActive:
 * false) so its historical records stay intact for reporting, but it
 * disappears everywhere a branch list is shown — same pattern as
 * deactivating an employee.
 */
async function deleteBranch(req, res) {
  try {
    const { id } = req.params;
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return res.status(404).json({ message: "Branch not found." });

    const [employeeCount, liveSessionCount, historicalSessionCount] = await Promise.all([
      prisma.user.count({ where: { branchId: id } }),
      prisma.session.count({
        where: { branchId: id, status: { in: ["PENDING_ARRIVAL", "ACTIVE", "AWAITING_CASHIER"] } },
      }),
      prisma.session.count({ where: { branchId: id } }),
    ]);

    if (employeeCount > 0) {
      return res.status(409).json({
        message: `This branch still has ${employeeCount} employee${employeeCount > 1 ? "s" : ""} assigned — reassign or remove them first.`,
      });
    }
    if (liveSessionCount > 0) {
      return res.status(409).json({ message: "This branch has a service in progress right now — finish it before removing the branch." });
    }

    if (historicalSessionCount === 0) {
      // Nothing of record ties to this branch — safe to fully remove.
      // Rooms, services, and salon areas cascade-delete with it.
      await prisma.branch.delete({ where: { id } });
      return res.status(200).json({ message: "Branch removed." });
    }

    await prisma.branch.update({ where: { id }, data: { isActive: false } });
    return res.status(200).json({
      message: "Branch archived. Its historical records were kept for reporting, so it was deactivated rather than deleted.",
    });
  } catch (error) {
    console.error("deleteBranch error:", error);
    return res.status(500).json({ message: "Server error removing the branch." });
  }
}

/**
 * PATCH /api/branches/:id/status
 * ADMIN only. Body: { isActive: boolean }
 * A lightweight pause/resume — e.g. "closed for renovation" — distinct
 * from DELETE below. Suspending doesn't touch employees, rooms, or
 * history at all; it just hides the branch from every branch list (so no
 * new bookings happen there) until it's reactivated. No safety checks
 * beyond "does this branch exist" — unlike deletion, this is meant to be
 * quick and fully reversible.
 */
async function setBranchStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive (true/false) is required." });
    }

    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return res.status(404).json({ message: "Branch not found." });

    const updated = await prisma.branch.update({ where: { id }, data: { isActive } });
    return res.status(200).json({
      message: isActive ? "Branch reactivated." : "Branch suspended — no new bookings will be taken there until it's reactivated.",
      branch: updated,
    });
  } catch (error) {
    console.error("setBranchStatus error:", error);
    return res.status(500).json({ message: "Server error updating the branch." });
  }
}

module.exports = { getActiveBranches, getBranchById, getBranchSummary, createBranch, deleteBranch, setBranchStatus };
