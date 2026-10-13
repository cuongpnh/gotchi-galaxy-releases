// Offline shell for the web version (src/webApp.ts registers it as sw.js?v=<game version>).
// The version in the address names the cache, so a release is a new worker with a new cache, and the old cache is deleted.
//   - install: fetch the page and keep it with the scripts and styles it names (their file names carry a hash, so nothing is listed here);
//   - pages: network first (a new release shows up as soon as you are online), the kept page when offline;
//   - everything else under this folder: the kept copy first, else the network (and keep that too).
// Anything outside this folder (the release manifest, the live events feed) is never touched: it must always be fresh.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `gotchi-galaxy-${VERSION}`;
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

async function keepShell() {
  const cache = await caches.open(CACHE);
  const page = await fetch('./', { cache: 'reload' });
  const html = await page.clone().text();
  await cache.put('./', page);
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((m) => m[1]);
  // one missing file must not stop the rest from being kept
  await Promise.allSettled([...new Set([...SHELL.slice(1), ...assets])].map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(keepShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('gotchi-galaxy-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: CACHE, ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: CACHE }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        void caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});
