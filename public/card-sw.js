// RD Expenses service worker, scoped to /card/. It caches nothing: every open
// loads the current app from the network, so a deploy reaches installed phones
// with no reinstall. It exists to make the app installable and to receive
// push notifications.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Network as usual (a fetch handler keeps older Chrome versions offering install).
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "RD Expenses", {
        body: data.body || "",
        icon: "/card/icons/icon-192.png",
        badge: "/card/icons/icon-192.png",
        data: { url: data.url || "/card/" },
        tag: data.tag,
      }),
      typeof data.badge === "number" && self.navigator.setAppBadge
        ? self.navigator.setAppBadge(data.badge).catch(() => {})
        : null,
    ]),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/card/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin + "/card/"));
      if (open) return open.navigate(url).then((c) => (c || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
