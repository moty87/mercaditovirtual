// ============================================
// SERVICE WORKER - Mercadito Virtual Mendoza v2.0
// Mejoras:
// - Separación de caché estática y dinámica
// - Límite de entradas en caché dinámica (evita crecer sin límite)
// - Estrategia stale-while-revalidate para assets estáticos
// - Mejor manejo de errores en fetch
// - Limpieza de caches viejas más robusta
// ============================================

const CACHE_VERSION    = 'v4';
const CACHE_STATIC     = `mercadito-static-${CACHE_VERSION}`;
const CACHE_DINAMICO   = `mercadito-dynamic-${CACHE_VERSION}`;
const MAX_CACHE_ITEMS  = 60; // Límite de entradas en caché dinámica

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/logo-mercadito-virtual.png',
    '/logo-mercadito-virtual.webp'
];

// Dominios que NUNCA se cachean (siempre online)
const NO_CACHE_DOMAINS = [
    'google.com',
    'googleapis.com',
    'googletagmanager.com',
    'script.google.com',
    'docs.google.com',
    'wa.me',
    'api.whatsapp.com'
];

// ============================================
// INSTALACIÓN
// ============================================
self.addEventListener('install', (event) => {
    console.log(`📦 SW ${CACHE_VERSION} instalando...`);
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => {
                console.log('✅ Assets estáticos cacheados');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ Error al precachear:', err);
                return self.skipWaiting(); // Continuar igual para no bloquear
            })
    );
});

// ============================================
// ACTIVACIÓN — Limpiar caches viejas
// ============================================
self.addEventListener('activate', (event) => {
    console.log(`🚀 SW ${CACHE_VERSION} activando...`);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            const cachesActuales = [CACHE_STATIC, CACHE_DINAMICO];
            return Promise.all(
                cacheNames
                    .filter(name => !cachesActuales.includes(name))
                    .map(name => {
                        console.log('🗑️ Eliminando cache vieja:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================
// HELPERS
// ============================================
function esDominioExcluido(url) {
    return NO_CACHE_DOMAINS.some(domain => url.href.includes(domain));
}

function esAssetEstatico(pathname) {
    return STATIC_ASSETS.some(asset => {
        // Comparar sin query string
        return pathname === asset || pathname === asset + '.html';
    });
}

// Limitar tamaño de caché dinámica
async function limpiarCacheDinamica() {
    const cache = await caches.open(CACHE_DINAMICO);
    const keys  = await cache.keys();
    if (keys.length > MAX_CACHE_ITEMS) {
        const sobran = keys.length - MAX_CACHE_ITEMS;
        // Eliminar las entradas más viejas (primeras en el array)
        await Promise.all(keys.slice(0, sobran).map(key => cache.delete(key)));
        console.log(`🧹 Cache dinámica: eliminadas ${sobran} entradas viejas`);
    }
}

// ============================================
// FETCH — Estrategias por tipo de recurso
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Solo manejar GET
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch { return; }

    // Ignorar dominios externos sin caché
    if (esDominioExcluido(url)) return;

    // Ignorar chrome-extension y otros esquemas no HTTP
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const pathname = url.pathname;

    // ── ESTRATEGIA 1: Assets estáticos → Stale-While-Revalidate
    // Sirve desde caché inmediatamente y actualiza en background
    if (esAssetEstatico(pathname)) {
        event.respondWith(
            caches.open(CACHE_STATIC).then(async cache => {
                const cached = await cache.match(request);

                // Actualizar en background (no esperar)
                const fetchPromise = fetch(request)
                    .then(response => {
                        if (response && response.status === 200) {
                            cache.put(request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => null);

                // Devolver caché inmediatamente si existe, sino esperar la red
                return cached || fetchPromise;
            })
        );
        return;
    }

    // ── ESTRATEGIA 2: Imágenes → Cache First (larga duración)
    if (request.destination === 'image') {
        event.respondWith(
            caches.open(CACHE_DINAMICO).then(async cache => {
                const cached = await cache.match(request);
                if (cached) return cached;

                try {
                    const response = await fetch(request);
                    if (response && response.status === 200) {
                        cache.put(request, response.clone());
                        limpiarCacheDinamica(); // Async, no bloquea
                    }
                    return response;
                } catch {
                    // Sin imagen: devolver placeholder SVG transparente
                    return new Response(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="110" font-size="40" text-anchor="middle" fill="#ccc">📦</text></svg>',
                        { headers: { 'Content-Type': 'image/svg+xml' } }
                    );
                }
            })
        );
        return;
    }

    // ── ESTRATEGIA 3: Navegación (HTML) → Network First con fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_STATIC).then(cache => cache.put(request, responseClone));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match('/index.html');
                    return cached || new Response(
                        '<h1>Sin conexión</h1><p>Revisá tu conexión a internet.</p>',
                        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                })
        );
        return;
    }

    // ── ESTRATEGIA 4: Resto → Network First con caché fallback
    event.respondWith(
        fetch(request)
            .then(response => {
                if (!response || response.status !== 200) return response;
                const responseClone = response.clone();
                caches.open(CACHE_DINAMICO).then(cache => {
                    cache.put(request, responseClone);
                    limpiarCacheDinamica();
                });
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);
                if (cached) return cached;
                return new Response('Sin conexión', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            })
    );
});

// ============================================
// MENSAJES DESDE LA PÁGINA
// ============================================
self.addEventListener('message', (event) => {
    if (!event.data) return;

    switch (event.data.type || event.data) {
        case 'skipWaiting':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            // Limpiar solo caché dinámica (conservar estática)
            caches.delete(CACHE_DINAMICO).then(() => {
                event.ports?.[0]?.postMessage({ ok: true });
                console.log('🧹 Caché dinámica limpiada por solicitud');
            });
            break;

        case 'GET_CACHE_SIZE':
            // Informar tamaño de caches al cliente
            Promise.all([
                caches.open(CACHE_STATIC).then(c => c.keys()),
                caches.open(CACHE_DINAMICO).then(c => c.keys())
            ]).then(([staticKeys, dynamicKeys]) => {
                event.ports?.[0]?.postMessage({
                    static: staticKeys.length,
                    dynamic: dynamicKeys.length
                });
            });
            break;
    }
});

// ============================================
// SYNC EN BACKGROUND
// ============================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-productos') {
        console.log('🔄 Sync en background programado');
        // La sincronización real la maneja el script principal
        // al detectar conexión online
    }
});
