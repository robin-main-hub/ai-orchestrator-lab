# A1 MacBook Authority Migration Blueprint

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음.**
> **선행**: A0 `docs/157-canonical-authority-ledger.md` (verdict=HOLD on flip; 구현 모델 = DGX-02-data-authoritative).
> **목표**: A0 실측을 기준으로 canonical target을 확정하고, MacBook을 authoritative data store로 옮기는 **단계적·멱등·가역 cutover**를 설계한다. dual-authority window·big-bang·silent overwrite는 설계 단계에서 금지로 못 박는다.

## 한 줄 요약
MacBook authority migration is now specified as a phased, idempotent, reversible cutover with no dual-authority window.

## Canonical target (확정)
```text
MacBook = operational authority + authoritative data store (durable source of truth, revision 발급)
DGX     = sync hub + model execution + replica/projection server (authoritative revision 발급 금지)
phone   = stateless thin client (pending intent 제출, projection 열람, 로컬 authority 없음)
local authoritative store  ⟂  outbox  (책임 분리: 저장의 authority vs 미동기 전송 큐)
committed WorkItem lifecycle = 아직 시작하지 않음 (authority 전환 후)
```
이 target은 A0에서 DGX authority로 후퇴시키지 않는다는 결정을 반영한다. 본 문서는 *설계*이며, MacBook authority가 구현/이전되었다는 주장이 아니다.

## inspect-first 실측 (A1 추가 확인)
- **desktop 런타임 host**: **순수 Vite React SPA**, Cloudflare Pages 배포(`apps/desktop/package.json` `deploy:pages` → `wrangler pages deploy dist`; vite.config 표준; Electron/Tauri/Node 의존성 0). → **native filesystem / better-sqlite3 / node:fs 사용 불가**(그건 `apps/server` 전용).
- **현재 local store**: `localStorage` + in-memory fallback(`stage29LocalEventStore.ts:26,46-59`). 브라우저 clear-all에 소실 → **authoritative durable store 자격 없음**.
- **storage seam**: `LocalClientEventCache`(async: append/listBySession/listUnsynced/markProjected, `stage29LocalEventStore.ts:7-12`)가 진짜 seam. 반면 `ClientEventStorageLike = Pick<Storage,"getItem"|"setItem">`(`:5`)는 **동기 KV**라 async durable backend(OPFS/IndexedDB)엔 부적합 → durable adapter는 sync KV가 아니라 **async `LocalClientEventCache`를 직접 구현**해야 한다(설계 보정).
- **revision 발급**: 서버 `state.revision += 1`(`apps/server/src/index.ts:5742`), `serverRevision` 반환(`:5753`). MacBook은 revision을 발급하지 않는다.
- **approval 이벤트 소유**: 서버가 client push를 **거부** — `containsServerOwnedApprovalEvents`(`:5837`)면 **403 `server_owned_event_type`** "Approval events must be created through server approval routes."(`:7136-7140`). 즉 승인 이벤트는 **서버가 author**한다.
- **pending-intent 개념**: 코드에 **없음**(grep `pending.?intent`/`pendingInput` → 문서 언급만). phone은 approval route로 POST하고 서버가 이벤트를 만든다. → A1에서 신설 설계.
- **conflict 표현**: 서버 dedup = `fingerprintEvent` 동일 → duplicate, logical key(`${sessionId}:${type}:${messageId}`) 동일 → duplicate, 그 외 같은 id·다른 payload → conflict(server 유지)(`:5705-5744`).
- **SimpleMem**: DGX-side 검색 인덱스(A0). 본 설계는 이를 **derived projection**으로 보고 authority로 승격하지 않는다(아래 분리 원칙).

## A0 ledger 보정 (2행 정정)
A0 매트릭스의 아래 두 분류를 **control-plane ownership ≠ durable-data authority** 기준으로 세분한다:
| 행 | A0 표기 | A1 정정 |
| --- | --- | --- |
| Approval/permission | "aligned-by-design (승인은 global state)" | **data 축에서는 contradictory.** 승인의 *의미적 scope*(session/WorkItem/global)는 control-plane 사안이고 맞다. 그러나 *durable authoritative 승인 이벤트*는 현재 DGX가 author(403 가드) → 목표(MacBook authoritative append, DGX projection)와 모순. |
| Phone/Home 입력 | "aligned (DGX는 projection·hub)" | **부분 정정.** DGX가 hub인 건 맞지만 현재는 pending-intent와 authoritative-event를 분리하지 않고 서버가 바로 authoritative 이벤트를 만든다. 목표는 **pending-intent(DGX 보관) → MacBook authoritative 변환 → DGX projection** 2단계. |

## 핵심 분리 원칙: control-plane ownership vs durable-data authority
두 축을 절대 혼동하지 않는다.
- **Control-plane ownership** = *누가 요청을 originate/broker/gate할 수 있는가* (정책·큐·권한 scope). DGX가 승인 요청 큐·정책·runner를 host할 수 있다.
- **Durable-data authority** = *누가 authoritative revision을 발급하고 source of truth를 보유하는가*. 사용자 저작 데이터는 **MacBook**.

| 데이터 종류 | control-plane owner | durable-data authority (target) | 현재 | 비고 |
| --- | --- | --- | --- | --- |
| 사용자 저작 이벤트(결정·coding packet·chat·memory pin/forget) | MacBook | **MacBook** | DGX | authoritative append를 MacBook으로 이전 대상 |
| 승인/권한 결정 이벤트 | DGX(요청 큐·정책 broker 가능) | **MacBook**(최종 승인 이벤트 append) | DGX author(403 가드) | broker는 DGX, 확정은 MacBook, projection은 DGX |
| phone/home 입력 | DGX(pending-intent hub) | **MacBook**(intent→authoritative 변환) | DGX 직행 author | 2단계 신설 |
| memory 검색 인덱스(SimpleMem) | DGX | **derived projection**(authority 아님) | DGX authority | memory *이벤트*는 MacBook authoritative, 인덱스는 DGX 파생 |
| server-owned 런타임 상태(health·model registry·runner 상태) | DGX | **DGX**(정당) | DGX | 사용자 데이터 아님 → DGX 유지 |
| PREVIEW/SANDBOX/fixture/replay | n/a | **migration 대상 아님** | n/a | dry-run/read-only(P9) |

경계 한 줄: **user-authored durable data → MacBook authority. server-owned runtime/control state → DGX 유지.**

## local authoritative store ⟂ outbox (별도 계약)
현재 stage29는 하나의 store가 cache·outbox·(미래)authority를 겸한다. 분리:
- **Authoritative Store (신규 계약)**: append-only, durable, MacBook revision/epoch 부여, 사용자 저작 이벤트의 source of truth. 절대 silent overwrite/drop 없음. 읽기=local-first.
- **Outbox (기존 책임 유지)**: authoritative store에 *이미 확정된* 이벤트 중 **DGX replica로 미전송**인 것의 전송 큐. outbox는 authority가 아니라 *복제 전송 상태*만 추적(`projectedTo` 의미를 "replica로 push됨"으로 재정의, 더 이상 "authority로 projection됨"이 아님).
두 계약은 별도 인터페이스로 둔다. outbox 비움은 데이터 authority와 무관(전송만).

## event id 규칙 (설계)
authoritative 이벤트 id를 구조화:
```text
id = "<authorityNode>:<epoch>:<localSeq>:<uuid>"
  authorityNode : "macbook" (authoritative만; DGX/phone는 authoritative id 발급 금지)
  epoch         : authority epoch (정수, 단조 증가; store 재구축/cutover 시 +1) — split-brain 격리 키
  localSeq      : 해당 epoch 내 MacBook 단조 시퀀스 (gap-free 권장)
  uuid          : crypto.randomUUID() — collision 최종 방어
collision 방지 : (authorityNode, epoch, localSeq) 유일 + uuid backstop.
pending intent : "intent:<deviceId>:<uuid>" — authoritative 아님. MacBook 변환 시 authoritative id 신규 발급(intent id는 correlationId로 보존).
```
하위호환: 기존 `event_<uuid>` id는 import 시 epoch=0(legacy)·localSeq=import 순번으로 정규화하여 보존(원본 id는 `legacyId`로 유지).

## MacBook revision / authority epoch (설계)
- **revision**: authoritative append마다 MacBook이 `revision += 1`(현재 서버 로직 `:5742`를 MacBook으로 이전). 단조·gap-free.
- **authority epoch**: 더 상위 generation. 정상 운영 중 불변. 다음 때 +1: ① 최초 cutover ② authoritative store 재구축/복구 ③ 명시적 authority 이전.
- **epoch 규칙**: 현 epoch을 보유한 노드는 **단 하나**. 다른 epoch을 주장하는 write는 **quarantine**(거부 아님, 보존+격리해 데이터 손실 0). DGX는 client별 `lastSeen{epoch, revision}` 기록.

## DGX replica / projection contract (설계)
- DGX는 MacBook authoritative 이벤트(epoch+revision 포함)를 수신해 **replica log**(기존 append-only JSONL을 replica로 재용도)로 보존하고, phone/home에 **projection** 제공.
- DGX는 **authoritative revision을 발급하지 않는다.** 충돌 정책은 `dgx02_authority_wins` → `macbook_authority_wins`로 명세(코드 변경은 HOLD; protocol union 변경 필요 → 단계 3 gate).
- DGX는 MacBook offline 동안 **pending intent만 보관**(authoritative 확정 금지).
- 현재 서버의 conflict 로직(같은 id·다른 payload → server 유지)은 cutover 후 "replica는 MacBook epoch/revision을 신뢰하고 stale epoch write는 quarantine"으로 대체(설계).

## phone pending-intent → authoritative-event 전환 (설계)
```text
1. phone → POST intent  → DGX hub: pending intent 저장(intent: id, 비-authoritative)
2. MacBook online: DGX에서 pending intents pull
3. MacBook: 정책/권한 검증 후 적용 → authoritative event 발급(macbook:epoch:seq:uuid, correlationId=intent id)
4. MacBook → DGX replica push
5. DGX → phone에 resolved 상태 projection
MacBook offline 시: intent는 pending 유지. DGX는 authoritative 확정 안 함(현재 서버 author 경로 대체).
승인 이벤트도 동일 패턴: 요청은 DGX 큐, 확정 append는 MacBook, projection은 DGX.
```

## 기존 데이터 import 계획 (DGX JSONL / SimpleMem)
- **원본**: 서버 `data/events/events.jsonl`(`{revision, storedAt, event}` 레코드/줄) + SimpleMem export.
- **방식**: MacBook authoritative store로 **일회성 shadow import**. **멱등**(event id 키). 원본 **삭제 금지**(read-only 보존).
- **정규화**: 각 레코드 → epoch=0(legacy), localSeq=정렬된 import 순번, legacyId=원본 id, legacyServerRevision 보존.
- **검증**: import 전후 **count + content hash** 대조. 불일치 시 ROLLBACK.
- **SimpleMem**: memory *이벤트*만 authoritative import 대상. 검색 인덱스 자체는 DGX에서 재빌드(projection).

## import manifest (필수 필드)
```text
sourcePath, sourceFileSha256, sourceGitSha(있으면)
totalRecords, importedCount, duplicateCount, conflictCount, rejectedCount
epochAssigned(=0 legacy), startedAt, finishedAt
verifierHash(imported set의 결정론적 해시)
GO 조건: importedCount + duplicateCount + rejectedCount == totalRecords
        AND conflictCount == 0 (예상치 못한 충돌 없음)
        AND verifierHash가 재계산과 일치
하나라도 불충족 → import HOLD/ROLLBACK, 원본 무변경.
```

## 단일 cutover state machine (dual-authority window 금지)
```text
S0 LEGACY            : DGX authority(현행). MacBook store 없음.
S1 SHADOW_IMPORT     : MacBook authoritative store를 import로 구축. 단 shadow(읽기/검증 전용, authority 아님). DGX 여전히 authority.
S2 VERIFY            : count/hash parity 검증 + reconcile. 실패 → S_ROLLBACK.
S3 CUTOVER(atomic)   : 단일 시점 flip — epoch +1, MacBook=authority, DGX=replica/projection. outbox는 replica push 큐로 전환. (순간 전환, 중첩 window 없음)
S4 POST_CUTOVER      : DGX projection-only. legacy JSONL read-only 봉인. 정상 운영.
S_ROLLBACK           : MacBook authority 폐기, DGX가 untouched JSONL로 authority 유지. 데이터 손실 0(원본 무변경).
금지 상태: DUAL_AUTHORITY(MacBook과 DGX가 동시에 authoritative revision 발급) — 설계상 존재하지 않음.
```

## split-brain 방지
- 현 epoch 보유 노드는 **유일**. cutover는 **atomic epoch bump**(중간 window 없음).
- 다른 epoch의 write → **quarantine**(보존+격리, drop 아님). DGX는 stale epoch 이벤트를 authoritative로 승격하지 않음.
- MacBook offline 동안 DGX는 **pending intent만** 보관 → 두 번째 authority 발생 불가.
- cutover 직전 outbox/intent 드레인 절차로 in-flight 손실 방지.

## rollback / legacy 보존
- legacy JSONL은 cutover 후에도 **read-only로 영구 보존**(즉시 삭제 금지).
- S4 봉인 전까지 cutover 가역: rollback = MacBook epoch 폐기 → DGX가 무변경 JSONL에서 authority 재개.
- 모든 단계는 멱등 재실행 가능.

## storage backend 결정 (SQLite 선결론 배제)
desktop이 **순수 web SPA(native shell 없음)**이므로:
| backend | 지금 가용 | durability | 용량 | native shell 필요 | 판정 |
| --- | --- | --- | --- | --- | --- |
| localStorage(현행) | yes | **없음**(clear에 소실) | ~5–10MB | no | **authoritative 불가** |
| IndexedDB | yes(API) | clear 견딤, fsync 보장 약함 | 100s MB–GB(quota) | no | **fallback 후보** |
| OPFS | API 필요 | **fsync+append-only 가능(웹 최강)** | GB(quota) | no | **primary 후보**(Chrome86+/Safari15.1+/Firefox 부분) |
| SQLite-wasm + OPFS | dep 필요 | durable(OPFS 위) | GB | no | 고비용, SQL 필요 시만 |
| native SQLite(better-sqlite3) | no | 완전 durable | 무제한 | **yes(Electron/Tauri)** | **OUT OF SCOPE — broad platform rewrite** |
| append-only file(node:fs) | no | 완전 durable | 무제한 | **yes(Node main)** | **OUT OF SCOPE** |

결정:
- **authoritative durable store = OPFS primary + IndexedDB fallback**(둘 다 native shell 불요). 어댑터는 **async `LocalClientEventCache` 구현**(동기 `ClientEventStorageLike` 아님).
- **native SQLite / node:fs는 채택하지 않음** — Electron/Tauri 도입은 storage swap이 아니라 platform rewrite(big-bang 금지 원칙 위반). 향후 native shell이 별도 결정되면 재평가.
- localStorage는 authoritative 후보에서 **제외**(legacy fallback 용도로만).

## 단계별 PR · 테스트 계획 (미래 코드, 본 PR 아님)
```text
Phase 0 (이 A1)  : 설계 문서만(docs/158). 코드 0.
Phase 1          : async durable adapter(OPFS primary/IndexedDB fallback) — LocalClientEventCache 구현, flag 뒤 shadow only, authority 불변. 테스트: durability/quota/parity-vs-localStorage.
Phase 2          : import 도구 + manifest + verifier(서버 JSONL/SimpleMem export read-only). 테스트: 멱등성, count/hash parity.
Phase 3          : epoch + MacBook revision 발급(protocol union 변경 = HOLD gate). 테스트: epoch quarantine, seq 단조.
Phase 4          : cutover state machine + DGX replica/projection contract + conflict policy 명세 반영. 테스트: 상태 전이, split-brain 거부, rollback.
Phase 5          : phone pending-intent 경로. 테스트: offline intent 보존, MacBook 변환, projection.
각 Phase = 독립 PR, CI green, big-bang 금지.
```

## GO / HOLD 조건
```text
GO(다음 phase 착수 가능): import 전후 동일성 검증 가능 · durable adapter 입증 · epoch guard 설계 확정 · rollback 입증 · destructive step 없음.
HOLD:
- migration 전후 데이터 동일성 검증 방법 없음
- native storage 도입이 broad platform rewrite 요구(현재 native SQLite/node:fs)
- 서버 JSONL/SimpleMem export가 비결정론적
- approval/phone pending-input 경계 불명확
- authority epoch 없이 split-brain 방지 불가
- destructive migration 필요
- secret/data-loss 위험
- required CI regression
```

## 설계 원칙 (못 박음)
```text
no big-bang rewrite · no dual-authority window · no silent overwrite/drop
no deletion of source before migration · DGX는 MacBook offline 중 authoritative event 확정 금지
DGX는 pending intent 보관 가능하나 authoritative revision 발급 금지
migration은 idempotent · import 전후 count/hash 검증 필수
다른 authority epoch의 write는 quarantine
PREVIEW/SANDBOX/fixture는 migration 대상 아님
generic OS only · no company/domain/ERP terms
```

## 병행 PR 판단 (유지)
- **#513**(product-kernel 320줄, CONFLICTING·미배선·미테스트) → **close/supersede** 권고 유지.
- **#561**(커서 cosmetic) → authority 트랙과 분리된 저위험.
- **#562**(mimo 서버 토큰) → merge 전 genericity + secret/env 경로 재검사 필요.
- **SQLite/localStorage drift**(A0 발견) → A1 storage backend 결정(OPFS/IndexedDB) 확정 전엔 별도 수정하지 않음(이 설계가 정정의 근거가 됨).

## non-goal (이번 A1)
```text
no code / protocol type / schema / migration / EventStorage 동작 변경
no authority flip 실행 (Phase 3+ HOLD gate)
no committed WorkItem lifecycle 시작
no native shell(Electron/Tauri) 도입
no real network / no secret / no DB write / no patch apply
```

## 검증
- inspect-first 읽기: `stage29LocalEventStore.ts`(seam), `apps/desktop/package.json`/`vite.config.ts`(런타임 host), `apps/server/src/index.ts:5682-5763,5837,7136-7140`(revision/conflict/approval 가드), grep `pending-intent`(부재 확인).
- storage backend 가용성 비교(native shell 부재 → native SQLite/node:fs out-of-scope).
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
MacBook authority migration is now specified as a phased, idempotent, reversible cutover with no dual-authority window. 이 문서는 migration **설계** 완료를 뜻하며, MacBook authority가 실제 구현되었거나 데이터가 이전됐다는 주장이 아니다. authority flip(Phase 3+), native shell 도입, 실제 cutover는 전부 별도 결정·후속 phase이며, 본 A1은 그 경계와 안전 조건(멱등 import·단일 atomic cutover·epoch split-brain guard·read-only legacy 보존)을 정본화한 것이다.
```text
A1 done. MacBook authority migration blueprint specified (design only). no code/schema/migration changed. STOP. (A2 자동 시작 금지)
```
