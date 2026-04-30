const CACHE_NAME = 'kids-player-v7';
const IMAGE_CACHE_NAME = 'kids-player-images';
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/assets/icons/app-192.svg', '/assets/icons/app-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && !key.startsWith('kids-player-images'))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});


function getImageCacheKey(requestUrl, isSpotifyImage) {
  if (!isSpotifyImage) {
    return requestUrl.toString();
  }

  return requestUrl.origin + requestUrl.pathname;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isHttpRequest = url.protocol === 'http:' || url.protocol === 'https:';

  if (!isHttpRequest || event.request.method !== 'GET') {
    return;
  }

  if (url.pathname.indexOf('/.netlify/functions/') === 0) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isImageRequest = event.request.destination === 'image';
  const isSpotifyImage = url.hostname.indexOf('scdn.co') !== -1 || url.hostname.indexOf('spotifycdn.com') !== -1;

  if (isImageRequest || isSpotifyImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cacheKey = getImageCacheKey(url, isSpotifyImage);
        const cached = await cache.match(cacheKey);
        if (cached) {
          return cached;
        }

        const response = await fetch(event.request);
        if (response && response.ok) {
          cache.put(cacheKey, response.clone());
        }
        return response;
      })
    );
    return;
  }

  if (url.origin.includes('spotify.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
