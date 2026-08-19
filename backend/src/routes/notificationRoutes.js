// ============================================================================
// Notification Routes — the bell icon, for any authenticated user.
// ============================================================================

const express = require("express");
const router = express.Router();

const { listMyNotifications, markRead, clearNotification, clearAllNotifications } = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, listMyNotifications);
router.patch("/:id/read", protect, markRead);
router.delete("/:id", protect, clearNotification);
router.delete("/", protect, clearAllNotifications);

module.exports = router;
