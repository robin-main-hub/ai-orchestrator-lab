# 90 — Visual QA / DesignIssueCard (Coding/Design OS D5b)

D5a가 preview를 observed로 착지시켰으니, 그 위에서 **디자인 품질을 구조화 검사**한다.
SandboxErrorCard(코딩 에러)의 디자인판 — overflow/console/hierarchy/a11y 등을 카드로.

```
POST /missions/:id/workspace/:wsId/visual-qa
  → observed running preview 없으면 409 (가짜 QA 금지)
  → HTTP-tier: preview HTML 관측 → hierarchy / primary action / empty-state (observed)
  → browser-tier(Playwright DI): overflow/console/click-target/a11y/screenshot
       (probe 미연결이면 전부 skipped — observed pass 위장 금지)
  → VisualQaReport + DesignIssueCard들 → EventStorage/Trace
```

## 한 일

- **protocol** `visualQa.ts`: `DesignIssueCard`(visual_overflow/console_error/contrast/
  hierarchy/missing_primary_action/mobile_break/click_target/accessibility), `VisualQaReport`
  (checks + issues + status), 순수 분석기 `analyzeVisualQa`(원시 관측 → 리포트/이슈).
  `ServerMissionRecord.visualQaReports`/`designIssues`.
- **server**: `mission.visual_qa.recorded`/`mission.design.issue.recorded` 이벤트 + materialize,
  `store.recordVisualQa`(리포트+이슈 각각 이벤트로 → snapshot/stream trace 일치),
  `POST .../visual-qa`(**observed preview 필수 게이트** → 없으면 409), index.ts에서 preview HTML
  fetch(node http)→analyzeVisualQa로 주입. trace에 visual_qa/design.issue 매핑.
- **desktop**: `runDgxVisualQa` 클라이언트 래퍼.
- **smoke**: preview start(observed) → visual-qa → **observed HTML 검사 + 브라우저 검사 skipped
  + 실측 이슈(missing primary action) 1건** 확인 → stop. **22/22 PASS**.

## 정직성 불변식 (테스트로 못박음)

- **observed running preview 없으면 QA blocked/409** — 화면을 안 봤는데 pass 없음.
- HTTP 미수행=skipped, HTTP 실패=failed, 성공=관측 검사. **브라우저 probe(Playwright)
  미연결이면 overflow/console/a11y/screenshot 전부 skipped**(가짜 observed pass 금지).
- report.truthStatus는 실제 관측 항목이 하나라도 있어야 observed, 전부 skip이면 configured.
- 검사 불가 항목은 절대 passed로 표시하지 않음(전부 skipped → status warning, not passed).
- screenshot 있으면 evidenceRef.

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| preview required | ✅ observed 없으면 409 |
| screenshot evidence | ✅ screenshotRefs → evidenceRef |
| overflow issue | ✅ scrollWidth>innerWidth → visual_overflow/mobile_break |
| console error | ✅ consoleErrors → console_error 카드 |
| fake pass 방지 | ✅ 검사 불가 시 skipped(테스트 6케이스) |
| trace | ✅ visual_qa.recorded / design.issue.recorded |

## 후속

브라우저-tier probe(Playwright)는 DI 슬롯만 있고 미연결 → 브라우저 검사는 skipped.
연결하면 overflow/console/contrast/click-target/a11y/screenshot이 observed로 채워진다.

## 검증

protocol 92(+6) · server 257(+4) · desktop typecheck 그린 · generic app-build smoke **22/22 PASS**
(visual QA observed + 실측 이슈 + 브라우저 검사 skipped). docs/90.
