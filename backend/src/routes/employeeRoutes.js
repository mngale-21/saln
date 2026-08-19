// ============================================================================
// Employee Routes — ADMIN-only staff/cashier directory.
// ============================================================================

const express = require("express");
const router = express.Router();

const { listEmployeesByBranch, deleteEmployee } = require("../controllers/employeeController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, authorize("ADMIN"), listEmployeesByBranch);
router.delete("/:id", protect, authorize("ADMIN"), deleteEmployee);

module.exports = router;
