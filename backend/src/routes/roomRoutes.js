// ============================================================================
// Room Routes — rooms + the staff/service assignment roster.
// Session start/confirm/end/payment routes live in sessionRoutes.js.
// ============================================================================

const express = require("express");
const router = express.Router();

const {
  getRoomsByBranch,
  createRoom,
  deleteRoom,
  setRoomStatus,
  assignStaffToRoom,
  removeAssignment,
  getRoomAnalytics,
} = require("../controllers/roomController");
const { receivePayment, refundTransaction } = require("../controllers/sessionController");
const { protect, authorize, restrictToOwnBranch } = require("../middleware/authMiddleware");

router.get("/", protect, restrictToOwnBranch("query"), getRoomsByBranch);
router.post("/", protect, authorize("ADMIN"), createRoom);
router.delete("/:roomId", protect, authorize("ADMIN"), deleteRoom);
router.patch("/:roomId/status", protect, authorize("ADMIN"), setRoomStatus);

// ADMIN only — powers the interactive Overview: click a room, see its
// live metrics.
router.get("/:roomId/analytics", protect, authorize("ADMIN"), getRoomAnalytics);

router.post("/:roomId/assignments", protect, authorize("ADMIN"), assignStaffToRoom);
router.delete("/assignments/:assignmentId", protect, authorize("ADMIN"), removeAssignment);

// Kept here for backwards compatibility with the original route table.
router.post(
  "/transactions/:transactionId/pay",
  protect,
  authorize("ADMIN", "CASHIER"),
  receivePayment
);
router.post(
  "/transactions/:transactionId/refund",
  protect,
  authorize("ADMIN", "CASHIER"),
  refundTransaction
);

module.exports = router;
