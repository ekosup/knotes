const CACHE_NAME = 'enotes-cache-v1';

// Static assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// Install Event: precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate Event: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-While-Revalidate caching strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local/font origins
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Only cache local assets or font provider assets
  const isLocal = url.origin === self.location.origin;
  const isFont = url.origin.includes('fonts.gstatic.com') || url.origin.includes('fonts.googleapis.com');
  
  if (!isLocal && !isFont) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          // Return cached response if offline fetch fails, otherwise let it fail
          console.warn('[Service Worker] Fetch failed, serving cache (if available):', event.request.url, err);
        });

        // Return cache instantly if hit, falling back to network fetch
        return cachedResponse || fetchPromise;
      });
    })
  );
});
