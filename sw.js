/* 开健开吃 · Service Worker（离线缓存） */

const VERSION = 'kjkc-v1.7.0';

const ASSETS = [
  './',
  './index.html',
  './assets/styles.css',
  './js/app.js',
  './js/store.js',
  './js/util.js',
  './js/data.js',
  './js/icons.js',
  './js/components.js',
  './js/selectors.js',
  './js/recommend.js',
  './js/cloud.js',
  './js/cloud-config.js',
  './vendor/workbuddy-cloud-sdk.js',
  './js/views/overview.js',
  './js/views/fitness.js',
  './js/views/nutrition.js',
  './js/views/settings.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 云服务 API 必须直连网络，不能被缓存
  if (url.pathname.startsWith('/.cloud/')) return;

  // 网络优先：联网时始终取最新版本，断网时回落到缓存
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone());
          if (request.mode === 'navigate') cache.put('./index.html', response.clone());
        }
        return response;
      } catch (error) {
        const cached =
          (await cache.match(request, { ignoreSearch: true })) ||
          (request.mode === 'navigate'
            ? (await cache.match('./index.html')) || (await cache.match('./'))
            : null);
        if (cached) return cached;
        return new Response('离线状态下无法加载该资源。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })()
  );
});
