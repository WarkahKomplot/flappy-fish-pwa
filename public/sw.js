// CACHE_NAME is the single knob that must change per deploy of cached shell
// content (HTML, manifest, icons). The activate handler deletes every other
// cache, so bumping it invalidates old shell copies on the next SW update.
const CACHE_NAME = 'flappy-fish-v4';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

// Install: Pre-cache core shell assets for instant 100% offline gameplay
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('Flappy Fish SW pre-cache notice:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean up obsolete caches and claim existing clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Every cache write goes through here. Call sites wrap the returned promise in
// event.waitUntil so the browser cannot kill the write mid-flight.
const cachePut = (request, response) =>
  caches.open(CACHE_NAME).then((cache) => cache.put(request, response));

const isNavigationRequest = (request) =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  (request.headers.get('accept') || '').includes('text/html');

// Same-origin responses only ('basic'); never cache opaque/cross-origin replies.
const isCacheableResponse = (response) =>
  Boolean(response) && response.ok && response.type === 'basic';

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip non-HTTP(S) schemes (browser extensions, etc.)
  if (!url.protocol.startsWith('http')) return;

  const sameOrigin = url.origin === self.location.origin;

  // Navigations / HTML documents: network-first so deploys reach players.
  // Fall back to the cached app shell only when the network is unavailable.
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (sameOrigin && isCacheableResponse(networkResponse)) {
            event.waitUntil(cachePut(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match('./index.html')
            .then((res) => res || caches.match('./'))
            .then((res) => res || Response.error())
        )
    );
    return;
  }

  // Runtime caching below is same-origin only.
  if (!sameOrigin) return;

  // Hashed build assets (./assets/**): cache-first — the URL changes whenever
  // the content changes, so a cached copy is always safe to serve.
  const isHashedAsset = url.pathname.includes('/assets/');

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
            event.waitUntil(cachePut(event.request, networkResponse.clone()));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Core shell assets (manifest, icons): stale-while-revalidate — serve the
  // cached copy immediately while refreshing it in the background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const revalidate = fetch(event.request).then((networkResponse) => {
        if (isCacheableResponse(networkResponse)) {
          event.waitUntil(cachePut(event.request, networkResponse.clone()));
        }
        return networkResponse;
      });
      if (cached) {
        event.waitUntil(revalidate.then(() => undefined, () => undefined));
        return cached;
      }
      return revalidate.catch(() => Response.error());
    })
  );
});
