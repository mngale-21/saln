// ============================================================================
// Service Routes — the catalog Cashiers pick from when starting a session
// ============================================================================

const express = require("express");
const router = express.Router();

const { getServicesByBranch, createService, deleteService } = require("../controllers/serviceController");
const { getServiceAvailability } = require("../controllers/sessionController");
const { protect, authorize, restrictToOwnBranch } = require("../middleware/authMiddleware");

// Any authenticated user can read the catalog (needed for the start-session picker)
router.get("/", protect, restrictToOwnBranch("query"), getServicesByBranch);

// Any authenticated user: which rooms/staff offering this service are free right now.
router.get("/:serviceId/availability", protect, restrictToOwnBranch("query"), getServiceAvailability);

// ADMIN only — manage the catalog
router.post("/", protect, authorize("ADMIN"), createService);
router.delete("/:id", protect, authorize("ADMIN"), deleteService);

module.exports = router;
