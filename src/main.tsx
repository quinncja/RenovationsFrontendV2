// Stale-bundle self-heal: after a deploy, a tab still holding the previous
// index.html asks for chunk hashes that no longer exist; Cloudflare's SPA
// fallback answers with index.html and the dynamic import fails ("disallowed
// MIME type text/html"). Vite raises vite:preloadError for exactly that case,
// so reload once to pick up the current manifest. The sessionStorage latch
// stops a reload loop if the fresh bundle is itself broken.
window.addEventListener("vite:preloadError", (event) => {
  const key = "rd:chunk-reload";
  if (sessionStorage.getItem(key) === location.href) return;
  sessionStorage.setItem(key, location.href);
  event.preventDefault();
  location.reload();
});

if (location.pathname.startsWith("/r/")) {
  void import("./modules/cc/ReceiptPage").then((m) => m.mountReceiptPage());
} else {
  void import("./dashboardEntry").then((m) => m.mountDashboard());
}
