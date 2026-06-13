# 74 — PWA Shell (Orchestration OS PR8)

Telegram 없이 모바일/웹앱 느낌을 강화한다. 단, **PWA는 UI 편의 기능 — 오케스트레이션
엔진보다 앞서지 않는다.** UI 리디자인이 아니라 셸만 최소로.

## 한 일 (최소·UI-light)

- `public/manifest.webmanifest` — name/short_name(Hermes Board)/start_url/display:
  standalone/theme·background #0a0a0b/icon(svg).
- `public/icon.svg` — 다크 배경 + 바이올렛 ✦ 마크(maskable).
- `public/sw.js` — **최소 service worker, 읽기 전용 오프라인 폴백만**. /missions·/events·
  /approvals API는 가로채지 않음(항상 네트워크=서버 진실). 내비게이션은 network-first →
  오프라인 시 캐시 셸 또는 "읽기 전용" 안내. 정적 자산만 cache-first.
- `index.html` — manifest 링크 + theme-color + apple-mobile 메타 + viewport-fit=cover.
- `main.tsx` — **프로덕션 빌드에서만** SW 등록(dev HMR 충돌 방지), 실패는 조용히 무시.

## 원칙

- **엔진 우선**: SW는 캐시+오프라인 읽기만, 데이터 동기화/쓰기는 앱이 담당. 오프라인은
  읽기 전용 — 가짜 쓰기 없음.
- **회귀 0**: dev에는 SW 미등록, API는 SW 패스스루. 빌드가 자산을 dist로 복사 확인.
  typecheck·프로덕션 빌드·desktop suite(1141) 그대로.

## 검증

빌드 시 manifest/sw.js/icon.svg가 dist로 복사됨 확인. docs/74.

## Orchestration OS PR 시리즈 (docs/68–74)

68 Kanban+Trace · 69 Checkpoint/Rollback · 70 Docker/gVisor runner · 71 Error card+
self-correction+confidence · 72 Skill archive/curator · 73 Workflow templates+org ·
74 PWA shell. GPT PRO 플랜 8개 PR 완료(라이브 배선은 각 docs에 후속으로 명시).
