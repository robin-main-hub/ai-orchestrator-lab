# A0 Canonical Authority Ledger / Storage-Sync Truth Audit

> **상태**: audit 완료 — docs only (ledger). **판정 = HOLD on authority flip** (code-level mismatch with target; no implementation).
> **목표**: 현재 코드의 실제 authority/store/sync 동작을 inspect-first로 실측하고, "MacBook = operational/data authority; DGX = sync hub + 모델 실행 + projection server" 목표 아키텍처와 일치하는지 정직하게 판정한다. 문서를 먼저 고쳐 현실을 가리지 않는다.

## 한 줄 요약
Authority truth audit is complete; the implemented storage and sync model is now explicitly classified against the MacBook-authority architecture.

## 판정 (verdict) — HOLD
**구현된 모델은 DGX-02-data-authoritative-with-client-cache이며, "MacBook = data authority" 목표와 정면으로 모순된다.** 이것은 *문서 drift가 아니라 코드 차원의 아키텍처 불일치*다 — README/docs/seed/protocol/runtime-reducer가 모두 한목소리로 DGX-02를 durable authority·conflict winner로 구현·기술하고 있다. 목표(MacBook data authority)로 바꾸는 것은 durable store 이전 + conflict-policy 반전 + sync 방향 의미 재정의를 수반하는 대형 변경이므로, 진행 규칙에 따라 **구현하지 않고 migration plan + HOLD로 보고**한다.

핵심 구분:
- **Operational authority(작업 원천·오프라인 지속·실행)** → 이미 MacBook-aligned ✅ (이벤트가 desktop에서 최초 생성, client가 id 발급, 오프라인 local-first, DGX 다운 시 로컬 모델로 지속).
- **Data/durable authority(원본 저장·revision·conflict winner)** → DGX-02 ❌ (목표와 모순).
- 즉 gap은 **data-authority 축 한 곳**에 집중되어 있고, 나머지(origination, offline-first, phone projection, DGX 모델 실행)는 이미 목표와 일치한다.

## inspect-first 실측 증거 (정본)
| 관점 | 실측 동작 | 증거 (file:line) |
| --- | --- | --- |
| 이벤트 최초 생성 | **MacBook(client)** 가 `event_${crypto.randomUUID()}` 발급, `source="desktop"` | `apps/desktop/src/runtime/stage2Runtime.ts` (`createStage2Event`), stage4/stage14 동일 패턴 |
| 로컬 저장 | `localStorage` 키 `ai-orchestrator:local-event-cache:client_macbook` + 메모리 fallback. **cache/outbox 역할 한정** | `apps/desktop/src/runtime/stage29LocalEventStore.ts:26,28-30,46-59` |
| 로컬 store의 자기 규정 | 코드 주석: *"DGX-02 remains the authority; this store only preserves client events until they are projected to the authority"* | `stage29LocalEventStore.ts:28-30` |
| projection 대상 | `type ProjectionTarget = "dgx-02"` **하드코딩** (다른 authority 불가) | `stage29LocalEventStore.ts:3` |
| outbox 판정 | `!record.projectedTo["dgx-02"]` 인 것만 unsynced | `stage29LocalEventStore.ts:71-76` |
| sync push 방향 | client → `POST /events/sync` (HMAC), idempotency `${clientId}:${sessionId}:${ids}` | `apps/desktop/src/runtime/stage14EventSync.ts:45-129` |
| durable append 위치 | **서버** append-only JSONL `data/events/events.jsonl`, `{revision, storedAt, event}` 한 줄/레코드 | `apps/server/src/index.ts` (`pushEventsToPersistentServerStorage`, `appendAcceptedEventsToJsonl`) |
| revision 발급 | **서버** monotonic counter | `apps/server/src/index.ts` (ServerEventStorageState.revision) |
| conflict winner | `dgx02_authority_wins` (mechanical) / `manual_review` (semantic). 같은 id·다른 payload → server 유지, client에 conflict 반환 | `apps/server/src/index.ts:881`; 서버 push 로직 `same_event_id_different_payload`/`same_logical_event_different_payload` |
| runtime reducer | 병합 시 authority를 dgx02로 **고정**(입력이 `server_authoritative_with_local_outbox`여도 결과는 `dgx02_authoritative_with_client_cache`) | `apps/desktop/src/runtime/stage5Runtime.test.ts:113-136` (reducer 동작 명세) |
| 서버 config | `eventStoreMode:"dgx02_authoritative_with_client_cache"`, `conflictPolicy:"dgx02_authority_wins"`, authority client `syncRole:"authority"` | `apps/server/src/index.ts:879-883` |
| desktop seed | 동일 값 | `apps/desktop/src/seeds/runtime.ts:47-49` |
| protocol 타입 | `conflictPolicy: "dgx02_authority_wins" | "manual_review"`; `ClientDevice.localStore: "sqlite" | "none"` | `packages/protocol/src/index.ts:2146-2153, 2139` |
| phone/home PC | 로컬 store 없음, DGX projection을 GET(`/events`,`/sessions`)로 read, approval만 POST | `apps/mobile/src/lib/api.ts` (getJson/postJson) |
| 오프라인 동작 | 새 이벤트 즉시 local cache append(`projectedTo:{}`), 복귀 시 outbox push, server가 revision 부여하며 수용 | stage29 append + stage14 push 결합 |

## authority truth 매트릭스 (정본)
| 데이터/이벤트 | 최초 생성 | authoritative append | local storage | sync 대상 | 충돌 시 승자 | 현재 구현 | 목표(MacBook authority)와 일치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 일반 EventEnvelope | MacBook (client UUID) | **DGX JSONL** | localStorage cache/outbox | DGX-02 | **DGX** (`dgx02_authority_wins`) | implemented | **contradictory** (data authority가 DGX) |
| 오프라인 생성 이벤트 | MacBook (offline) | DGX (복귀 후) | localStorage outbox | DGX-02 | DGX | implemented | **partial** (생성·offline-first ✅ / durable·winner ❌) |
| 사용자 결정·Coding Packet·memory pin (semantic) | MacBook | DGX | localStorage | DGX-02 | `manual_review`(conflict UI) | implemented | partial (자동 덮어쓰기는 안 하나 원본은 DGX) |
| Approval/permission 이벤트 | client | DGX (server-owned 검사) | — | DGX-02 | DGX | implemented | aligned-by-design (승인은 global state) |
| Memory record (SimpleMem) | client/agent | DGX SimpleMem (authority) | — | DGX-02 | DGX + `quarantined` 상태 | implemented | contradictory (목표상 데이터 authority는 MacBook) |
| Phone/Home PC 입력 | phone/home | DGX (pending client input) | none | DGX-02 | DGX | implemented | **aligned** (DGX는 목표에서도 projection·hub) |
| revision/순번 | — | **DGX** monotonic | — | — | DGX | implemented | contradictory (목표상 MacBook이 발급해야) |

분류 요약:
- **implemented & contradictory**: 일반 이벤트 durable append, conflict winner, revision 발급, memory authority — 목표의 핵심(데이터 authority)과 정반대로 구현됨.
- **implemented & partial(aligned 일부)**: origination·offline-first는 이미 MacBook, durable·winner만 DGX.
- **implemented & aligned**: phone projection 경로, approval server-ownership, DGX 모델 실행 역할.
- **absent**: MacBook 측 durable(SQLite) authority store, MacBook revision 발급, `macbook_authority_wins` conflict policy — *존재하지 않음*.

## docs-drift vs code-level mismatch (정직한 구분)
1. **authority 방향 = code-level mismatch, NOT docs-drift.**
   - README:3,12,14, docs/01-architecture.md:28,75, docs/10, docs/13:52, docs/16:186이 전부 "DGX-02 = 메인 authority·원본 저장소, MacBook = cache/outbox client, `dgx02_authority_wins`"라고 *정확히* 기술한다.
   - 코드도 동일하게 구현한다. **문서는 코드를 충실히 반영하고 있다 — drift 아님.**
   - 따라서 "문서를 MacBook-authority로 고쳐서 현실을 가리는" 행위는 금지(진행 규칙 위반). 현실(코드)이 DGX-authority이기 때문이다.
2. **좁은 진짜 drift = 로컬 store 메커니즘.**
   - 문서/seed/protocol: MacBook 로컬 store = **"SQLite"** (README:14, docs/01/10, `ClientDevice.localStore:"sqlite"`, seeds).
   - 코드: `stage29LocalEventStore.ts`는 **localStorage + in-memory fallback** 사용(SQLite 아님).
   - 이것은 evidence-based docs/seed drift다. 단 authority 축과 독립적이고 좁다. 본 ledger에 명문화하고, 정정은 별도 narrow PR 후보로 남긴다(이번 A0는 ledger만 산출).

## migration / data-loss 영향 (목표 flip을 *만약* 추진한다면 — HOLD 대상)
"MacBook = data authority"로 바꾸려면 다음이 필요하며, 각각 위험을 동반한다:
1. **durable store 이전**: 현재 원본은 서버 JSONL(`data/events/events.jsonl`). MacBook에 진짜 durable store(문서가 약속한 SQLite) 신설 + 기존 서버 JSONL → MacBook 일회성 import + revision 재기준선. → **import 누락/중복·revision 충돌 시 데이터 손실/분기 위험.**
2. **conflict policy 반전**: `dgx02_authority_wins` → `macbook_authority_wins`. protocol union(`conflictPolicy`)·`eventStoreMode` enum 변경 + 서버/seed config + **stage5 reducer(현재 dgx02로 pin)** + 20+ 테스트 fixture(`dgx02_authority_wins` 참조) 전면 수정.
3. **sync 방향 의미 재정의**: DGX JSONL을 authority → **replica/sync-hub + projection**으로 강등. 서버 push 핸들러의 "server 유지" conflict 로직 재설계.
4. **multi-client write 경로**: phone/home PC write(approval 등)는 현재 DGX로 직행. MacBook authority + MacBook offline 시, DGX가 hub로서 MacBook에 큐잉해야 함 → 가용성·정합성 복잡도 상승.
5. **전환 구간 split-brain**: 전환 중 양쪽이 자기를 authority로 여기면 분기. 멱등 import·단일 cutover·검증 절차 필수.
→ DB/EventStorage rewrite + protocol/schema 변경 + migration을 수반하므로 **진행 규칙상 HOLD**. 본 세션에서 구현하지 않는다.

## open PR 분류 (close / salvage / supersede)
| PR | 내용 | authority 관련 | 권고 |
| --- | --- | --- | --- |
| **#562** server-side mimo 토큰 주입(`apps/desktop/functions/*`, vite.config, handoff) | 배포 429 auth 차단 실수정, 실 키 미노출 | **무관**(orthogonal) | **salvage** — 자체 트랙에서 owner가 env secret 배선 검증 후 판단. A0와 독립, A0가 supersede하지 않음. |
| **#561** Summon Theater 커서 CSS flex 고정(1 file, 5/4) | 시각 cosmetic, 빌드 green | **무관** | **salvage** — 저위험, MERGEABLE. 실화면 screenshot 미실행이라 owner 배포 후 확인. A0와 독립. |
| **#513** product-kernel isolation contracts(`packages/protocol/src/productKernel.ts`, 320/0, **CONFLICTING**, 미배선·미테스트) | 신규 protocol 계약 초안 | 간접(아키텍처) | **supersede/close** — unwired·unverified·conflicting 320줄 초안. authority 방향(A-series) 확정 전에 머지 금지. 필요 시 배선+테스트와 함께 재도출. |

## 의도적으로 하지 않은 것 (진행 규칙 준수)
```text
no authority flip implementation (HOLD: migration/EventStorage rewrite 필요)
no README/docs rewrite to MacBook-authority (현실=코드가 DGX-authority → 가리기 금지)
no protocol/schema/migration change
no broad architecture rewrite
no EventStorage write / runner dispatch / external send / patch apply
no committed WorkItem lifecycle start (A3 영역, 미착수)
no domain/company/ERP addition (generic OS only)
no real network calls
```

## 권고 다음 순서 (overseer 판단용)
1. **결정 게이트(1호기)**: 목표를 정말 "MacBook data authority"로 둘 것인가, 아니면 현행 "DGX data authority + MacBook operational authority"를 정본으로 인정할 것인가? — 이 결정 전에는 어떤 코드 flip도 시작하지 않는다.
2. flip 채택 시 → 위 migration plan을 별도 설계 트랙(멱등 import·단일 cutover·split-brain 가드·fixture 일괄 변경)으로. **본 ledger의 GO 범위 밖.**
3. 현행 인정 시 → 좁은 정정 2건만: (a) SQLite vs localStorage drift 문서/seed 정정, (b) 추천 순서 A1(Operational Truth)로 진행.

## 검증
- inspect-first 읽기: `stage29LocalEventStore.ts`(전문), `stage14EventSync.ts`, `stage2Runtime.ts`, `apps/server/src/index.ts`(push/append/conflict), `packages/protocol/src/index.ts:2146-2153`, `apps/mobile/src/lib/api.ts`, `README.md`, `docs/01/10/13/16`.
- grep 교차검증: `dgx02_authority_wins`/`conflictPolicy`/`eventStoreMode` 가 server config·desktop seed·stage5 reducer·20+ fixture에서 일관되게 DGX-authority로 나타남(드리프트 없음).
- docs-only ledger이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
Authority truth audit is complete; the implemented storage and sync model is now explicitly classified against the MacBook-authority architecture. 이것은 OS가 MacBook-authority로 동작한다는 주장이 아니다 — 정반대로, 구현·문서가 모두 DGX-02-data-authoritative임을 inspect-first로 확인했고, 그것이 목표와 *코드 차원에서* 모순됨을 명문화했다. 목표 flip은 migration을 수반하므로 HOLD이며, 실제 추진 여부는 overseer 결정이다.
```text
A0 done. authority truth audit complete. verdict=HOLD on flip (code-level mismatch, not docs-drift). STOP.
```
