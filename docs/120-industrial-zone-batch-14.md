# Batch 14 (구현 핸드오프) — Generic Plugin Source Framework (+ visible slice)

> **상태**: 구현 완료 · PR #593 #594 #595 · 선행 Batch 13 docs/119 · SANDBOX 계속 보류
> **목표**: 외부/도메인 앱이 OS core를 오염시키지 않고 generic plugin provider 계약으로 OS에 결과를 먹일 수 있게 한다. 그리고 그 plugin source가 Assistant Inbox에 **실제로 보이게** 한다(타입만 생기는 게 아니라).

## 한 줄 요약
plugin은 OS의 generic interface(manifest / WorkItemLite provider / evidence provider)에만 의존하고, OS core는 plugin/도메인 개념에 0 의존. PREVIEW 좌석에 generic example plugin source가 **눈에 보이는 카드**로 뜨고, LIVE는 실제 입력이 없으면 honest empty. 실행/동적 import/원격 로딩은 전부 0 — plugin은 "외부 결과 객체 → OS projection → 표시"로만 취급.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #593 | A | Generic plugin **manifest** 프로토콜 (`pluginManifest.ts`) — 선언만, 실행 0 |
| #594 | B/C | plugin **WorkItemLite provider** + **evidence provider** 계약 (`pluginWorkItemSource.ts` / `pluginEvidenceSource.ts`) |
| #595 | D/E | **visible slice** — Assistant Inbox에 Plugin Sources 카드 + plugin 행 + plugin evidence 실제 표시 (`examplePluginSource.ts`, `PluginSourcesCard`, container 배선, 테스트) |

## LINE 요약
- **A (manifest)** — `PluginManifest` / `PluginCapability` / `PluginSourceKind` / `PluginSourceHealth` / `PluginProviderStatus` + `validatePluginManifest` / `canProvidePluginLive` / `pluginHasCapability` / `PLUGIN_CAPABILITIES`. 순수 선언/검증만. 실행·import·네트워크 0. generic only(도메인 용어 0, 주석에도 0).
- **B (WorkItemLite provider)** — `PluginWorkItemLiteRow`(= WorkItemLite + pluginId + sourceRef), `WorkItemLiteProviderResult`, `projectPluginWorkItems(results)`. **active provider만** 기여(disabled/error → 0행), pluginId/sourceRef 없는 행 skip, unknown 필드는 safe default로 degrade(crash 0), `observed`는 plugin이 단언할 때만 true(정직). WorkItem 생성/EventStorage append/DB·server write/액션 0.
- **C (evidence provider)** — `PluginEvidence`, `PluginEvidenceCandidate`, `projectPluginEvidenceCandidates(items)`. approved/published만 → `suggested`(observed:false) 후보로. draft/undefined는 후보 아님. trust는 절대 trusted/active로 승격 안 함(untrusted는 limited로 clamp). 메모리 자동 기록 0.
- **D (example source + 표시)** — `EXAMPLE_PLUGIN_SOURCES`(example-plugin connected 2행 · external-source stale 1행 · disabled-plugin disabled) + `EXAMPLE_PLUGIN_EVIDENCE`(approved 1 · draft 1). generic 이름만, 정적 데이터만. `PluginSourcesCard`가 source health 행 + projected plugin 행(`[plugin]` 배지 + category + sourceRef) + plugin evidence 후보(trust)까지 **표시 전용**으로 렌더. 버튼 0, 둘 다 비면 null.
- **E (배선 + 테스트)** — container가 좌석별로 분리: PREVIEW → example fixture(명시적 예시, live 아님), LIVE → 실제 `live.pluginSources/pluginEvidence`만(없으면 섹션 자체가 안 뜸 = honest empty), REPLAY/SANDBOX → 없음. 8개 테스트로 표시/행/evidence/비활성 처리/draft 미승격/표시전용/도메인 용어 0/PREVIEW→LIVE 누수 0 단언.

## 핵심 설계 결정
- **OS core 무오염**: OS core(projection/inbox)는 plugin **generic interface에만** 의존. 도메인 plugin이 OS generic interface에 의존하는 방향이지, 반대가 아님. 그래서 Batch 15(example-domain-plugin), Batch 16(EXAMPLE_DOMAIN ERP plugin)은 OS 코드 변경 없이 example/플러그인 쪽에서만 붙는다.
- **벽돌 아니라 방**: 사용자 지적("타입이 생겼다"는 성공 기준 아님)을 반영해 PR2를 protocol brick으로 더 쌓는 대신 **세로로 보이는 슬라이스**(#595)로 만들었다 — 인박스에 실제로 보이는 Plugin Sources 카드.
- **가시성 vs 정직**: PREVIEW에서만 example가 보이고(분명히 예시), LIVE는 진짜 입력이 없으면 아무것도 안 보인다. fixture가 live 좌석으로 새지 않는다.

## 검증
- 신규/변경 테스트: A(manifest 단위), B/C(`pluginProviders.test.ts`), D/E(`AssistantInboxPluginSource.test.tsx` +8). 인박스+projection+plugins 스위트 로컬 **155 green** · root typecheck clean · build green · CI(build+test / secret scan) green.
- **정직 한계**: 표시 검증은 jsdom + Testing-Library DOM 단언(`plugin-sources` 카드/행/evidence가 실제로 렌더됨)으로 잠갔다. 실제 브라우저에서 PREVIEW 좌석의 Plugin Sources 카드 육안 확인은 헤드리스 제약으로 오너 체크리스트(아래 §14)로 남긴다.

## 안전 불변식 (0 유지)
```text
OS core → plugin/도메인 의존 0 (generic interface만) · plugin runtime 실행 0
dynamic import 0 · remote plugin loading 0 · plugin sync 버튼 0
ERP/domain/도메인 용어 0 (주석 포함) · fake live 0 · external send 0
server append/write 0 · EventStorage write 0 · runtime load 0 · DB migration 0
hidden job 0 · side-effect OS action 0 · preview→live 누수 0 · replay mutation 0
plugin evidence는 suggested(observed:false)만 · trusted/active 자동승격 0 · 메모리 자동기록 0
SANDBOX 실행 0
```

## Batch 14 regression 체크리스트
- PREVIEW 좌석에 Plugin Sources 카드가 보임 · source health(status/health) · plugin 행(`[plugin]`+category+sourceRef) · plugin evidence(trust)
- disabled provider는 표시되나 행 0 기여(실행 0) · active+stale은 행이 보임(health≠게이트)
- approved/published evidence만 후보 · draft 미승격 · trust trusted/active 0
- LIVE: 실제 plugin 입력 없으면 섹션 자체가 안 뜸(honest empty) · example fixture가 LIVE로 누수 0
- 표시 전용(버튼 0) · 도메인 용어 0 · plugin 실행/import/원격로딩 0

## 미접촉 / 다음 후보
- 실제 브라우저에서 PREVIEW Plugin Sources 카드 육안 확인(오너 프리뷰).
- **Batch 15 후보**: example-domain-plugin 예제 팩(generic interface 위에 도메인 plugin이 어떻게 붙는지 example로만 — OS core 무변경).
- **Batch 16 후보**: EXAMPLE_DOMAIN ERP plugin(여전히 plugin 쪽에서만; OS core 무오염 유지).
- **SANDBOX shell은 plugin framework 뒤**(action-risk) — 계속 보류.
