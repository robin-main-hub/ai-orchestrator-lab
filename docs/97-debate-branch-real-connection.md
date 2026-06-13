# 97 — App Builder 토론 분기 실제 연결 + 클릭 통합 테스트 (후속1·2)

docs/96에서 토론 분기는 "편집 초안이 토론으로 안 흘러가는 척하지 않는다"는 **정직한 임시 상태**
였다(인자 없는 핸드오프). 이번에 그걸 **진짜로** 연결한다 — 검토 패널에서 편집한 초안이 토론
런타임에 실제로 실려 캐릭터 팀이 검토·반박·개선한다. 그리고 진입 UX를 클릭 수준으로 테스트한다.

```
검토 패널(편집) → "토론으로 보내기"
  → onHandoffToDebate(편집 blueprint)                         [AppBuildContainer]
  → onPromoteToDebate({ blueprintContext, sourceSessionId })  [ConversationWorkbench]
  → handlePromoteToDebate(seed)                               [App.tsx]
  → createStage3DebateSession / runStage3DebateSession
       · deriveDebateProblem → "이 초안을 검토·반박·개선하라"
       · blueprintDebateConstraints → 화면/수용기준이 DebateContext.constraints로 (에이전트 프롬프트)
       · sourceSessionId → session + debate.context.promoted 이벤트(trace)
```

## 후속1 — 토론 분기 실제 연결

- **stage3Runtime.ts**: `Stage3DebateInput` += `blueprintContext?`/`sourceSessionId?`,
  `Stage3DebateSession` += `sourceSessionId?`/`blueprintTitle?`. 순수 헬퍼:
  - `deriveDebateProblem({messages, blueprintContext})` — 초안 있으면 "[앱 초안 검토·반박·개선]
    제목·의도·화면·수용기준 + '그대로 받지 말고 검토·반박·개선하라'" (2000자 클립). 없으면 기존
    대화 마지막 발화(**conversation-only 회귀 없음**).
  - `blueprintDebateConstraints(blueprintContext?)` — 화면/수용기준을 constraints 배열로(최대 32),
    엔진 프롬프트(DebateContext.constraints)까지 실제 전달. 초안 없으면 `[]`.
  - `createStage3DebateSession`/`runStage3DebateSession` 둘 다 헬퍼 사용(중복 제거), session에
    `sourceSessionId`/`blueprintTitle` 적재, contextPreview 맨 앞에 "앱 초안: …".
- **App.tsx** `handlePromoteToDebate(seed?)`: 검토 패널에서 온 `blueprintContext`/`sourceSessionId`를
  input에 실어 토론을 돌린다. `"blueprintContext" in seed` 가드라 명령 팔레트/버튼(MouseEvent)
  으로 인자 없이 불려도 안전. `debate.context.promoted` 이벤트에 `sourceSessionId`/`fromBlueprint`/
  `blueprintTitle` 적재(provenance가 trace에).
- **ConversationWorkbench/index.tsx**: `onPromoteToDebate` 타입을 `(seed?) => void`로 넓히고,
  AppBuildContainer 핸드오프가 `{ blueprintContext: blueprint, sourceSessionId: activeSessionId }`
  를 싣는다. **AppBuildContainer** `onHandoffToDebate`는 다시 `(blueprint) => void`(이번엔 정직 —
  데이터가 진짜 흐른다), 카피도 "편집한 이 초안을 캐릭터 팀이 검토·반박·개선합니다"로.
- **appBuildModel.ts** `appBuildSubmitPlan` debate variant가 `{kind:"debate", blueprint, sourceSessionId}`
  를 싣는다(이전엔 안 실음).

## 후속2 — 클릭 수준 통합 테스트

레포는 기본 SSR-only(renderToStaticMarkup). 클릭/Portal/state wiring을 잡으려면 실제 DOM이 필요해
**파일-스코프 `@vitest-environment jsdom`** + `@testing-library/react`(devDep)로 `AppBuildContainer`
상호작용을 검증한다(다른 1100+ SSR 테스트 무영향 — 환경은 파일 단위).
검증: AI 성공→"AI 초안·planned" 배지 / AI degraded→"AI 실패" 경고+사유 / 모델 없으면 AI 버튼
비활성 / title 편집→createMission이 편집값+sourceSessionId로 호출 / debate(≥2화면)→편집 초안을
핸드오프+닫기, 미션 생성 안 함 / planned·observed 정직 문구.

## 정직성 (테스트로 못박음)

- 초안/토론 입력은 planned — observed 위장 없음(deriveDebateProblem은 문자열만 만든다).
- conversation-only 토론은 기존과 동일(회귀 테스트로 확인).
- 토론 모드 선택만으로 엔진 발사 없음 — 명시적 "토론으로 보내기"가 시작.
- 편집 초안이 토론으로 **실제** 전달(척 아님) — provenance(sourceSessionId)가 이벤트·trace까지.

## 적대적 리뷰 반영

4-차원(honesty·회귀·자동발사 / prompt-safety / provenance·types / test-infra) 병렬 리뷰 +
각 발견 재검증. provenance 스레드·회귀·자동발사·jsdom 격리엔 위반 0. 확인된 3건 수정:
- **(med) constraint 무한 증식** — 토론 핸드오프는 zod 검증을 안 거치고 엔진도 constraint를
  truncate 안 해, 거대/악성 초안이 매 라운드 프롬프트를 부풀릴 수 있었다. → `blueprintDebateConstraints`
  항목당 300자 캡 + `deriveDebateProblem` 화면 줄 200자 캡(테스트로 못박음).
- **(low) AI degrade 시 편집 손실** — degraded 응답이 서버 stub로 사용자의 편집을 덮어썼다. →
  **degraded면 편집 보존**(성공일 때만 필드 교체) — "초안 유지" 카피와 실제 동작 일치, 테스트로 확인.
- **(low) 토글 자동발사 미검증** — 모드 토글 선택만으로 아무 것도 안 부른다는 NO-AUTO-FIRE 테스트 추가.

## 검증

protocol 111 · server 279 · desktop 1175(+12) · typecheck 그린 · smoke 28/28. docs/97.
