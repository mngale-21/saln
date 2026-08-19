// ============================================================================
// Service Worker — Web Push
// This runs independently of any open tab. When the browser's push service
// wakes it up with a message, it shows a real OS-level notification — this
// is what lets an alert (a delayed service, a finished timer) reach the
// device even if the app isn't open and even after the person has logged
// out of the app itself. Logging out only clears the app's session; it
// does not unregister this service worker or the push subscription.
// ============================================================================

self.addEventListener("push", (event) => {
  let data = { title: "Salon System", body: "You have a new alert." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Fall back to the default text above if the payload isn't JSON.
  }

  const options = {
    body: data.body,
    tag: data.tag || "salon-system",
    icon: "/icon.png",
    badge: "/icon.png",
    vibrate: data.playSound ? [200, 100, 200, 100, 200] : [100],
    data: { notificationId: data.notificationId },
    requireInteraction: Boolean(data.playSound),
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
      return undefined;
    })
  );
});
