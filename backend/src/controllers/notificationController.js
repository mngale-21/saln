// ============================================================================
// Notification Controller
// Backs the bell icon: any notification targeted at me directly, at my
// role+branch, or (if I'm an admin) system-wide.
// ============================================================================

const prisma = require("../config/prismaClient");

async function listMyNotifications(req, res) {
  try {
    const { role, branchId, id } = req.user;

    const or = [{ userId: id }];
    if (branchId) or.push({ branchId, targetRole: role });
    if (role === "ADMIN") or.push({ targetRole: "ADMIN" });

    const notifications = await prisma.notification.findMany({
      where: { OR: or },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("listMyNotifications error:", error);
    return res.status(500).json({ message: "Server error fetching notifications." });
  }
}

async function markRead(req, res) {
  try {
    const { id } = req.params;
    await prisma.notification.update({ where: { id }, data: { read: true } });
    return res.status(200).json({ message: "Marked as read." });
  } catch (error) {
    console.error("markRead error:", error);
    return res.status(500).json({ message: "Server error updating the notification." });
  }
}

/**
 * DELETE /api/notifications/:id
 * Clears (deletes) a single notification from the bell.
 */
async function clearNotification(req, res) {
  try {
    const { id } = req.params;
    const { role, branchId, id: userId } = req.user;

    // Only let someone clear a notification that was actually visible to
    // them (their own, their role+branch, or — for admins — anything).
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) return res.status(404).json({ message: "Notification not found." });

    const visible =
      notification.userId === userId ||
      (notification.targetRole === role && (!notification.branchId || notification.branchId === branchId)) ||
      role === "ADMIN";
    if (!visible) {
      return res.status(403).json({ message: "You can't clear a notification that wasn't sent to you." });
    }

    await prisma.notification.delete({ where: { id } });
    return res.status(200).json({ message: "Notification cleared." });
  } catch (error) {
    console.error("clearNotification error:", error);
    return res.status(500).json({ message: "Server error clearing the notification." });
  }
}

/**
 * DELETE /api/notifications
 * Clears every notification currently visible to me (mirrors the same
 * visibility rule listMyNotifications uses).
 */
async function clearAllNotifications(req, res) {
  try {
    const { role, branchId, id } = req.user;

    const or = [{ userId: id }];
    if (branchId) or.push({ branchId, targetRole: role });
    if (role === "ADMIN") or.push({ targetRole: "ADMIN" });

    await prisma.notification.deleteMany({ where: { OR: or } });
    return res.status(200).json({ message: "All notifications cleared." });
  } catch (error) {
    console.error("clearAllNotifications error:", error);
    return res.status(500).json({ message: "Server error clearing notifications." });
  }
}

module.exports = { listMyNotifications, markRead, clearNotification, clearAllNotifications };
