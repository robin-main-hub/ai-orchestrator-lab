# A22 A-series Test-Track Coverage Map & Traceability Index (design only)

> **상태**: 설계·문서 전용 (design only / 인덱스·추적표). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A6 `docs/163`(Phase 0~5 테스트 매트릭스 — 모든 TC의 *한 줄* 정본), A18 `docs/175`(P1 어댑터), A19 `docs/176`(controller 재배선/shadow), A20 `docs/177`(compare 도구), A21 `docs/178`(Phase 2 import verifier). 상세화 4문서가 A6 매트릭스의 어느 행을 덮었는지 흩어져 있어 한눈에 추적 불가.
> **목표**: A18~A21이 A6 매트릭스 행들을 *제각기* given/when/then으로 확장했다. A22는 그것을 **단일 추적표(TC↔상세문서)+커버리지 맵**으로 묶어, (1)어느 TC가 *바로 구현 가능*하게 상세화됐는지, (2)어느 TC가 아직 *한 줄*뿐인지(미완 gap), (3)각 gap이 non-gated인지 flip-gated인지 기계적으로 보이게 한다. 새 테스트 케이스를 만들지 않는다 — 기존 설계 자산의 *지도*다. **인덱스 설계이지 테스트 구현이 아니다.**

## 한 줄 요약
Every A6 test-matrix row is now traced to its detail doc (or flagged as an undetailed gap with its gate status), giving a single coverage map that shows Phase 1+2 + controller + compare are fully specified while Phase 0 baseline and Phase 3~5 remain one-liners behind the overseer flip gate.

## 추적표: A6 매트릭스 행 → 상세문서 (정본)
```text
범례: ✅상세화 완료(given/when/then, 바로 구현 가능) · ◻︎ 한 줄만(미완 gap) · 🔒 flip-gated(overseer 승인 전 구현 금지)
```

### Phase 0 — Baseline freeze (회귀 가드)
| A6 TC | 케이스 | 상세문서 | 상태 |
| --- | --- | --- | --- |
| P0-1 | 현 `LocalClientEventCache` 4메서드 회귀 | (A19 CW-1~7이 동작-보존을 덮으나 *기존 stage29 green 유지* 자체는 미상세) | ◻︎ non-gated gap |
| P0-2 | 현 sync state 전이 보존 | A19 `docs/176` CW-2(status queued→syncing→synced 전이 보존) | ✅ |

### Phase 1 — AuthoritativeEventStore adapter (shadow)
| A6 TC | 케이스 | 상세문서 | 상태 |
| --- | --- | --- | --- |
| P1-1 | append-only(update/delete 부재) | A18 `docs/175` P1-1 | ✅ |
| P1-2 | idempotent append(no-op) | A18 P1-2 | ✅ |
| P1-3 | head() 단조 | A18 P1-3 | ✅ |
| P1-4 | contains(id) 정확성 | A18 P1-4 | ✅ |
| P1-5 | durable backend 재생성 견딤 | A18 P1-5 | ✅ |
| P1-6 | localStorage backend 거부 | A18 P1-6 | ✅ |
| P1-7 | shadow 격리(authority 0) | A18 P1-7 | ✅ |
| (RO-1~6) | ReplicaOutbox 짝(A6 미기재, A9) | A18 RO-1~RO-6 | ✅ (A18이 보강) |

### controller 재배선 (A10 체크리스트 — A6 G-1~G-4 가드 포함)
| 가드/케이스 | 상세문서 | 상태 |
| --- | --- | --- |
| CW-1~CW-7 동작-보존(offline-first·드레인·hydrate 등) | A19 `docs/176` | ✅ |
| SD-1~SD-4 shadow dual-write(A13 PR-2) | A19 `docs/176` | ✅ non-gated |
| G-1 offline append status:queued 보존 | A19 CW-1 | ✅ |
| G-2 로컬 확정 후 push 순서 | A19 CW-1/CW-5 | ✅ |
| G-3 reconnect drain 멱등(idempotencyKey) | A19 CW-4 | ✅ |
| G-4 부분 동기 status:failed conflict review | A19 CW-2 | ✅ |

### compare 도구 (A14 verdict 산출)
| 케이스 | 상세문서 | 상태 |
| --- | --- | --- |
| CP-1~CP-9 PARITY/DRIFT verdict + A3불변식 diff 분류 | A20 `docs/177` | ✅ |
| CP-G 연속 PARITY graduate 게이트(A13) | A20 `docs/177` | ✅ non-gated |

### Phase 2 — Import + verifier (멱등 parity)
| A6 TC | 케이스 | 상세문서 | 상태 |
| --- | --- | --- | --- |
| P2-1 | no loss(I1) | A21 `docs/178` P2-1 | ✅ |
| P2-2 | no mutation(I2) | A21 P2-2 | ✅ |
| P2-3 | no dup(I3) | A21 P2-3 | ✅ |
| P2-4 | accounted(I4 등식) | A21 P2-4 | ✅ |
| P2-5 | deterministic verifierHash(I5) | A21 P2-5 | ✅ |
| P2-6 | idempotent re-import(I6) | A21 P2-6 | ✅ |
| P2-7 | 손상 줄→rejected 가시화 | A21 P2-7 | ✅ |
| P2-8 | same_id_different_payload→conflict(GO 차단) | A21 P2-8 | ✅ |
| P2-9 | SimpleMem 비결정론→HOLD | A21 P2-9 | ✅ |
| P2-10 | verifierHash storedAt/revision 무관 | A21 P2-10 | ✅ |
| (MG-1~5) | manifest GO/HOLD 분기+rollback no-op | A21 MG-1~MG-5 | ✅ (A15 runbook 연결) |

### Phase 3 — epoch/revision 발급 (🔒 HOLD gate)
| A6 TC | 케이스 | 포맷 선행 | 테스트 상세 | 상태 |
| --- | --- | --- | --- | --- |
| P3-1 | event-id `node:epoch:seq:uuid` 파싱 | A17 `docs/174`(포맷·파서·검증) | 미작성 | ◻︎🔒 |
| P3-2 | epoch==E accept | A16 `docs/173`(quarantine 판정/레코드) | 미작성 | ◻︎🔒 |
| P3-3 | epoch<E → quarantine(stale, drop 아님) | A16 | 미작성 | ◻︎🔒 |
| P3-4 | epoch>E → quarantine(unknown_future) | A16 | 미작성 | ◻︎🔒 |
| P3-5 | NEVER silent drop | A16 | 미작성 | ◻︎🔒 |
| P3-6 | 두 번째 authoritative revision 발급 불가 | A1 `docs/158` 원자성 | 미작성 | ◻︎🔒 |

### Phase 4 — cutover 실행 + state 전이 S0→S4 (🔒 HOLD gate)
| A6 TC | 케이스 | 선행 | 상태 |
| --- | --- | --- | --- |
| P4-1 | PRE-DRAIN GATE(synced&&outbox0) | A4 `docs/161` cutover | ◻︎🔒 |
| P4-2 | 멱등 재전송(idempotencyKey 흡수) | A4 / A0 dedup | ◻︎🔒 |
| P4-3 | atomic flip(DUAL_AUTHORITY window 부재) | A1/A4 | ◻︎🔒 |
| P4-4 | live drift 흡수(증분 import 후 재검증) | A4 S2 | ◻︎🔒 |
| P4-5 | S_ROLLBACK 무손실(원본 JSONL 불변) | A4 | ◻︎🔒 |
| P4-6 | rollback 멱등 | A4 | ◻︎🔒 |
| S0→S4 전이 5종 + any→S_ROLLBACK | 상태 머신 | A4 / A6 §state | ◻︎🔒 |

### Phase 5 — phone pending-intent → authoritative (🔒 flip 후만)
| A6 TC | 케이스 | 선행 | 상태 |
| --- | --- | --- | --- |
| P5-1 | phone pending-intent 제출(직행 아님) | A11 `docs/168`(레코드 포맷·수명주기) | ◻︎🔒 |
| P5-2 | MacBook이 intent→authoritative 변환자 | A1/A5/A11 | ◻︎🔒 |
| P5-3 | DGX는 projection/replica만 | A1 | ◻︎🔒 |
| P5-4 | intent 손실 0(드레인/재연결) | A5/A11 | ◻︎🔒 |

## 커버리지 요약 (기계 판정용)
```text
✅ 상세화 완료(바로 구현 가능): Phase 1 전부(P1-1~7 + RO-1~6) · controller(CW-1~7 + SD-1~4 + G-1~4) · compare(CP-1~9 + CP-G) · Phase 2 전부(P2-1~10 + MG-1~5) · P0-2.
   → non-gated 트랙(Phase 0~2 + Phase 1 배선)은 P0-1 빼고 전 행이 given/when/then 명세 보유.
◻︎ non-gated gap(지금 상세화 가능): P0-1(기존 stage29 회귀 green 유지 — baseline freeze 명시 케이스).
◻︎🔒 flip-gated gap(포맷/runbook은 있으나 테스트 케이스 미작성, overseer 승인 전 구현 금지):
   Phase 3 전부(P3-1~6, 선행 A16/A17 포맷 완비) · Phase 4 전부(P4-1~6 + S0→S4 전이, 선행 A4) · Phase 5 전부(P5-1~4, 선행 A11).
```

## 이 인덱스가 가능케 하는 것
```text
- overseer가 "어디까지 구현 가능 명세가 섰나"를 한 표로 확인 → Phase 1+2 코드 착수 GO 판단 입력.
- 다음 미완 증분 선택이 추측 아닌 *지도 기반*: non-gated 남은 칸 1개(P0-1), 나머지는 전부 flip-gated.
- flip-gated 행은 *선행 포맷 문서까지* 추적돼(P3→A16/A17, P4→A4, P5→A11), 승인 즉시 어느 spec 위에 테스트를 얹을지 명확.
- A6 매트릭스가 "한 줄"로 남긴 행과 상세화된 행을 시각적으로 분리 → 회귀 시 어느 문서를 봐야 하는지 즉시 라우팅.
```

## 결정론·격리 불변 (인덱스 자체 성질)
```text
- 본 문서는 기존 docs/163,175,176,177,178 + 포맷 문서(158,161,168,173,174)에 대한 *참조 지도*일 뿐 — 새 케이스·새 assertion·새 primitive 0.
- 어떤 코드/테스트/스키마도 건드리지 않음. authority flip 신호 0(인덱스는 판정 안 함, 지도만).
- flip-gated 행은 🔒로 명시 — 이 문서가 그 행들의 구현을 *승인하지 않음*(overseer 게이트 유지).
```

## non-goal (이번 A22)
```text
no 새 테스트 케이스 / no 테스트 구현 / no 어댑터·verifier·compare 구현
no Phase 3~5 테스트 상세화(flip-gated — 선행 포맷만 가리킴)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급 · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A23 후보(non-gated): **P0-1 baseline freeze 케이스 상세화**(A6에 한 줄 남은 마지막 non-gated 행 — 기존 `stage29`/`stage14EventSync` green 유지를 회귀 가드 given/when/then으로). 이로써 non-gated 테스트 트랙 100% 상세화 완결.
- 그 이후 flip-gated(🔒, overseer 승인 후): Phase 3 epoch/quarantine 테스트 상세(P3-1~6, A16/A17 위), Phase 4 cutover state-machine 테스트(P4-1~6 + S0→S4), Phase 5 phone intent 변환 테스트(P5-1~4).
- overseer 승인 후 Phase 0~2 코드: A8/A9 어댑터 + A10 재배선 + A13 PR-1~4, 본 추적표의 ✅ 명세대로 테스트.

## 검증
- inspect-first: A6 `docs/163:21-96`(Phase 0~5 매트릭스 + state 전이 + G-1~4 — 본 추적표의 행 정본), A18 `docs/175`·A19 `docs/176`·A20 `docs/177`·A21 `docs/178`(상세화 4문서), 포맷 선행 A1 `docs/158`·A4 `docs/161`·A11 `docs/168`·A16 `docs/173`·A17 `docs/174`. 새 primitive·새 케이스 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The A-series test track now has a single coverage map: every A6 matrix row (P0~P5 + state transitions + G-guards) is traced to its detail doc or flagged as an undetailed gap with gate status, showing Phase 1+2 + controller + compare fully specified, P0-1 the last non-gated gap, and Phase 3~5 detailed-only-after-flip behind their format specs. 이 문서는 *추적표·커버리지 맵 작성* 완료를 뜻하며, 새 테스트 케이스가 설계되었거나 어떤 코드가 구현되었다는 주장이 아니다. flip-gated 행의 구현을 승인하지 않으며(overseer 게이트 유지), 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A22 A-series test-track coverage map done (design only). A6 P0~P5 + G-guards traced to A18~A21 detail docs; Phase1+2+controller+compare ✅, P0-1 last non-gated gap, Phase3~5 🔒flip-gated. index only, no new cases/tests/code. not a flip. STOP.
```
