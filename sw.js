/* ============================================================
   Service Worker — 习惯 & 待办 PWA
   更新流程：
   1. 每次发版，把 CACHE_VERSION 加 1（v1 → v2 → v3 ...）
   2. 推送后浏览器会检测到 sw.js 变化，触发 install
   3. 新 SW 进入 waiting 状态，index.html 里弹"发现新版本"
   4. 用户点确认 → postMessage(SKIP_WAITING) → 立即激活 → 页面刷新
   ============================================================ */

const CACHE_VERSION = 'v2';                       // ★ 每次发版必须 +1
const CACHE_NAME = `habit-todo-${CACHE_VERSION}`; // 例如 habit-todo-v2
const ASSETS = ['./', './index.html', './manifest.json'];

/* ---------- install：预缓存 + 跳过等待 ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // 让新 SW 不排队，直接进入 waiting，方便前端尽快感知更新
  self.skipWaiting();
});

/* ---------- activate：清旧缓存 + 立即接管 ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存：', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- message：接收前端"立即激活"指令 ---------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------- fetch：导航请求网络优先，静态资源缓存优先 ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 只处理 GET 请求
  if (req.method !== 'GET') return;

  // ★ 导航请求（打开页面/刷新）：网络优先，保证能拿到最新的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 拿到新页面后顺手更新缓存
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 其他资源（图标、manifest 等）：缓存优先，回退网络
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // 只缓存同源成功响应
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});