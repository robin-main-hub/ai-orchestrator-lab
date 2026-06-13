# 96 — Conversation → App Builder 진입 플로우 (3순위, A+B)

대화를 앱으로 만드는 진입선. 컴포저 "+" 메뉴에 **앱 빌드**를 더해, 지금 대화를 구조화된
DesignBlueprint 초안으로 바꾸고 **검토 패널**에서 다듬은 뒤 미션으로 승격한다.

선택은 **A+B**: 결정적 stub(LLM 0회)이 토대이자 안전망, 그 위에 단발 LLM "AI로 초안 채우기"가
얹힌다. AI가 실패/타임아웃/빈응답/무효 JSON이면 그대로 stub으로 degrade한다(같은 자리). 검토
패널이 항상 먼저라 — AI가 그린 초안도 사람이 보고 고친 뒤에만 미션이 된다. 이 사람-검토 게이트가
B의 유일한 정직성 리스크(관측 안 한 화면을 진실처럼 그림)를 무력화한다.

```
컴포저 "+" → 앱 빌드
  → buildBlueprintInputFromConversation (결정적 stub, 즉시)        [protocol, LLM 0]
  → 검토 패널 (제목/의도/화면 편집 · 단순↔토론 토글 · 출처 세션)   [desktop overlay]
       └ "AI로 초안 채우기" → POST /missions/blueprint-draft        [server, LLM 1콜]
            → 성공: source:"ai"     · 실패: source:"stub", degraded:true (200, 5xx 아님)
  → "미션 만들기"
       단순 → POST /missions/from-blueprint (+sourceSessionId)      → trace에 출처 노출
       큰 변경 → 토론으로 핸드오프 (토론 LLM 자동발사 안 함)
```

## 한 일

- **protocol** `conversationBlueprint.ts` (신규, 순환안전 — zod+designBlueprint만 import):
  `buildBlueprintInputFromConversation`(결정적 1화면 초안, 마지막에 schema.parse로 유효성 보증),
  `conversationBlueprintDraftRequest/ResponseSchema`(useAi opt-in, source/degraded/note 정직 필드).
- **protocol** provenance: `buildMissionCreateFromBlueprint` opts에 `sourceSessionId` 추가 →
  `MissionCreateRequest.sourceSessionId`. `missionFromBlueprintRequestSchema`에 `sourceSessionId`.
  `createdTraceEvent`가 summary에 `· 출처 세션/토론/패킷`을 정직하게 덧붙임(이전엔 record엔
  있어도 trace엔 안 보였다 — 관측 가능해짐). id/type 불변(스냅샷/스트림 양쪽 동일).
- **server** `POST /missions/blueprint-draft`(missions.ts): 항상 결정적 stub 먼저, useAi+provider/
  model+보강기 있으면 단발 LLM 보강 시도. 실패는 **200+stub+degraded:true**(패널은 늘 쓸 수 있는
  초안). `enrichBlueprintWithAi` DI(index.ts: createDgxProviderCompletionResponse + extractJsonObject
  + designBlueprintInputSchema.safeParse, 어떤 실패든 null→stub). provider/model은 **요청에서**
  받음(인프라 하드코딩 안 함). from-blueprint 라우트에 `sourceSessionId` 전달.
- **desktop** `appBuildModel.ts`(순수): mode 기본값(shouldDebateBeforeMission), 요청 빌더,
  `draftSourceBadge`(stub/ai/degraded 정직 배지). `AppBuildContainer.tsx`(검토 오버레이): 편집·
  토글·AI 버튼(모델 없으면 비활성)·출처 세션·"planned, observed 아님" 명시·단순=from-blueprint/
  큰변경=토론 핸드오프. `Composer.tsx` "+" 두 번째 항목 + 게이트. `ConversationWorkbench`가
  오버레이 소유(새 nav·새 fetch·새 store 없음). `stage47` `createDgxBlueprintDraft` 클라이언트.

## 정직성 (테스트로 못박음)

- 초안은 stub이든 AI든 **planned/draft** — 절대 observed 아님(배지로 명시). 검증/preview 통과
  후에야 observed(미션 보드).
- AI 실패 = 200 + source:"stub" + degraded:true + note (조용한 실패 금지, 5xx로 숨기지 않음).
- AI 경로는 **정확히 1콜**(스웜 자동발사 아님). provider/model 없으면 시도조차 안 함.
- 큰 변경(토론)은 패널이 토론 LLM을 쏘지 않고 **핸드오프만** 한다. 토론 엔진은 대화에서 문제를
  재도출하므로, 패널은 편집한 초안이 토론으로 흘러가는 **척하지 않는다**(정직 카피 + 인자 없는
  핸드오프). 화면 편집은 단순 경로 전용임을 패널에 명시.
- provider/model은 사용자 선택값 — 인프라 하드코딩 0(공개 저장소 안전).

## 적대적 리뷰 반영

4-차원(정직성/보안·인프라/타입·순환/커버리지) 병렬 리뷰 + 각 발견을 회의적으로 재검증.
핵심 흐름엔 honesty/infra/cycle/type 위반 0. 토론 핸드오프 분기에서 확인된 3건만 수정:
- **(med/low) 토론 핸드오프가 편집 초안을 말없이 버림** — `() => onPromoteToDebate()` 래퍼가
  blueprint 인자를 떨궈 편집·provenance가 사라지는데 편집 UI는 흘러가는 척했다. → 핸드오프를
  **인자 없는** 시그니처로 바꾸고(척 제거), 정직 카피 추가, 라우팅을 순수 함수로 분리.
- **(low) 인라인 라우팅 미검증** — `appBuildSubmitPlan(mode,blueprint,sourceSessionId)`(판별
  유니온)로 추출해 단순=from-blueprint(provenance)/큰변경=토론을 단위 테스트로 못박음.

## 검증

protocol 111(+8) · server 279(+6) · desktop 1163(+12) · typecheck 그린 ·
generic app-build smoke **28/28 PASS** (blueprint-draft stub → from-blueprint provenance →
trace가 출처 세션 노출). docs/96.
