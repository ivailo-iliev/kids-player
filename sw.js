const CACHE_NAME = 'kids-player-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/icons/play.svg',
  './assets/icons/pause.svg',
  './assets/icons/prev.svg',
  './assets/icons/next.svg',
  './assets/icons/connecting.svg',
  './assets/icons/connected.svg',
  './assets/icons/disconnected.svg',
  './assets/placeholders/tile-placeholder.svg',
  './assets/placeholders/album-placeholder.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin.includes('spotify.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
