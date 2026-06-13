# 89 — Preview Runner observed 착지 (Coding/Design OS D5a)

D4는 probe-only(dev 서버를 안 띄우고 포트만 관측)였다. D5a는 **실제 dev 프로세스를 띄워
preview를 진짜 observed로 착지**시킨다. Visual QA(D5b)는 이 observed preview가 전제다.

```
POST /missions/:id/workspace/:wsId/preview/start
  → 명령 정책(셸 메타 차단 + prefix allowlist) + repoRoot allowlist 게이트
  → spawn(shell 없이, PORT env로 포트 전달)
  → deterministic 포트를 HTTP probe (poll)
  → 응답 오면 status=running, truthStatus=observed
  → 아니면 failed/configured (가짜 running 금지)
POST .../preview/stop  → 프로세스 종료(멱등)
```

## 한 일

- **protocol**: `AppWorkspacePreview` status에 `stopped`/`blocked` + `command`/`detail` 추가.
  `previewStartRequestSchema`, `defaultPreviewCommandForAppType`, 정직성 단일 지점 빌더
  `previewRunning`(observed)/`previewFailed`/`previewBlocked`/`previewStopped`(전부 configured).
- **server** `previewProcessRunner.ts`: `isAllowedPreviewCommand`(DANGEROUS_PATTERN 차단 +
  preview prefix allowlist + env 추가), `startPreviewProcess`(allowlist 게이트 → spawn →
  HTTP probe poll → observed/failed, 워크스페이스당 프로세스 추적), `stopPreviewProcess`,
  `disposeAllPreviews`(서버 종료 시 유령 dev 서버 정리). 전부 DI(spawn/probe/wait)로 단위 테스트.
- **route**: `POST .../preview/start`·`/stop`(DI startPreview/stopPreview). index.ts에서 실제
  `child_process.spawn`(PORT env, shell 없이) + node http GET probe + repoRoot allowlist로 주입,
  `server.on("close")`에서 disposeAll.
- **desktop**: `startDgxPreview`/`stopDgxPreview` 클라이언트 래퍼 추가(소비 seam).
- **smoke**: temp repo에 최소 node http 서버(`preview-server.mjs`)를 커밋 → `preview/start`로
  실제 기동 → **observed running 관측** → stop. 시작 전 probe는 not observed로 정직.

## 정직성/보안 불변식 (테스트로 못박음)

- **observed running은 실제 HTTP probe 성공 시에만**. 프로세스 미기동/probe 실패/조기 종료는
  failed/configured(테스트: 5케이스). 시작 전 probe는 not observed.
- 명령 게이트: 셸 메타문자/위험 토큰 차단 + 좁은 preview prefix allowlist. cwd는 repoRoot
  allowlist 필수. 둘 중 하나라도 막히면 blocked(spawn 0).
- host shell 직결 금지 — argv split 후 shell 없이 spawn, 포트는 PORT env.
- 서버 종료 시 모든 preview 프로세스 kill(유령 방지).
- **screenshot/Visual QA 없이 visual pass 금지** — D5a는 포트 관측까지만(QA는 D5b).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| deterministic port | ✅ derivePreviewPort |
| observed running | ✅ 실제 HTTP probe 성공 시만(스모크 실측: port 4487 observed) |
| failed preview | ✅ dev 서버 실패/미기동 → failed/configured |
| no fake visual | ✅ D5a는 QA pass 안 만듦 |
| trace | ✅ preview.recorded(start/probe/fail) |
| smoke | ✅ temp repo preview observed running 1회 증명(20/20 PASS) |

## 검증

protocol 86 · server 253(+11) · desktop typecheck 그린 · generic app-build smoke **20/20 PASS**
(preview observed running 실측). docs/89.

## 다음

D5b Visual QA / DesignIssueCard(observed preview 위에서 screenshot/overflow/console/a11y;
screenshot 없으면 skipped, observed pass 금지).
