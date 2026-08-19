// ============================================================================
// Notification Helper
// Every alert in the system (delayed service, additional-service request,
// early-end report, etc.) goes through here: it is (1) persisted to the
// notifications table so it survives page reloads/offline devices, (2)
// pushed instantly over Socket.IO to whoever is connected right now, and
// (3) sent as a real Web Push device notification — which, unlike the
// Socket.IO push, reaches the person's phone/desktop even if they aren't
// currently logged into the app or have the tab open at all.
//
// Rooms used on the socket server (see server.js):
//   `branch:<branchId>:role:<ROLE>`  — every connected user of that role at that branch
//   `user:<userId>`                  — one specific user, any branch
// ============================================================================

const prisma = require("../config/prismaClient");
const { sendPush } = require("./push");

/**
 * Create + broadcast a notification.
 * @param {import("socket.io").Server} io
 * @param {object} opts
 * @param {string} [opts.branchId]
 * @param {string} [opts.userId]      target one specific user
 * @param {string} [opts.targetRole]  ADMIN | CASHIER | STAFF — broadcast to every user with this role at the branch
 * @param {string} opts.type          NotificationType enum value
 * @param {string} opts.message
 * @param {string} [opts.sessionId]
 * @param {boolean} [opts.playSound]  whether connected clients should ring an audio alert / device buzz
 */
async function notify(io, opts) {
  const { branchId, userId, targetRole, type, message, sessionId, playSound = false } = opts;

  const notification = await prisma.notification.create({
    data: {
      branchId: branchId || null,
      userId: userId || null,
      targetRole: targetRole || null,
      type,
      message,
      sessionId: sessionId || null,
    },
  });

  const payload = { ...notification, playSound };

  if (io) {
    if (userId) {
      io.to(`user:${userId}`).emit("notification:new", payload);
    }
    if (targetRole && branchId) {
      io.to(`branch:${branchId}:role:${targetRole}`).emit("notification:new", payload);
    }
    // Admins should always see everything system-wide, even without a branchId.
    if (targetRole !== "ADMIN") {
      io.to(`role:ADMIN`).emit("notification:new", payload);
    }
  }

  // Fire-and-forget: a real device push, independent of whether the app
  // is open or the person is logged in right now.
  sendPush(
    { userId, targetRole, branchId },
    { title: "Salon System", body: message, tag: type, playSound, notificationId: notification.id }
  ).catch(() => {});

  return notification;
}

module.exports = { notify };
