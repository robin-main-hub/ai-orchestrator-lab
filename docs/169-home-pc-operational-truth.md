# A12 Home PC Client Operational Truth Audit (docs only)

> **상태**: audit 완료 — docs only (inspect-first, 코드 gap 패치 없음). A5(`docs/162`)가 phone만 다뤘던 빈틈을 home_pc로 보완.
> **선행**: A0 `docs/157`, A1 `docs/158`(target), A5 `docs/162`(phone operational truth).
> **목표**: A1 target("MacBook=operational+authoritative, 그 외=client/replica")에 비춰 **home_pc(`client_home_pc`) 클라이언트의 실제 operational 동작**을 inspect-first로 실측한다. A5가 phone(stateless thin client) 축을 봤다면, A12는 home_pc 축. 설계가 아니라 **현 코드의 operational truth 기록 + 선언 메타 불일치 1건 고정**.

## 한 줄 요약
home_pc is correctly not an authority node, but there is no home_pc app in this repo, and its seed metadata mislabels it as an offline-cache-outbox/sqlite client while its failurePolicy and actual wiring make it DGX-dependent with no independent outbox.

## 실측 (정본)
### home_pc 앱 부재 — 토폴로지 선언만 존재
- repo의 앱은 **셋뿐**: `apps/desktop`(=client_macbook), `apps/mobile`(=phone), `apps/server`(=DGX-02). **home_pc 런타임/앱 없음**.
- `client_home_pc`는 syncTopology에 **선언된 클라이언트 메타**로만 존재(desktop seed `apps/desktop/src/seeds/runtime.ts:63-74`, server seed `apps/server/src/index.ts:907-918`). → home_pc의 origination/offline 동작을 *이 repo가 직접 구현하지 않는다*. 별도 기기/앱(미존재 또는 외부).

### home_pc write 경로 — MacBook과 같은 sync 프로토콜
- home_pc가 이벤트를 만들 때는 **동일 `/events/sync` 경로**를 쓴다: 서버 테스트가 `clientId:"client_home_pc"`, `idempotencyKey:"client_home_pc:session_new:..."`로 세션 생성 이벤트 push를 검증(`apps/server/src/index.test.ts:1626,1658,1661,1674`). → 프로토콜 축은 MacBook과 대칭(클라이언트가 push, 서버가 durable author = A0 DGX-authority 그대로).

### home_pc 표면 동작 — DGX 의존(offline-first 아님)
- controller가 home_pc 상태를 **DGX 도달성에 직결**: `client_home_pc` → `status: dgxReachable ? "online" : "degraded"`, **`outboxCount: 0` 하드코딩**(`apps/desktop/src/hooks/useDgxEventSyncController.ts:143-150`). MacBook은 자기 outbox 드레인 기준(`:139`)인 것과 대조.
- UI: `RuntimeRailPanel.tsx:99-101`이 home_pc를 "온라인 전용 / DGX 필요"로 표기(`homePcClient.status==="online"` 아니면 "DGX 필요").
- protocol 테스트가 이 의미를 못 박음: `failurePolicy==="unavailable_without_dgx"`, `outboxCount===0`(`packages/protocol/src/index.test.ts:501-502`).

### ⚠ 선언 메타 불일치 (narrow drift, 1건)
home_pc seed 메타가 **자기모순**이다(desktop `:68-71`, server `:900-915` 동일):
```text
syncRole:   "cache_client"
localStore: "sqlite"
outboxMode: "offline_cache_outbox"     ← "오프라인 캐시 아웃박스 보유" 함의
failurePolicy: "unavailable_without_dgx"  ← "DGX 없으면 사용 불가" — 위와 모순
```
`offline_cache_outbox`(오프라인에 로컬 큐로 버팀)와 `unavailable_without_dgx`(DGX 없으면 불가)는 **양립 불가**. 실제 wiring(controller `outboxCount:0` 고정 + status=dgxReachable)은 **후자(DGX 의존)** 편. 즉 `outboxMode/localStore` 메타가 home_pc의 실동작을 과대 표기.

## 판정 (operational truth)
| 축 | A1 target | home_pc 실측 | 일치 |
| --- | --- | --- | --- |
| authority(durable) | MacBook(목표) / 현행 DGX | DGX가 author(home_pc는 client push) | ✅ (A0 모델과 정합 — home_pc는 authority 아님이 맞음) |
| origination | 각 client | home_pc도 client UUID push(`/events/sync`) | ✅ |
| offline 지속 | MacBook=continue_locally | home_pc=**unavailable_without_dgx**(DGX 의존) | ⚠ 의도적 차이(home_pc는 offline-first 비대상) |
| 표면 outbox | 드레인 신호 | home_pc outboxCount **항상 0**(독립 outbox 미표면) | ⚠ |
| 선언 메타 정합 | 일관 | `offline_cache_outbox`/`sqlite` ↔ `unavailable_without_dgx` **모순** | ❌ (narrow drift) |

요약: home_pc는 **authority가 아닌 게 맞다**(A1/A0 정합). 문제는 *operational 불일치*가 아니라 **선언 메타 자기모순** 1건 — home_pc를 offline-cache-outbox 클라이언트로 라벨했지만 failurePolicy·실제 wiring은 DGX 의존. MacBook만이 진짜 offline-first(continue_locally) 노드.

## 확인된 gap (코드 패치는 안 함 — 이유)
- 고칠 후보: home_pc seed의 `outboxMode:"offline_cache_outbox"`(+`localStore:"sqlite"`)를 실동작에 맞춰 정정(예: `outboxMode:"online_only"`류) — **그러나 "올바른 값"은 제품 결정**이다. home_pc가 *장차 offline-first가 될 것인지*(그럼 failurePolicy·wiring을 고쳐야) vs *online 전용으로 굳힐 것인지*(그럼 메타를 고쳐야)는 overseer 제품 판단.
- 게다가 이 메타는 protocol 테스트(`index.test.ts:501-502`)·seed·UI가 함께 물려 있어, 한쪽만 바꾸면 회귀. 기계적 fix가 아니라 **방향 결정 후 정합 변경**이라야 안전.
- 따라서 **이번에도 코드 패치 없음.** drift를 endpoint 증거로 고정만 한다(A5와 동일 원칙: 증거 고정, 방향성 결정은 overseer).

## A5/A0 ledger 보정 (확정)
- A5는 phone 축만 봤다. A12가 **home_pc 축을 보완**: home_pc는 phone과 달리 authority 미주장이 *옳고*(A1 정합), 불일치는 operational이 아니라 **선언 메타 모순**이라는 다른 종류의 gap.
- A0 매트릭스의 "Home/Home PC 입력" 행은 A12에서 "operational=DGX 경유 client push(정합), 단 seed 메타가 offline 능력을 과대표기(narrow drift)"로 정밀화.

## non-goal (이번 A12)
```text
no home_pc seed/메타 변경 (방향=overseer 제품 결정) · no protocol/schema 변경
no authority flip · no EventStorage/approval route 동작 변경
no WorkItem · no native shell · no home_pc 앱 신설
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A13 후보: Phase 1 어댑터 PR 묶음 순서/shadow rollout 플래그 시퀀스 설계, 또는 seed 메타 정합(home_pc outboxMode) — 단 overseer가 home_pc 방향(offline-first 여부) 결정한 뒤.
- Phase 1+ 코드: overseer 승인 후.

## 검증
- inspect-first: `apps/desktop/src/seeds/runtime.ts:63-74`(home_pc seed 메타), `apps/server/src/index.ts:907-918`(서버 seed 동일), `apps/desktop/src/hooks/useDgxEventSyncController.ts:143-150`(home_pc outboxCount:0+status=dgxReachable), `apps/desktop/src/components/RuntimeRailPanel.tsx:99-101`(UI "DGX 필요"), `packages/protocol/src/index.test.ts:501-502`(failurePolicy/outboxCount 못박음), `apps/server/src/index.test.ts:1626,1658-1674`(home_pc /events/sync push). 앱 디렉터리 3개(desktop/mobile/server)로 home_pc 앱 부재 확인.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
home_pc is correctly not an authority node, but there is no home_pc app in this repo, and its seed metadata mislabels it as an offline-cache-outbox/sqlite client while its failurePolicy and wiring make it DGX-dependent. 이것은 home_pc가 잘못 설계됐다는 주장이 아니다 — authority 미주장은 A1과 정합이고, 유일한 gap은 seed 메타의 offline 능력 과대표기(narrow drift)이며, 올바른 값은 제품 방향 결정이라 overseer 전엔 고치지 않는다(증거만 고정).
```text
A12 home_pc operational truth audit done (docs only). not an authority (aligned); seed meta over-labels offline capability (drift, overseer-gated). STOP.
```
