// ============================================================================
// Employee Controller
// ADMIN-only screen: every Cashier and Staff member, grouped by branch, with
// the ability to remove an account entirely.
// ============================================================================

const prisma = require("../config/prismaClient");

/**
 * GET /api/employees?includeInactive=true
 * ADMIN only. Returns every CASHIER/STAFF user, grouped by branch. By
 * default only active accounts are shown — once an employee is removed
 * (see deleteEmployee below), they disappear from this list even if their
 * account had to be deactivated rather than hard-deleted to preserve past
 * reports. Pass ?includeInactive=true to see those too.
 */
async function listEmployeesByBranch(req, res) {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        users: {
          where: {
            role: { in: ["CASHIER", "STAFF"] },
            ...(includeInactive ? {} : { isActive: true }),
          },
          orderBy: [{ role: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    const grouped = branches.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      branchCode: b.code,
      employees: b.users,
    }));

    return res.status(200).json({ branches: grouped });
  } catch (error) {
    console.error("listEmployeesByBranch error:", error);
    return res.status(500).json({ message: "Server error fetching employees." });
  }
}

/**
 * DELETE /api/employees/:id
 * ADMIN only. Removes a Cashier or Staff account.
 *  - Refuses if they're the assigned staff on a session still in progress
 *    (PENDING_ARRIVAL / ACTIVE / AWAITING_CASHIER / ON_HOLD) — reassign or
 *    finish that first.
 *  - Otherwise hard-deletes the account, unless it has historical
 *    sessions/transactions tied to it (needed for past reports) — in that
 *    case it's deactivated instead so it no longer appears in the active
 *    employee list, but the records it's attached to stay intact.
 */
async function deleteEmployee(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: "Employee not found." });
    if (user.role === "ADMIN") {
      return res.status(403).json({ message: "Admin accounts can't be removed from this screen." });
    }

    const activeSession = await prisma.session.findFirst({
      where: {
        staffId: id,
        status: { in: ["PENDING_ARRIVAL", "ACTIVE", "AWAITING_CASHIER", "ON_HOLD"] },
      },
    });
    if (activeSession) {
      return res.status(409).json({
        message: "This employee has a service in progress (or a customer on hold waiting for them) — finish or reassign it before removing them.",
      });
    }

    // Roster assignments (which room+service they're on the roster for)
    // aren't historical records — they're just current staffing config, so
    // it's always safe to clear them as part of removing the employee.
    // This is what lets a staff member with no past sessions be truly
    // hard-deleted instead of unnecessarily falling back to deactivation.
    await prisma.roomAssignment.deleteMany({ where: { staffId: id } });

    try {
      await prisma.user.delete({ where: { id } });
      return res.status(200).json({ message: "Employee removed." });
    } catch (deleteError) {
      if (deleteError.code === "P2003") {
        // A user with historical sessions/transactions can't be hard-deleted
        // without breaking referential integrity — deactivate instead so
        // past records (and reports) stay intact. They're filtered out of
        // the default employee list, so from the admin's point of view
        // they're gone.
        await prisma.user.update({ where: { id }, data: { isActive: false } });
        return res.status(200).json({
          message: "Employee removed. (Their historical records were kept for reporting, so the account was deactivated rather than deleted.)",
        });
      }
      throw deleteError;
    }
  } catch (error) {
    console.error("deleteEmployee error:", error);
    return res.status(500).json({ message: "Server error removing the employee." });
  }
}

module.exports = { listEmployeesByBranch, deleteEmployee };
