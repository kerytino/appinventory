const CACHE_NAME = 'excellence-inv-cache-v2';
const STATIC_ASSETS = [
    '/static/css/design-system.css?v=5.9.0',
    '/static/css/layout.css?v=5.9.0',
    '/static/css/components.css?v=5.9.0',
    '/static/css/pages.css?v=5.9.0',
    '/static/img/logo.png',
    '/static/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('Error precacheando recursos estáticos:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('Purgando caché vieja de PWA:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Solo manejar peticiones GET
    if (event.request.method !== 'GET') return;
    
    // IMPORTANTE: NO interceptar navegación a páginas HTML ni APIs dinámicas
    // Esto previene pantallas en blanco en Safari iOS y mantiene las sesiones de Flask funcionando
    if (event.request.mode === 'navigate' || event.request.url.includes('/api/')) {
        return;
    }

    // Solo cachear archivos estáticos dentro de /static/
    if (event.request.url.includes('/static/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                });
            })
        );
    }
});
