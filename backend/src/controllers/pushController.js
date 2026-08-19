// ============================================================================
// Push Controller
// Lets a device register to receive real OS-level notifications, and hands
// out the public VAPID key the frontend needs to create that subscription.
// Subscribing survives logging out of the app on purpose — the whole point
// is that an alert (a delayed service, a finished timer) can still reach
// someone's phone or desktop even when they aren't actively signed in.
// ============================================================================

const prisma = require("../config/prismaClient");
const { VAPID_PUBLIC_KEY, isConfigured } = require("../utils/push");

/**
 * GET /api/push/public-key
 * Any authenticated user. Returns the public VAPID key (safe to expose)
 * used by the browser's PushManager.subscribe() call.
 */
async function getPublicKey(req, res) {
  if (!isConfigured) {
    return res.status(503).json({ message: "Push notifications aren't configured on this server yet." });
  }
  return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
}

/**
 * POST /api/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth } } — the raw PushSubscription
 * object from the browser. Upserts by endpoint so re-subscribing (e.g.
 * after clearing site data) doesn't create duplicates.
 */
async function subscribe(req, res) {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "A valid push subscription (endpoint + keys) is required." });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.user.id },
    });

    return res.status(201).json({ message: "Device registered for notifications." });
  } catch (error) {
    console.error("subscribe (push) error:", error);
    return res.status(500).json({ message: "Server error registering this device." });
  }
}

/**
 * POST /api/push/unsubscribe
 * Body: { endpoint }. Used when the person explicitly turns off
 * notifications for this device (not called on ordinary logout).
 */
async function unsubscribe(req, res) {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ message: "endpoint is required." });
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    return res.status(200).json({ message: "Device unregistered." });
  } catch (error) {
    console.error("unsubscribe (push) error:", error);
    return res.status(500).json({ message: "Server error unregistering this device." });
  }
}

module.exports = { getPublicKey, subscribe, unsubscribe };
