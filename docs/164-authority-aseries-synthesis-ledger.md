# A7 Authority A-Series Synthesis Ledger (design only)

> **상태**: 설계·문서 전용 (design only / 종합 장부). **코드/protocol/schema/migration/EventStorage 동작 변경 없음.**
> **선행(전체 트랙)**: A0 `docs/157`(authority truth audit), A1 `docs/158`(migration blueprint), A2 `docs/159`(store seam 계약), A3 `docs/160`(import verifier), A4 `docs/161`(cutover runbook), A5 `docs/162`(operational truth), A6 `docs/163`(test plan matrix).
> **목표**: A0~A6를 **한 장부로 종합**한다. (1) 각 단계 산출물·핵심 판정 한 줄 요약, (2) 최종 GO/HOLD 매트릭스(무엇이 설계 완료이고 무엇이 overseer 결정 대기인지), (3) overseer 결정이 필요한 정확한 게이트 목록. **새 설계를 만들지 않고 기존 6개 문서를 정합·압축**한다. 종합이지 새 결정이 아니다.

## 한 줄 요약
The authority migration is fully designed end-to-end (audit → blueprint → contracts → verifier → runbook → operational truth → test matrix); every remaining step is code that sits behind explicit overseer gates, and nothing has been flipped.

## A0~A6 종합표 (정본 압축)
| 단계 | 문서 | 산출물 | 핵심 판정(non-obvious) | 상태 |
| --- | --- | --- | --- | --- |
| A0 | 157 | authority truth audit | 코드+docs **둘 다** DGX-02 data-authority로 일관 구현. "docs가 MacBook-authority 현실을 가린 drift"는 **틀림** → code-level mismatch(미구현 목표). | 설계 완료 |
| A1 | 158 | migration blueprint | target=MacBook operational+authoritative store / DGX=hub+exec+replica / phone=stateless. storage=OPFS primary+IndexedDB fallback(native SQLite=out of scope, web SPA). 단일 atomic cutover(DUAL_AUTHORITY 금지). control-plane ⟂ durable-data authority 구분으로 A0 approval/phone 분류 정정. | 설계 완료 |
| A2 | 159 | store seam 계약 | `AuthoritativeEventStore`(durable SoT, idempotent append-only) ⟂ `ReplicaOutbox`(전송 상태만) 두 계약 분리. 단일 slot-in=`useDgxEventSyncController.ts:45-48`. localStorage authoritative 부적격. | 설계 완료 |
| A3 | 160 | import verifier | 결정론 멱등 parity. 서버 `fingerprintEvent=stableStringify` 재사용. 불변식 I1~I6. verifierHash=sha256(sort(perEvent))[storedAt/revision 제외]. SimpleMem 비결정론→HOLD. | 설계 완료 |
| A4 | 161 | cutover runbook | S0→S4+S_ROLLBACK 운영 절차. PRE-DRAIN GATE(`status=="synced"&&outboxCount==0`). atomic epoch-bump. epoch quarantine(stale/future→격리, silent drop 금지). legacy JSONL read-only 봉인. | 설계 완료 |
| A5 | 162 | operational truth audit | inspect 실측: **offline append+reconnect drain 이미 target 일치 ✅**(origination/offline/멱등 drain=MacBook). **phone 승인 경로 불일치 ❌**(`/approvals/grant|reject` 직행 server-author, pending-intent 부재). 코드 패치 안 함(flip-gated). | 실측 완료 |
| A6 | 163 | test plan matrix | Phase 0~5·cutover S0→S4·I1~I6·epoch quarantine을 테스트 케이스 매트릭스로. 기존 vitest 토대 재사용. Phase 3/4/5 HOLD-gate. 안티-회귀 가드 G-1~G-4. | 설계 완료 |

## 최종 GO/HOLD 매트릭스
무엇이 *설계로 완료*되었고 무엇이 *코드 실행 전 overseer 결정 대기*인지.
| 항목 | 설계 상태 | 실행 상태 | 게이트 |
| --- | --- | --- | --- |
| authority truth(현행=DGX) | ✅ 확정 | — (현행 운영) | 없음 |
| migration target(MacBook authority) | ✅ 확정 | ❌ 미구현 | overseer flip 결정 |
| store 계약(2분리) | ✅ 계약 명세 | ❌ adapter 미구현 | Phase 1 코드 승인 |
| import verifier | ✅ 알고리즘 명세 | ❌ 미구현 | Phase 2 코드 승인 |
| epoch/revision 발급 | ✅ 규칙 명세 | ❌ 미구현 | **Phase 3 HOLD(protocol 영향)** |
| cutover 실행 | ✅ 절차 명세 | ❌ 미실행 | **Phase 4 HOLD(드레인+overseer)** |
| phone pending-intent | ✅ 설계+gap 증거 | ❌ 미구현 | **Phase 5 HOLD(flip 후)** |
| operational axes(offline/drain) | ✅ 일치 확인 | ✅ 이미 동작 | 없음(가드만 유지) |
| 테스트 매트릭스 | ✅ 케이스 명세 | ❌ 미작성 | Phase별 코드와 동반 |

요약: **설계 트랙(A0~A6)은 end-to-end 완료**. 실행 트랙(Phase 0~5 코드)은 전부 미착수이며 **Phase 3 이상은 명시적 overseer 게이트**.

## overseer 결정이 필요한 정확한 게이트 (HOLD 목록)
구현 전 반드시 overseer(1호기) 결정이 필요한 지점. 4호기는 이 게이트를 코드로 넘지 않는다.
```text
G-FLIP-1 (Phase 3): epoch/revision 발급 = protocol event-id 형식 변경 영향.
                    → MacBook authority로의 실질 전환 시작점. overseer GO 없이 구현 금지.
G-FLIP-2 (Phase 4): cutover 실행 = DGX read-only freeze + epoch bump.
                    → 운영 데이터 authority 전환. 드레인 게이트 통과 + overseer 명시 결정 필수.
G-FLIP-3 (Phase 5): phone pending-intent 배선 = flip 후에만 의미.
                    → flip 전 구현 시 현 DGX-authority 모델과 모순되는 죽은 레이어(A5).
G-DATA   (공통):    실제 import 실행(원본 JSONL→MacBook store) = 데이터 이동.
                    → 무손실 검증(A3 manifest GO) 후에만. dry-run parity는 게이트 전 가능.
```
Phase 0~2(baseline freeze·adapter shadow·import verifier dry-run)는 **부작용 없는 설계 검증**이라 별도 overseer 승인 후 안전 착수 가능(authority 미전환). Phase 3+만 authority 전환을 수반하는 hard gate.

## 정합성 점검 (문서 간 모순 없음 확인)
- A0 "operational=MacBook" ↔ A5 "offline/drain 일치 ✅": **정합**(A5가 A0를 코드로 재확인).
- A0 "approval/phone aligned" ↔ A1 control-plane⟂data 정정 ↔ A5 endpoint 증거: **정합**(점진 구체화, 최종=phone data축 불일치 확정).
- A1 storage=OPFS/IndexedDB ↔ A2 localStorage 부적격 ↔ A6 P1-6 거부 테스트: **정합**.
- A3 verifierHash 규약 ↔ A6 P2-5/P2-10 결정론 테스트: **정합**.
- A4 epoch quarantine ↔ A6 P3-2~P3-5: **정합**.
모순 0. A-series 내부 일관.

## non-goal (이번 A7)
```text
no 새 설계 결정 / no 코드 / no 테스트 / no Phase 착수
no authority flip · no import 실행 · no protocol/schema/migration 변경 · no EventStorage 동작 변경
no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A-series 설계 트랙은 본 종합으로 **end-to-end 닫힘**. 추가 설계 증분이 필요하면 특정 Phase의 더 깊은 명세(예: OPFS append-only 파일 포맷 상세, IndexedDB 스키마 버저닝)로 진행.
- 실행 트랙(Phase 0~5): overseer 결정 후 A6 매트릭스대로 코드+테스트. Phase 3+는 hard gate.
- WorkItem lifecycle: authority 전환 뒤로 계속 보류.

## 검증
- inspect-first: 본 문서는 docs/157~163 6개를 종합. 각 인용은 해당 문서에서 이미 inspect-검증됨(재인용). 코드 재검증 불필요(설계 정합성 점검만).
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The authority migration is fully designed end-to-end; every remaining step is code behind explicit overseer gates, and nothing has been flipped. 이 문서는 *A0~A6 종합 장부* 완료를 뜻하며, 어떤 authority도 전환되었거나 코드가 구현되었다는 주장이 아니다. 설계는 닫혔고 실행은 overseer 결정 대기다.
```text
A7 synthesis ledger done (design only). A0~A6 consolidated; all execution overseer-gated; nothing flipped. STOP.
```
