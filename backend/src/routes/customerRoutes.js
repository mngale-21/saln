// ============================================================================
// Customer Routes — the customer directory.
// ============================================================================

const express = require("express");
const router = express.Router();

const { listCustomers, getCustomerById, updateCustomer } = require("../controllers/customerController");
const { protect, restrictToOwnBranch } = require("../middleware/authMiddleware");

router.get("/", protect, restrictToOwnBranch("query"), listCustomers);
router.get("/:id", protect, getCustomerById);
router.patch("/:id", protect, updateCustomer);

module.exports = router;
