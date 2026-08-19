// ============================================================================
// Session Routes — the timer + payment + hold engine:
// register (with mandatory payment) -> confirm arrival -> service ->
// (on-hold if 10 min late, clear-hold to resume) -> (optional additional
// service, also paid up front) -> end/cancel -> refund if needed.
// ============================================================================

const express = require("express");
const router = express.Router();

const {
  registerCustomer,
  confirmArrival,
  clearHold,
  listSessions,
  requestAdditionalService,
  confirmAdditionalService,
  cancelSession,
  endSession,
} = require("../controllers/sessionController");
const { protect, authorize, restrictToOwnBranch } = require("../middleware/authMiddleware");

router.get("/", protect, restrictToOwnBranch("query"), listSessions);

// CASHIER/ADMIN: record the customer, confirm payment received, and start
// the 10-minute arrival countdown. Either a specific room, or just a
// service (auto-assigns any free room/staff).
router.post("/", protect, authorize("ADMIN", "CASHIER"), restrictToOwnBranch("body"), registerCustomer);

// STAFF/ADMIN: confirm the customer has arrived — stops the countdown,
// starts the service duration timer.
router.post("/:id/confirm-arrival", protect, authorize("ADMIN", "STAFF"), confirmArrival);

// CASHIER/ADMIN (may reassign room/service) or STAFF (own original slot
// only): the customer showed up after going on hold — resume service.
router.post("/:id/clear-hold", protect, authorize("ADMIN", "CASHIER", "STAFF"), clearHold);

// STAFF/ADMIN: request an additional service once the current one finished.
router.post(
  "/:id/additional-service",
  protect,
  authorize("ADMIN", "STAFF"),
  requestAdditionalService
);

// CASHIER/ADMIN: confirm a staff-requested additional service and take
// payment for it before it starts.
router.post(
  "/:id/confirm-additional",
  protect,
  authorize("ADMIN", "CASHIER"),
  confirmAdditionalService
);

// CASHIER/ADMIN/STAFF (assigned only): cancel a booking that hasn't started
// yet (PENDING_ARRIVAL or ON_HOLD).
router.post("/:id/cancel", protect, authorize("ADMIN", "CASHIER", "STAFF"), cancelSession);

// CASHIER/ADMIN/STAFF (assigned only): end a session, early or on schedule.
router.post("/:id/end", protect, authorize("ADMIN", "CASHIER", "STAFF"), endSession);

module.exports = router;
