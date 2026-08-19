// ============================================================================
// Customer Controller
// The customer directory — built automatically whenever a cashier registers
// someone with a phone number (see findOrCreateCustomer in
// sessionController.js). Lets Cashiers look someone up and lets Admins see
// full visit history and spend per customer.
// ============================================================================

const prisma = require("../config/prismaClient");

/**
 * GET /api/customers?branchId=&search=
 * Any authenticated user (branch-scoped for non-admins). `search` matches
 * against name or phone. Each customer is annotated with visit count,
 * total paid, and last visit date so the list is useful at a glance.
 */
async function listCustomers(req, res) {
  try {
    const { branchId, search } = req.query;
    if (!branchId) return res.status(400).json({ message: "branchId query param is required." });

    const where = {
      branchId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sessions: {
          select: { id: true, registeredAt: true, status: true, transaction: { select: { status: true, amount: true } } },
        },
      },
    });

    const shaped = customers.map((c) => {
      const visitCount = c.sessions.length;
      const totalPaid = c.sessions.reduce(
        (sum, s) => sum + (s.transaction?.status === "PAID" ? Number(s.transaction.amount) : 0),
        0
      );
      const lastVisit = c.sessions.reduce(
        (latest, s) => (!latest || s.registeredAt > latest ? s.registeredAt : latest),
        null
      );
      const { sessions, ...customer } = c;
      return { ...customer, visitCount, totalPaid, lastVisit };
    });

    return res.status(200).json({ customers: shaped });
  } catch (error) {
    console.error("listCustomers error:", error);
    return res.status(500).json({ message: "Server error fetching customers." });
  }
}

/**
 * GET /api/customers/:id
 * Full visit history for one customer.
 */
async function getCustomerById(req, res) {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { registeredAt: "desc" },
          include: { room: true, service: true, staff: { select: { firstName: true, lastName: true } }, transaction: true },
        },
      },
    });
    if (!customer) return res.status(404).json({ message: "Customer not found." });
    if (req.user.role !== "ADMIN" && customer.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only access customers in your own branch." });
    }

    return res.status(200).json({ customer });
  } catch (error) {
    console.error("getCustomerById error:", error);
    return res.status(500).json({ message: "Server error fetching the customer." });
  }
}

/**
 * PATCH /api/customers/:id
 * ADMIN/CASHIER. Body: { name?, phone?, email?, notes? } — edit contact
 * details (e.g. fixing a typo, adding an email or note).
 */
async function updateCustomer(req, res) {
  try {
    const { id } = req.params;
    const { name, email, notes } = req.body || {};

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Customer not found." });
    if (req.user.role !== "ADMIN" && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only edit customers in your own branch." });
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        email: email !== undefined ? email : undefined,
        notes: notes !== undefined ? notes : undefined,
      },
    });

    return res.status(200).json({ message: "Customer updated.", customer });
  } catch (error) {
    console.error("updateCustomer error:", error);
    return res.status(500).json({ message: "Server error updating the customer." });
  }
}

module.exports = { listCustomers, getCustomerById, updateCustomer };
