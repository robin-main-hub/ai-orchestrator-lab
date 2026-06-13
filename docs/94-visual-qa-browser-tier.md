# 94 — Visual QA browser-tier (Playwright) (Coding/Design OS D5b-2)

docs/90의 후속. 그때 browser-tier는 **DI 슬롯만 있고 미연결 → overflow/console/a11y/screenshot
전부 skipped**였다. 이제 실제 Playwright/chromium으로 preview를 열어 **observed로 채운다**.
러시아 심판 판정: "이제 실제 브라우저가 문제를 잡아야 한다." — 잡는다.

```
runVisualQa (env-gated ORCHESTRATOR_VISUAL_QA_BROWSER=1)
  → HTTP-tier(항상): preview HTML → hierarchy / primary action (observed)
  → browser-tier(Playwright DI): 3 viewport(desktop/tablet/mobile) goto
       · scrollWidth>innerWidth → visual_overflow / mobile_break
       · console.error / pageerror → console_error
       · icon-only button w/o aria → accessibility
       · <24px click target → click_target
       · 각 viewport screenshot → evidenceRef
  → 브라우저 미설치·실행실패면 undefined → 브라우저 검사 skipped (가짜 pass 위장 금지)
```

## 한 일

- **server** `missions/visualQaBrowserProbe.ts` (신규):
  - `runBrowserProbe({url, screenshotDir, launch, mkdir, viewports?})` — 순수 오케스트레이션,
    드라이버 DI. launch가 null/throw거나 **모든 viewport 실패면 undefined**(정직 skip).
    부분 성공이면 관측된 viewport만 담아 정직히 반환.
  - `createPlaywrightProbeDriver()` — `playwright`(full)→없으면 `playwright-core` dynamic import
    (변수 specifier라 빌드/타입 영향 없음, 미설치면 catch→null→skip).
    `ORCHESTRATOR_VISUAL_QA_CHROMIUM_PATH`로 캐시된 chromium 명시 가능(버전·빌드 불일치 회피).
    metrics는 **문자열 표현식**(`BROWSER_METRICS_EXPR`)으로 evaluate — 서버 tsc에 DOM lib 없어도 OK.
  - `index.ts` `runVisualQa`: `ORCHESTRATOR_VISUAL_QA_BROWSER=1`일 때만 browser-tier 가동,
    screenshot dir = `…/visual-qa/<workspaceId>`, 결과를 analyzeVisualQa의 browser obs로 주입.
- **package.json**: `playwright-core`를 **optionalDependency**로(미설치 환경에서도 서버 부팅).
- **smoke**: preview-server를 일부러 불량으로(2000px wide div overflow + `console.error` +
  primary action 없음). 캐시 chromium 있으면 browser-tier가 **실측**, 없으면 정직 skip —
  **adaptive 단언**(browserRan이면 overflow/console 이슈 + screenshot evidenceRef 강제,
  아니면 브라우저 검사 전부 skipped 강제).

## 정직성 불변식 (테스트로 못박음)

- launch null/throw → **undefined(skip)**, observed pass로 위장하지 않음 (probe test 2케이스).
- 모든 viewport 실패 → undefined (관측 0이면 skip). 부분 성공은 관측분만 정직 반환.
- 관측된 viewport·console·screenshot만 obs에 담김 — 안 본 것은 담지 않음.
- 브라우저 검사가 skip이면 analyzeVisualQa가 해당 항목을 passed로 표시하지 않음(docs/90 불변식 유지).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| 실제 브라우저로 preview open | ✅ Playwright chromium 3 viewport goto |
| overflow 실측 | ✅ scrollWidth(2000+)>innerWidth → visual_overflow |
| console error 실측 | ✅ preview의 console.error → console_error 카드 |
| screenshot evidence | ✅ viewport별 PNG → evidenceRef |
| temp app에서 issue ≥1 관측 | ✅ smoke: missing_primary_action + visual_overflow + console_error |
| 미설치 환경 정직 skip | ✅ launch→null→undefined, smoke adaptive skip 분기 |
| UI 대수술 없음 | ✅ 서버 probe + env gate만, UI 무변경 |

## 운영 메모

- 캐시 chromium: `…/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe`.
  playwright-core@1.52가 build 1223을 핀하므로 executablePath 없이도 자동 발견(이 머신).
  타 머신엔 없으면 정직 skip → smoke 여전히 green.
- 기본값은 browser-tier off(`ORCHESTRATOR_VISUAL_QA_BROWSER` 미설정) — HTTP-tier만 항상 가동.

## 검증

protocol 103 그린 · server 273(+4 probe test) 그린 · desktop typecheck 그린 ·
generic app-build smoke **25/25 PASS** (browser-tier observed: visual_overflow + console_error
+ screenshot evidenceRef; 미설치 머신에선 정직 skip). docs/94.
