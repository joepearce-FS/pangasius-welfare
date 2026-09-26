/* Service worker — Pangasius Welfare Assessment PWA
 *
 * Strategy
 *  - App shell (index.html, manifest, icons): pre-cached on install.
 *  - index.html: network-first, fall back to cache. Online users always get the
 *    newest version you upload; offline users get the last version they loaded.
 *  - Google Fonts: cached on first use (stale-while-revalidate) so the app looks
 *    right offline after the first online visit; harmless if never loaded.
 *  - Google Sheet sync (script.google.com): never intercepted.
 *
 * Bump CACHE_VERSION whenever you change any pre-cached file.
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `pwa-shell-${CACHE_VERSION}`;
const FONT_CACHE = 'pwa-fonts';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('pwa-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Sheet sync POSTs go straight to the network
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const cached = await c.match(req);
        const network = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations / index.html: network-first so updates arrive, cache when offline
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put('./index.html', res.clone()));
        return res;
      }).catch(async () => (await caches.match('./index.html')) || (await caches.match(req)))
    );
    return;
  }

  // Everything else in the shell: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }))
  );
});
