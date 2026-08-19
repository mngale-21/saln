// ============================================================================
// Web Push
// This is what makes an alert reach someone's phone or desktop as a real
// device notification even when they aren't logged into the app right now
// — Web Push is delivered by the browser's own push service straight to
// the device, completely independent of our JWT session. Logging out does
// NOT stop these; only revoking notification permission or uninstalling
// the PWA does.
//
// Requires VAPID keys in .env — generate a pair with:
//   npx web-push generate-vapid-keys
// and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (a mailto:
// or https: contact URL) in backend/.env. Until those are set, push sends
// are silently skipped — everything else (in-app bell, Socket.IO, audio
// alarm) keeps working regardless.
// ============================================================================

const webpush = require("web-push");
const prisma = require("../config/prismaClient");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * Resolve a notification's target (a specific userId, or a role broadcast
 * within a branch) down to the actual list of user ids it should reach.
 */
async function resolveTargetUserIds({ userId, targetRole, branchId }) {
  if (userId) return [userId];
  if (targetRole && branchId) {
    const users = await prisma.user.findMany({
      where: { role: targetRole, branchId, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (targetRole) {
    const users = await prisma.user.findMany({
      where: { role: targetRole, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  return [];
}

/**
 * Send a push notification to every device a set of users has subscribed
 * from. Silently a no-op if VAPID keys aren't configured, and self-heals
 * by deleting any subscription the push service reports as gone (410/404).
 */
async function sendPush(targets, payload) {
  if (!isConfigured) return;

  try {
    const userIds = await resolveTargetUserIds(targets);
    if (userIds.length === 0) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body
          );
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            // The browser/OS has dropped this subscription — stop trying it.
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error("web-push send error:", error.message);
          }
        }
      })
    );
  } catch (error) {
    console.error("sendPush error:", error);
  }
}

module.exports = { sendPush, isConfigured, VAPID_PUBLIC_KEY };
