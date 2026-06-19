# A5 Offline / Reconnect / Phone Operational Truth Audit (docs only)

> **상태**: audit 완료 — docs only (inspect-first, no code gap 패치 없음).
> **선행**: A0 `docs/157`, A1 `docs/158`(target + phone pending-intent 설계), A2 `docs/159`, A3 `docs/160`, A4 `docs/161`.
> **목표**: 실제 offline append / reconnect drain / phone 입력 동작을 inspect-first로 실측하고, A1 target("MacBook=operational authority; phone=stateless thin client, pending-intent→authoritative 분리")과 *어디까지 일치하는지*를 정직하게 판정한다. 설계가 아니라 **현 코드의 operational truth 기록**.

## 한 줄 요약
Offline append and reconnect drain already match the operational-authority target; the phone approval path does not yet, posting server-authored decisions with no pending-intent layer.

## 실측 (정본)
### offline append (desktop) — target과 일치 ✅
- `pushEventsToDgxEventStorage`(`apps/desktop/src/runtime/stage14EventSync.ts:61-129`)는 모든 `resolveDgxServerBaseUrls` 후보에 POST 시도 후 전부 실패하면 **`status:"queued", queuedEvents:events`**(`:123-128`)로 반환 — 즉 이벤트를 버리지 않고 outbox에 남긴다.
- 호출부 `syncEventsToDgx`(`useDgxEventSyncController.ts:79-101`)는 먼저 `localClientEventCache.append(event)`로 **로컬 확정 후** push. DGX 불가여도 로컬 작업 지속.
- → A1 "MacBook=operational authority, offline-first"와 **일치**. 이벤트 origination·offline 지속은 이미 MacBook.

### reconnect drain — target과 일치 ✅ (멱등 안전)
- 재연결 시 `handleSyncEventStorage`/`syncEventsToDgx`가 outbox를 재-push. 요청은 `idempotencyKey="${clientId}:${sessionId}:${eventIds}"`(`stage14EventSync.ts:56`) + 서버 dedup(fingerprint/logical key, A0) → **중복 확정 없음**.
- 부분 동기: DGX 도달했으나 일부 미동기면 `status:"failed"`, "events need conflict review"(`:112,116`) — A0의 server-wins conflict 경로. 손실 아님(미동기 이벤트는 outbox 유지).
- → A4 drain gate(`status=="synced" && outboxCount==0`)가 실제 신호와 정합.

### phone 입력 — target과 불일치 ❌ (구체 증거)
- phone 승인: `apps/mobile/src/screens/Approvals.tsx:58`가 결정을 **`/approvals/grant` / `/approvals/reject`로 직접 POST**(`postJson`). 목록은 `/approvals/list` GET(`:46`).
- 서버는 승인 이벤트를 **server-owned로 author**(A1: `index.ts:5837,7136-7140` 403 가드로 client push 차단). 즉 phone POST → **서버가 즉시 authoritative 승인 이벤트 확정**.
- phone의 다른 write: `/provider-completions`(`chatCompletion.ts:43`, 모델 실행 — DGX 역할로 정당), Chat은 `/events/sync` 경유 그룹화(`Chat.tsx:40`).
- **pending-intent 개념 없음**: mobile 코드에 intent/pending 분리 레이어가 없다(grep: `pending`은 UI 상태 라벨뿐, intent 모델 부재).
- → A1 target("phone=stateless thin client가 pending intent 제출 → MacBook이 authoritative 변환 → DGX projection")과 **불일치**. 현재는 phone→DGX 직행 author.

## 판정 (operational truth)
| 축 | A1 target | 현 실측 | 일치 |
| --- | --- | --- | --- |
| 이벤트 origination | MacBook | MacBook(client UUID, source=desktop) | ✅ |
| offline 지속 | MacBook local-first | queued outbox, 로컬 확정 후 push | ✅ |
| reconnect drain | 멱등, 손실 0 | idempotencyKey+서버 dedup, 미동기는 outbox 유지 | ✅ |
| durable authority | MacBook | DGX(A0) | ❌ (A0/A1 기록, flip=HOLD) |
| phone 입력 | pending-intent→MacBook authoritative | phone→DGX 직행 server-author | ❌ |

요약: **operational authority(원천·offline·drain)는 이미 target과 일치**한다. 불일치는 두 곳 — durable data authority(A0에서 이미 기록, flip은 overseer HOLD)와 **phone pending-intent 부재**(이번에 구체 endpoint 증거로 확정).

## 확인된 gap (코드 패치는 안 함 — 이유)
- phone pending-intent 레이어 신설은 **authority flip과 같은 트랙**이다: pending-intent가 의미를 가지려면 MacBook이 authoritative 변환자여야 하는데, 그건 Phase 3+ authority flip(overseer HOLD gate). 지금 phone 경로만 바꾸면 *현재 DGX-authority 모델*과 모순되는 죽은 레이어가 된다.
- 따라서 **이번에도 코드 패치 없음.** A1의 phone 설계(pending-intent→authoritative 전환)가 정본이며, 실제 배선은 cutover(S3) 이후 Phase 5에서. 이 audit는 그 gap이 *현재 코드에 실재함*을 endpoint 증거로 고정한다.

## A0/A1 ledger 보정 (확정)
- A0 매트릭스 "Phone/Home 입력 = aligned"는 A1에서 부분 정정했고, **A5에서 endpoint 증거(`/approvals/grant|reject` 직행 server-author)로 "operational은 hub 경유 맞지만 authoritative 분리는 부재 → 불일치"로 최종 확정**.
- operational authority 축(origination/offline/drain)은 **별도 확인 결과 이미 일치** — 이건 A0에서 "operational은 MacBook-aligned"라던 판정을 코드로 재확인한 것.

## non-goal (이번 A5)
```text
no phone/approval 코드 변경 (pending-intent는 Phase 5, flip 후)
no authority flip · no EventStorage/approval route 동작 변경
no protocol/schema/migration 변경 · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A6 후보: phase별 상세 test plan 매트릭스(각 state 전이/불변식의 테스트 케이스).
- A-series 종합 ledger(A0~A5를 한 장부로 + GO/HOLD 최종 + overseer 결정 대기 항목 명시).
- Phase 1+ 코드: overseer 승인 후.

## 검증
- inspect-first: `stage14EventSync.ts:56,61-129`(offline queued/idempotency), `useDgxEventSyncController.ts:79-101`(로컬 확정 후 push), `apps/mobile/src/screens/Approvals.tsx:46,58`(approval POST), `chatCompletion.ts:43`, `Chat.tsx:40`. mobile grep으로 pending-intent 부재 확인.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
Offline append and reconnect drain already match the operational-authority target; the phone approval path does not yet, posting server-authored decisions with no pending-intent layer. 이것은 operational 동작이 전부 옳다는 주장이 아니다 — origination·offline·drain은 inspect로 target 일치를 확인했고, phone pending-intent 부재는 현 DGX-authority 모델의 직접 귀결이라 flip 전에는 고치지 않는다(증거만 고정).
```text
A5 operational truth audit done (docs only). offline/drain aligned; phone pending-intent absent (flip-gated). STOP.
```
