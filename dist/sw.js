const CACHE_NAME = 'flappy-fish-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
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

// Fetch: Cache-First offline strategy (Review Focus 5)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip non-HTTP(S) schemes (browser extensions, etc.)
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Cache hit: Return immediately from cache
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Cache miss: Fetch over network, cache response, and return
      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === 'opaque')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // 3. Offline fallback: For navigation / HTML requests, serve cached index.html
          if (
            event.request.mode === 'navigate' ||
            event.request.destination === 'document' ||
            (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))
          ) {
            return caches.match('./index.html').then((res) => res || caches.match('./'));
          }
        });
    })
  );
});
