// ============================================================================
// Payment Controller
// A dedicated ledger of every Transaction — separate from the Reports
// module's broader "every service scenario" view. This is the
// straightforward "show me the payments" screen: filter by status, date,
// or customer, and refund directly from here.
// ============================================================================

const prisma = require("../config/prismaClient");

function parseDateRange(from, to) {
  if (!from && !to) return { start: null, end: null };
  const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const end = to ? new Date(`${to}T23:59:59.999Z`) : from ? new Date(`${from}T23:59:59.999Z`) : null;
  return { start, end };
}

/**
 * GET /api/payments?branchId=&status=&from=&to=&search=
 * Branch-scoped for non-admins. `status` is one of PAID/UNPAID/PARTIAL/
 * REFUNDED (omit for all). `search` matches the linked session's customer
 * name or phone.
 */
async function listPayments(req, res) {
  try {
    const { branchId, status, from, to, search } = req.query;
    if (!branchId) return res.status(400).json({ message: "branchId query param is required." });

    const { start, end } = parseDateRange(from, to);

    const transactions = await prisma.transaction.findMany({
      where: {
        branchId,
        ...(status ? { status } : {}),
        ...(start && end ? { createdAt: { gte: start, lte: end } } : {}),
        ...(search
          ? {
              session: {
                OR: [
                  { customerName: { contains: search, mode: "insensitive" } },
                  { customerPhone: { contains: search } },
                ],
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        session: {
          include: {
            room: true,
            service: true,
            staff: { select: { firstName: true, lastName: true } },
          },
        },
        cashier: { select: { firstName: true, lastName: true, role: true } },
        refundedBy: { select: { firstName: true, lastName: true, role: true } },
      },
      take: 300,
    });

    const totals = transactions.reduce(
      (acc, t) => {
        const amount = Number(t.amount);
        if (t.status === "PAID") acc.received += amount;
        if (t.status === "UNPAID" || t.status === "PARTIAL") acc.uncollected += amount;
        if (t.status === "REFUNDED") acc.refunded += Number(t.refundAmount ?? amount);
        return acc;
      },
      { received: 0, uncollected: 0, refunded: 0 }
    );

    return res.status(200).json({ transactions, totals });
  } catch (error) {
    console.error("listPayments error:", error);
    return res.status(500).json({ message: "Server error fetching payments." });
  }
}

module.exports = { listPayments };
