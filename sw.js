const CACHE_NAME = 'rummy-v4';
const PRECACHE = ['/', '/favicon.ico', '/manifest.json'];

const isViteRuntimeRequest = (url) => {
  return (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.includes('hot-update') ||
    url.searchParams.has('v')
  );
};

const isCacheableStaticAsset = (url) => {
  return /\.(?:js|mjs|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(url.pathname);
};

const isApiRequest = (url) => {
  return url.pathname.startsWith('/functions/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('google-analytics');
};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never cache API, backend, or analytics requests
  if (isApiRequest(url)) return;

  // Never cache Vite dev requests
  if (isViteRuntimeRequest(url)) return;

  // Navigation: network-first with offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(e.request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Google Fonts: cache-first with 30-day expiry
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Static assets
  if (isCacheableStaticAsset(url)) {
    const isCodeAsset = /\.(?:js|mjs|css)$/i.test(url.pathname);

    // JS/CSS: network-first to avoid stale chunk mismatches after deploys
    if (isCodeAsset) {
      e.respondWith(
        fetch(e.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
            }
            return response;
          })
          .catch(() => caches.match(e.request))
      );
      return;
    }

    // Images/fonts/icons: cache-first with stale-while-revalidate
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }
});

// Periodic cache cleanup
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    );
  }
});
