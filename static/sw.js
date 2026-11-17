const CACHE_NAME = 'agrostock-v1';
const STATIC_ASSETS = [
  '/',
  '/static/styles.css',
  '/static/manifest.json',
  '/static/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network first, fallback to cache for offline resilience
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match(e.request))
    );
  }
});
