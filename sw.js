// Chatspace service worker: app-shell cache + offline fallback.
// Bump CACHE_NAME whenever index.html changes so every device gets the new version.
const CACHE_NAME = "chatspace-shell-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];
const CDN_HOST = "cdn.jsdelivr.net";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Live data (Supabase auth, database, realtime, avatars): always network, never cached.
  if (url.hostname.endsWith("supabase.co")) return;

  // Pinned CDN library (versioned URL never changes): cache first.
  if (url.hostname === CDN_HOST) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Other third-party requests: leave to the browser.
  if (url.origin !== self.location.origin) return;

  // Page load: network first so updates arrive, cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst());
    return;
  }

  // Icons, manifest and other same-origin files: serve cache, refresh in background.
  event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE_NAME)).put(req, res.clone());
  return res;
}

async function networkFirst() {
  try {
    const res = await fetch("./index.html", { cache: "no-cache" });
    if (res.ok) (await caches.open(CACHE_NAME)).put("./index.html", res.clone());
    return res;
  } catch {
    const cached = await caches.match("./index.html");
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || network;
}
