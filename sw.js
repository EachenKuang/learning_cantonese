/* 粵學堂 · Service Worker
   更新友好策略：
   - 页面导航（navigate）：network-first，保证用户打开即最新版
   - 静态资源：stale-while-revalidate，先用缓存（快）后台刷新缓存
   - 发布新内容时：把 CACHE 版本号 +1（如 canto-shell-v2），activate 自动清旧缓存 */
const CACHE = 'canto-shell-v30';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest?v=30',
  './css/style.css?v=30',
  './js/data.js?v=30',
  './js/songs.js?v=30',
  './js/lessons.js?v=30',
  './js/stories.js?v=30',
  './js/app.js?v=30',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* 语音 API 由 HTTP 缓存和服务端磁盘缓存管理，不写入 PWA 静态缓存。 */
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  /* 跨域资源走网络，失败不报错。 */
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }
  /* 页面导航：network-first，确保每次打开都是最新版本 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
    return;
  }
  /* 静态资源：stale-while-revalidate，先给缓存（快），后台刷新 */
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
