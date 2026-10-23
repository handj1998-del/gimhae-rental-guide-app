/* Offline support: guide page and assets are cached; admin and PDFs are never cached. */
const CACHE = "gimhae-guide-v1";
const CORE = ["/", "/app.js", "/style.css", "/pwa.css", "/icons/icon-192.png", "/icons/favicon-32.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/pdf/") || url.pathname === "/manifest.webmanifest" || url.searchParams.has("src")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { if (r.ok && url.pathname === "/") { const c = r.clone(); caches.open(CACHE).then((x) => x.put("/", c)); } return r; })
      .catch(() => caches.match("/")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; })));
});
