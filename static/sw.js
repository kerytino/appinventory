// Auto-purge and disable service worker cache to ensure latest templates and scripts
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => caches.delete(key)));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Direct network pass-through, no caching
    return;
});
