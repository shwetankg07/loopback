// Offline support: pages network-first, everything else (hashed assets, compilers, Pyodide) cache-first.
// ponytail: vendor files aren't content-hashed, so bump CACHE when a toolchain version changes.
// Java's CheerpJ runtime comes from its CDN with Range requests and isn't cached, so Java needs a connection.
const CACHE = "loopback-v2";

// The first visit loads the page before this worker controls it, so precache the shell and what it references;
// workers and toolchains load later and get cached on the way through.
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(self.registration.scope);
    const html = await res.clone().text();
    await cache.put(self.registration.scope, res);
    const urls = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((m) => new URL(m[1], self.registration.scope).href)
      .filter((u) => u.startsWith(location.origin));
    await cache.addAll(urls);
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || req.headers.has("range")) return;
  e.respondWith(req.mode === "navigate" ? networkFirst(req) : cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreVary: true })) ?? Response.error();
  }
}
