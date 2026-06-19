# A28 Authority A-series Document Index (navigation only, no new design)

> **상태**: 문서 전용 (navigation aid / 찾기 보조). **새 설계·새 결정·새 게이트 0. 코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음.** 본 문서는 A0~A27(docs/157~184) 28개 문서를 한 곳에서 찾기 위한 *평면 목차*일 뿐, 어떤 산출물도 대체(supersede)하지 않는다.
> **선행**: A7 `docs/164`(A0~A6 종합 장부), A22 `docs/179`(테스트 트랙 커버리지 맵 — TC↔doc 추적), A27 `docs/184`(A8~A26 종합 장부 v2 + GO/HOLD 매트릭스). 이 셋은 *판정/상태* 장부다(GO/HOLD·게이트·추적). 본 A28은 *판정이 아니라 위치*다 — "무엇이 어느 파일에 있는가"만 답한다.
> **목표**: A-series가 28개 문서로 늘면서 신규 독자의 단일 진입점이 없다. 종합 장부(164/184)는 *상태*를, 커버리지 맵(179)은 *테스트 추적*을 다루지만, 28개 전부를 한 줄 제목 + 읽는 순서로 나열한 평면 목차는 없다. A28은 그 항행 보조(finding-aid)를 채운다. **새 정보를 만들지 않고 기존 파일을 가리키기만 한다.**

## 한 줄 요약
A flat, reader-facing table of contents for all 28 authority A-series documents (A0~A27 = docs/157~184), grouped by track with one-line titles and read-order pointers and flip-gated flags — a navigation aid that adds no new design, decision, or gate and supersedes nothing.

## 읽는 순서 (신규 독자)
```text
1) 먼저 종합 장부 2개로 전체 그림: A7 docs/164(A0~A6) → A27 docs/184(A8~A26, GO/HOLD 매트릭스·게이트).
2) 출발점·목표: A0 docs/157(실측 authority 장부) → A1 docs/158(migration blueprint).
3) 계약·포맷: A2 docs/159(store seam) → A8/A9 포맷 → A10 재배선.
4) 실행 절차: A13 rollout → A14 parity 스키마 → A15 import runbook → A4 cutover runbook.
5) 테스트 추적: A22 docs/179(커버리지 맵) → 각 Phase 테스트 케이스 문서(A18~A26).
6) 게이트 이해: 🔒 표시 문서는 overseer flip 결정 전 구현 금지(Phase 3~5). non-flip은 G-CODE-012(A27).
```

## 평면 목차 (A# · docs · 제목 · 트랙 · 게이트)
```text
범례: 🔒=flip-gated(overseer 결정 전 구현 금지) · 그 외=non-flip/설계·문서
트랙: AUDIT(실측)·BLUEPRINT(설계)·CONTRACT(계약/포맷)·RUNBOOK(실행 절차)·TEST(테스트 명세)·LEDGER(종합 장부)
```
| A# | docs | 제목 | 트랙 | 게이트 |
| --- | --- | --- | --- | --- |
| A0 | 157 | Canonical Authority Ledger / Storage-Sync Truth Audit | AUDIT | — |
| A1 | 158 | MacBook Authority Migration Blueprint | BLUEPRINT | — |
| A2 | 159 | Local Authoritative Store Seam — Interface Contract | CONTRACT | — |
| A3 | 160 | Legacy Import Verifier — Design | RUNBOOK | — |
| A4 | 161 | MacBook Authority Cutover Runbook | RUNBOOK | 🔒 Phase 4 |
| A5 | 162 | Offline / Reconnect / Phone Operational Truth Audit | AUDIT | — |
| A6 | 163 | Authority Migration Test Plan Matrix | TEST | — |
| A7 | 164 | Authority A-Series Synthesis Ledger (A0~A6) | LEDGER | — |
| A8 | 165 | OPFS Authoritative Store — File Format & Durability Spec | CONTRACT | — |
| A9 | 166 | ReplicaOutbox — Persistence Format & Recovery Spec | CONTRACT | — |
| A10 | 167 | useDgxEventSyncController Re-wire — Slot-in Design | CONTRACT | — |
| A11 | 168 | Phone Pending-Intent — Record Format & Lifecycle | CONTRACT | 🔒 Phase 5 |
| A12 | 169 | Home PC Client Operational Truth Audit | AUDIT | — |
| A13 | 170 | Phase 1 Adapter Rollout — PR Bundle & Shadow Sequence | RUNBOOK | — |
| A14 | 171 | Shadow Parity Report — Compare-Tool Output Schema | CONTRACT | — |
| A15 | 172 | Phase 2 Legacy Import — Execution Runbook | RUNBOOK | — |
| A16 | 173 | Epoch Quarantine — Record Format & Resolution Lifecycle | CONTRACT | 🔒 Phase 3 |
| A17 | 174 | Authoritative Event-ID — Format, Parsing & Validation Spec | CONTRACT | 🔒 Phase 3 |
| A18 | 175 | Phase 1 Adapter Unit-Test — Case Detail | TEST | — |
| A19 | 176 | Controller Re-wire — Behavior-Preservation Test Cases | TEST | — |
| A20 | 177 | Shadow Compare Tool — ShadowParityReport Test Cases | TEST | — |
| A21 | 178 | Phase 2 Import Verifier — Test Cases | TEST | — |
| A22 | 179 | A-series Test-Track Coverage Map & Traceability Index | TEST | — |
| A23 | 180 | P0-1 Baseline Freeze — Test Case Detail | TEST | — |
| A24 | 181 | Phase 3 Epoch / Quarantine — Test Cases | TEST | 🔒 Phase 3 |
| A25 | 182 | Phase 4 Cutover State-Machine — Test Cases | TEST | 🔒 Phase 4 |
| A26 | 183 | Phase 5 Phone Pending-Intent → Authoritative Conversion — Test Cases | TEST | 🔒 Phase 5 |
| A27 | 184 | Authority A-series Synthesis Ledger v2 (A8~A26) + Code-Start Readiness | LEDGER | — |

## 트랙별 묶음 (같은 표, 주제별)
```text
AUDIT(실측 진실):      A0 157 · A5 162 · A12 169
BLUEPRINT(이행 설계):  A1 158
CONTRACT(계약·포맷):   A2 159 · A8 165 · A9 166 · A10 167 · A11 168🔒 · A14 171 · A16 173🔒 · A17 174🔒
RUNBOOK(실행 절차):    A3 160 · A4 161🔒 · A13 170 · A15 172
TEST(테스트 명세):     A6 163 · A18 175 · A19 176 · A20 177 · A21 178 · A22 179 · A23 180 · A24 181🔒 · A25 182🔒 · A26 183🔒
LEDGER(종합 장부):     A7 164 · A27 184
```

## 본 문서가 *아닌* 것 (중복 방지 경계)
```text
- 상태/판정 장부 아님 → 그건 A7 164(A0~6) + A27 184(A8~26, GO/HOLD 매트릭스·G-CODE-012·G-FLIP-1~3).
- 테스트 추적 맵 아님 → 그건 A22 179(테스트 매트릭스 행↔상세 문서).
- 새 설계/결정/게이트 아님 → 본 문서는 기존 파일 위치만 가리킴. 어떤 행도 새 약속을 만들지 않음.
- 정본(canonical) 아님 → 파일 제목/판정이 바뀌면 본 색인은 보조일 뿐, 해당 docs가 정본.
```

## non-goal (이번 A28)
```text
no 새 설계·새 결정·새 게이트 / no 코드·테스트 구현 / no Phase 0~5 착수 / no flip 승인
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no WorkItem · no native shell · no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- **설계+테스트 명세 트랙(A0~A26) = end-to-end 완료**(A27 종합). 본 A28은 그 위 *항행 보조*만 추가 — 설계 잔여 여전히 0.
- 다음은 전부 *코드*(overseer 결정 선결): G-CODE-012 GO → Phase 0~2(A8/A9 어댑터+A10 재배선+A13 PR-1~4, A18~A23 명세대로) → flip 승인(G-FLIP-1~3) 시 Phase 3~5(A24~A26 명세대로).
- 설계 트랙이 닫혔으므로 신규 *설계* 문서는 중복 위험. 본 색인 이후 자동 전진할 비-코드 증분은 사실상 소진 — **다음 fire는 overseer 코드 GO/flip 결정 요청(HOLD) 또는 검증된 narrow 정합 정리에 한정**.

## 검증
- inspect-first: `docs/157~184` 파일별 H1 제목 실측(28개), A7 `docs/164`·A22 `docs/179`·A27 `docs/184`의 역할 경계 확인(상태·추적 vs 위치). 새 primitive·새 판정 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The authority A-series now has a flat reader-facing index (docs/157~184, A0~A27) grouped by track with read-order pointers and flip-gated flags — purely a navigation aid that adds no new design, decision, or gate and supersedes none of the canonical docs. 이 문서는 *항행 보조 색인* 완료를 뜻하며, 새 설계·새 결정·새 게이트가 아니고 어떤 코드·flip도 승인하지 않는다. 설계+테스트 명세 트랙(A0~A26)은 닫힌 채이며 실행은 overseer 결정 대기다(여전히 DGX durable authority).
```text
A28 authority A-series document index done (navigation only). flat TOC of docs/157~184 (A0~A27) by track + read order + flip-gated flags; no new design/decision/gate; supersedes nothing; nothing flipped. STOP.
```
