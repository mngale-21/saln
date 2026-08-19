// ============================================================================
// Service Controller
// Services are what a Cashier picks from when starting a room session (e.g.
// "Haircut", "Full Body Massage"). Admins manage the catalog per branch;
// Cashiers/Staff only need to read it.
// ============================================================================

const prisma = require("../config/prismaClient");

/**
 * GET /api/services?branchId=...
 * Any authenticated user — powers the "select a service" step when starting
 * a session. Ordered by category first (uncategorized services last) so
 * the frontend can group variants (e.g. several kinds of "Massage")
 * together without extra client-side work.
 */
async function getServicesByBranch(req, res) {
  try {
    const { branchId } = req.query;
    if (!branchId) {
      return res.status(400).json({ message: "branchId query param is required." });
    }

    const services = await prisma.service.findMany({
      where: { branchId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return res.status(200).json({ services });
  } catch (error) {
    console.error("getServicesByBranch error:", error);
    return res.status(500).json({ message: "Server error fetching services." });
  }
}

/**
 * POST /api/services
 * ADMIN only. Body: { name, price, durationMins, branchId, category? }
 * `category` is optional — e.g. several variants ("Full Body Massage",
 * "Four-Hand Massage") can share category "Massage", each with its own
 * price/duration; leave it blank for a standalone service like "Haircut".
 */
async function createService(req, res) {
  try {
    const { name, price, durationMins, branchId, category } = req.body;

    if (!name || price === undefined || !durationMins || !branchId) {
      return res.status(400).json({
        message: "name, price, durationMins and branchId are required.",
      });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ message: "branchId does not match any known branch." });
    }

    const service = await prisma.service.create({
      data: {
        name,
        price,
        durationMins: Number(durationMins),
        branchId,
        category: category?.trim() || null,
      },
    });

    return res.status(201).json({ message: "Service created.", service });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "That service name already exists for this branch." });
    }
    console.error("createService error:", error);
    return res.status(500).json({ message: "Server error creating service." });
  }
}

/**
 * DELETE /api/services/:id
 * ADMIN only.
 */
async function deleteService(req, res) {
  try {
    const { id } = req.params;
    await prisma.service.delete({ where: { id } });
    return res.status(200).json({ message: "Service removed." });
  } catch (error) {
    console.error("deleteService error:", error);
    return res.status(500).json({ message: "Server error removing service." });
  }
}

module.exports = { getServicesByBranch, createService, deleteService };
