// ============================================================================
// Report Controller
// ADMIN-only. Three views onto the same underlying data, all sharing the
// same date-range filter (a specific day, or "all time since launch" when
// no range is given):
//   - GET /api/reports/summary   quick counters + financial totals
//   - GET /api/reports/detailed  a flat table of every service scenario —
//     completed, cancelled, delayed, ended early, and expired — powering
//     the interactive on-screen preview before a PDF is generated
//   - GET /api/reports/pdf       the same data as a downloadable PDF
//
// Financial categories, defined precisely so "zero monetary loss" is an
// auditable claim rather than a slogan:
//   - received   = sum of transaction.amount where status = PAID
//   - uncollected = sum of transaction.amount where status IN (UNPAID, PARTIAL)
//                   — a service was delivered (or cut short) but the money
//                   for it hasn't been (fully) collected yet
//   - refunded   = sum of transaction.refundAmount where status = REFUNDED
//   - net        = received - refunded
// Every dollar is tied to the staff member who delivered the service
// (session.staff), the person who started the booking (session.startedBy),
// whoever ended/cancelled it (session.endedBy), the cashier who took the
// payment (transaction.cashier), and — if applicable — whoever issued a
// refund (transaction.refundedBy).
// ============================================================================

const PDFDocument = require("pdfkit");
const prisma = require("../config/prismaClient");

const PERSON_SELECT = { select: { firstName: true, lastName: true, role: true } };

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD into UTC day-boundary Dates, or null/null for "all time". */
function parseDateRange(from, to) {
  if (!from && !to) return { start: null, end: null };
  const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const end = to ? new Date(`${to}T23:59:59.999Z`) : from ? new Date(`${from}T23:59:59.999Z`) : null;
  return { start, end };
}

function actorLabel(person) {
  if (!person) return "—";
  return `${person.firstName} ${person.lastName} (${person.role.toLowerCase()})`;
}

const SESSION_INCLUDE = {
  room: true,
  service: true,
  staff: PERSON_SELECT,
  startedBy: PERSON_SELECT,
  endedBy: PERSON_SELECT,
  transaction: { include: { cashier: PERSON_SELECT, refundedBy: PERSON_SELECT } },
};

async function gatherReportData(branchId, from, to) {
  const branchFilter = branchId ? { branchId } : {};
  const { start, end } = parseDateRange(from, to);
  const dateFilter = start && end ? { registeredAt: { gte: start, lte: end } } : {};
  const where = { ...branchFilter, ...dateFilter };

  const [sessions, branch] = await Promise.all([
    prisma.session.findMany({
      where,
      include: SESSION_INCLUDE,
      orderBy: { registeredAt: "desc" },
    }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId } }) : Promise.resolve(null),
  ]);

  let received = 0;
  let uncollected = 0;
  let refunded = 0;
  const totals = {
    completedCount: 0,
    cancelledCount: 0,
    expiredCount: 0,
    onHoldCount: 0,
    delayedCount: 0,
    earlyEndedCount: 0,
  };

  const rows = sessions.map((s) => {
    if (s.status === "COMPLETED") totals.completedCount += 1;
    if (s.status === "CANCELLED") totals.cancelledCount += 1;
    if (s.status === "EXPIRED") totals.expiredCount += 1;
    if (s.status === "ON_HOLD") totals.onHoldCount += 1;
    if (s.delayed) totals.delayedCount += 1;
    if (s.endedEarly) totals.earlyEndedCount += 1;

    let financialOutcome = "n/a";
    const t = s.transaction;
    if (t) {
      const amount = Number(t.amount);
      if (t.status === "PAID") {
        received += amount;
        financialOutcome = "paid";
      } else if (t.status === "UNPAID" || t.status === "PARTIAL") {
        uncollected += amount;
        financialOutcome = t.status.toLowerCase();
      } else if (t.status === "REFUNDED") {
        refunded += Number(t.refundAmount ?? amount);
        financialOutcome = "refunded";
      }
    }

    return {
      id: s.id,
      customerName: s.customerName || "—",
      room: s.room ? `${s.room.name} (#${s.room.roomNumber})` : "—",
      service: s.service?.name || "—",
      staff: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : "—",
      status: s.status,
      delayed: s.delayed,
      endedEarly: s.endedEarly,
      registeredAt: s.registeredAt,
      endedAt: s.endedAt,
      amount: t ? Number(t.amount) : Number(s.service?.price || 0),
      paymentStatus: t?.status || null,
      transactionId: t?.id || null,
      financialOutcome,
      startedBy: actorLabel(s.startedBy),
      endedBy: actorLabel(s.endedBy),
      cashier: t ? actorLabel(t.cashier) : "—",
      refundAmount: t?.refundAmount != null ? Number(t.refundAmount) : null,
      refundedBy: t?.refundedBy ? actorLabel(t.refundedBy) : null,
      refundReason: t?.refundReason || null,
    };
  });

  return {
    branchName: branch?.name || "All branches",
    range: from || to ? { from: from || to, to: to || from } : { from: null, to: null },
    generatedAt: new Date(),
    rows,
    totals: {
      ...totals,
      totalSessions: sessions.length,
      received,
      uncollected,
      refunded,
      net: received - refunded,
    },
  };
}

/**
 * GET /api/reports/summary?branchId=&from=&to=
 */
async function getSummary(req, res) {
  try {
    const { branchId, from, to } = req.query;
    const data = await gatherReportData(branchId || null, from || null, to || null);
    // The summary endpoint doesn't need the full row list — keep it light.
    const { rows, ...summary } = data;
    return res.status(200).json(summary);
  } catch (error) {
    console.error("getSummary error:", error);
    return res.status(500).json({ message: "Server error building the report summary." });
  }
}

/**
 * GET /api/reports/detailed?branchId=&from=&to=
 * Powers the interactive on-screen table preview, shown before the person
 * downloads the PDF.
 */
async function getDetailed(req, res) {
  try {
    const { branchId, from, to } = req.query;
    const data = await gatherReportData(branchId || null, from || null, to || null);
    return res.status(200).json(data);
  } catch (error) {
    console.error("getDetailed error:", error);
    return res.status(500).json({ message: "Server error building the detailed report." });
  }
}

/**
 * GET /api/reports/pdf?branchId=&from=&to=
 * Streams a PDF built from the exact same rows the on-screen preview shows.
 */
async function downloadPdf(req, res) {
  try {
    const { branchId, from, to } = req.query;
    const data = await gatherReportData(branchId || null, from || null, to || null);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="salon-system-report-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    doc.fontSize(20).text("Salon System — Service & Financial Report", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#555");
    doc.text(`Branch: ${data.branchName}`);
    doc.text(
      data.range.from
        ? `Period: ${data.range.from}${data.range.to && data.range.to !== data.range.from ? ` to ${data.range.to}` : ""}`
        : "Period: All time since launch"
    );
    doc.text(`Generated: ${data.generatedAt.toLocaleString()}`);
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(14).text("Summary");
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#222");
    doc.text(`Total sessions: ${data.totals.totalSessions}`);
    doc.text(`Completed: ${data.totals.completedCount}   Cancelled: ${data.totals.cancelledCount}   Expired (no-show): ${data.totals.expiredCount}   On hold now: ${data.totals.onHoldCount}`);
    doc.text(`Delayed confirmations: ${data.totals.delayedCount}   Ended early: ${data.totals.earlyEndedCount}`);
    doc.moveDown(0.5);
    doc.text(`Payments received: TZS ${data.totals.received.toLocaleString()}`);
    doc.text(`Lost / uncollected funds: TZS ${data.totals.uncollected.toLocaleString()}`);
    doc.text(`Refunded: TZS ${data.totals.refunded.toLocaleString()}`);
    doc.font("Helvetica-Bold").text(`Net revenue: TZS ${data.totals.net.toLocaleString()}`);
    doc.font("Helvetica");
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(14).text("Service Scenarios");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#222");
    if (data.rows.length === 0) {
      doc.text("No sessions recorded in this period.");
    } else {
      data.rows.forEach((r) => {
        const financial =
          r.financialOutcome === "paid"
            ? `paid TZS ${r.amount.toLocaleString()}`
            : r.financialOutcome === "refunded"
            ? `refunded TZS ${(r.refundAmount ?? r.amount).toLocaleString()} by ${r.refundedBy}`
            : r.financialOutcome === "unpaid" || r.financialOutcome === "partial"
            ? `${r.financialOutcome} — TZS ${r.amount.toLocaleString()} owed`
            : "no charge";
        doc.text(
          `• ${new Date(r.registeredAt).toLocaleString()} — ${r.room} — ${r.customerName} — ${r.service} — ` +
            `staff: ${r.staff} — status: ${r.status}${r.delayed ? " (delayed)" : ""}${r.endedEarly ? " (ended early)" : ""} — ${financial}` +
            (r.status === "CANCELLED" || r.status === "COMPLETED" ? ` — closed by: ${r.endedBy}` : "")
        );
      });
    }

    doc.end();
  } catch (error) {
    console.error("downloadPdf error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error generating the PDF report." });
    } else {
      res.end();
    }
  }
}

module.exports = { getSummary, getDetailed, downloadPdf };
