/* Offline support. v2: network-first for pages AND assets, so phones always get updates when online;
   the cache is only a fallback when offline. Admin, PDFs and the manifest are never cached. */
const CACHE = "gimhae-guide-v2";
const CORE = ["/", "/app.js", "/style.css", "/pwa.css", "/icons/icon-192.png", "/icons/favicon-32.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/pdf/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/sw.js" || url.searchParams.has("src")) return;
  const key = req.mode === "navigate" ? "/" : url.pathname; // ignore ?v= / ?lang= for the offline copy
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && (req.mode !== "navigate" || url.pathname === "/")) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(key, c)); }
    return r;
  }).catch(() => caches.match(key)));
});
