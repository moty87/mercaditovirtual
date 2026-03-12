// ============================================
// SERVICE WORKER - Mercadito Virtual Mendoza
// Modo Offline y Caché Inteligente
// ============================================

const CACHE_NAME = 'mercadito-mendoza-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/logo-mercadito-virtual.png'
];

// Instalación: Precachear recursos estáticos
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker instalando...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ Cache abierto');
                return cache.addAll(STATIC_ASSETS);
            })
            .catch(err => console.error('❌ Error al precachear:', err))
    );

    self.skipWaiting();
});

// Activación: Limpiar caches antiguas
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activando...');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('🗑️ Eliminando cache antigua:', name);
                        return caches.delete(name);
                    })
            );
        })
    );

    self.clients.claim();
});

// Fetch: Estrategia Cache-First con Network Fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requests de Google Sheets y Analytics
    if (url.href.includes('google.com') || 
        url.href.includes('googletagmanager') ||
        url.href.includes('sheetjs') ||
        url.href.includes('papaparse')) {
        return;
    }

    // Estrategia para imágenes: Cache First
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then(response => {
                if (response) {
                    return response;
                }
                return fetch(request).then(fetchResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
        return;
    }

    // Estrategia para archivos estáticos: Cache First
    if (STATIC_ASSETS.includes(url.pathname)) {
        event.respondWith(
            caches.match(request).then(response => {
                return response || fetch(request).then(fetchResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
        return;
    }

    // Estrategia general: Network First con cache fallback
    event.respondWith(
        fetch(request)
            .then(response => {
                if (!response || response.status !== 200) {
                    return response;
                }

                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseClone);
                });

                return response;
            })
            .catch(() => {
                return caches.match(request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Si no hay cache, devolver página offline
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Sin conexión', { status: 503 });
                });
            })
    );
});

// Mensajes desde la página principal
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

// Sincronización en background (para cuando vuelve la conexión)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-productos') {
        console.log('🔄 Sincronizando productos en background...');
        // Aquí podrías sincronizar con Google Sheets
    }
});
