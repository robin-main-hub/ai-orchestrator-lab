// Hermes Board — 최소 service worker. 읽기 전용 오프라인 폴백만 제공한다.
// 엔진/데이터 동기화는 앱이 담당하고, SW는 셸을 캐시해 오프라인에서 읽기만 가능하게 한다.
const CACHE = "hermes-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // API/이벤트 호출은 SW가 가로채지 않는다 — 항상 네트워크(서버 진실)
  if (url.pathname.startsWith("/missions") || url.pathname.startsWith("/events") || url.pathname.startsWith("/approvals")) {
    return;
  }

  // 내비게이션: network-first, 오프라인이면 캐시된 셸 또는 읽기 전용 안내
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/");
          return (
            cached ||
            new Response(
              "<!doctype html><meta charset=utf-8><title>오프라인</title><body style='background:#0a0a0b;color:#e8f4f8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1>오프라인</h1><p style='opacity:.7'>읽기 전용 — 네트워크 복귀 시 동기화됩니다.</p></div>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } },
            )
          );
        }),
    );
    return;
  }

  // 정적 자산: cache-first
  if (/\.(?:js|css|woff2?|png|jpe?g|webp|svg|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          }),
      ),
    );
  }
});
