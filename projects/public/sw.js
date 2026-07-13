/**
 * Service Worker — PWA 离线缓存
 *
 * 缓存策略：
 * 1. Precache: 核心静态资源（manifest、icons、login 页面）安装时预缓存
 * 2. NetworkFirst: API 请求优先网络，失败回退缓存（保证数据新鲜）
 * 3. StaleWhileRevalidate: 页面导航请求，先返回缓存同时后台更新
 * 4. CacheFirst: 静态资源（JS/CSS/图片/字体），优先缓存减少请求
 *
 * 版本管理：更新 CACHE_VERSION 触发旧缓存清理
 */

const CACHE_VERSION = 'v1-20260711';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PAGE_CACHE = `page-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// 安装时预缓存的核心资源
const PRECACHE_URLS = [
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/offline.html',
  '/admin/login',
  '/team/login',
  '/parent/login',
];

// === Install: 预缓存核心资源 ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// === Activate: 清理旧版本缓存 ===
self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, PAGE_CACHE, API_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !validCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// === Fetch: 分层缓存策略 ===
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 GET 请求，POST/PUT/DELETE 等直接走网络
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 跳跨域请求（Supabase、Coze API 等）— 由各自网络层处理
  if (url.origin !== self.location.origin) return;

  // 策略 1: API 请求 — NetworkFirst（保证数据新鲜，离线时回退缓存）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 只缓存成功的响应
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 策略 2: 页面导航 — StaleWhileRevalidate（先返回缓存，后台更新）
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(PAGE_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || caches.match('/offline.html'));

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 策略 3: 静态资源 — CacheFirst（优先缓存，减少重复请求）
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// === Message: 支持手动更新 ===
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
