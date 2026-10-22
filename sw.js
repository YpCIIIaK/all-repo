/* Ясень · сервис-воркер: повторные визиты открываются мгновенно и работают без сети.
   Библиотеки (vendor) и шрифты — из кэша; код и страница — сеть с откатом на кэш. */
const VERSION = 'yasen-v9';
const CORE = ['./', './index.html', './src/style.css', './src/app.js', './src/stage.js', './src/models.js', './src/geo.js', './src/materials.js', './src/catalog.js',
  './vendor/three/three.module.min.js', './vendor/three/three.core.min.js', './vendor/three/addons/OrbitControls.js', './vendor/three/addons/RoomEnvironment.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const immutable = url.pathname.includes('/vendor/') || url.host.includes('fonts.g');
  if (immutable) {
    // библиотеки и шрифты не меняются: сначала кэш
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') caches.open(VERSION).then((c) => c.put(req, res.clone())); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // свой код: сначала сеть (чтобы сразу видеть обновления), без сети — кэш
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
