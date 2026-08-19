// ============================================================================
// Payment Routes — the dedicated payments ledger.
// ============================================================================

const express = require("express");
const router = express.Router();

const { listPayments } = require("../controllers/paymentController");
const { protect, restrictToOwnBranch } = require("../middleware/authMiddleware");

router.get("/", protect, restrictToOwnBranch("query"), listPayments);

module.exports = router;
