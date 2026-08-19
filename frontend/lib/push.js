"use client";

import api from "./api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * registerForPushNotifications
 * Registers the service worker and subscribes this device for Web Push,
 * then hands the subscription to the backend. This is what makes an alert
 * reach this device even when the app isn't open — and, deliberately,
 * this subscription is never cleared on logout, so alerts targeted at this
 * person keep arriving even while they're signed out of the app itself.
 *
 * Safe to call repeatedly (e.g. on every dashboard mount) — it's a no-op
 * once already subscribed, and quietly does nothing if the browser doesn't
 * support push, permission is denied, or the server has no VAPID key
 * configured yet.
 */
export async function registerForPushNotifications() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker.register("/sw.js");

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Already subscribed on this device — make sure the backend still
      // has it (e.g. after a fresh login on the same browser).
      await api.post("/push/subscribe", existing.toJSON()).catch(() => {});
      return;
    }

    const { data } = await api.get("/push/public-key");
    if (!data?.publicKey) return; // server has no VAPID key configured yet

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });

    await api.post("/push/subscribe", subscription.toJSON());
  } catch {
    // Push is a nice-to-have layered on top of the in-app bell and the
    // Socket.IO alarm — never let a failure here break the app.
  }
}
