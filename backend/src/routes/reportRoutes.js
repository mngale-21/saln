// ============================================================================
// Report Routes — ADMIN-only: dashboard summary + downloadable PDF.
// ============================================================================

const express = require("express");
const router = express.Router();

const { getSummary, getDetailed, downloadPdf } = require("../controllers/reportController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/summary", protect, authorize("ADMIN"), getSummary);
router.get("/detailed", protect, authorize("ADMIN"), getDetailed);
router.get("/pdf", protect, authorize("ADMIN"), downloadPdf);

module.exports = router;
