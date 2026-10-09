// Peak Log service worker: precaches the built app shell (list written at build time to precache.json),
// then serves it cache-first so every route loads offline. Same-origin only; nothing leaves the device.
// Every URL is resolved against this worker's scope, so the app works at '/' and under '/<repo>/'.
const CACHE_PREFIX = 'peaklog-shell-';
const scopeUrl = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(scopeUrl('precache.json'), { cache: 'reload' });
      if (!res.ok) throw new Error('precache.json unavailable');
      const { version, files } = await res.json();
      const cache = await caches.open(CACHE_PREFIX + version);
      await cache.addAll(files.map((f) => new Request(scopeUrl(f), { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(scopeUrl('precache.json'), { cache: 'no-store' }).catch(() => null);
      const current = res && res.ok ? CACHE_PREFIX + (await res.json()).version : null;
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== current) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        // Offline navigation to any route: serve the app shell (the router reads the hash).
        if (req.mode === 'navigate') {
          const shell = (await caches.match(scopeUrl('./'), { ignoreVary: true })) ?? (await caches.match(scopeUrl('index.html'), { ignoreVary: true }));
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});

// build 97f3035a50d8
