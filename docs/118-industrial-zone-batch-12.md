# Batch 12 (구현 핸드오프) — Command Palette E2E + User Saved Views

> **상태**: 구현 완료 · PR #586 #587 #588 #589 · 선행 Batch 11 docs/117
> **목표**: 내가 저장한 인박스 책상 배치를 ⌘K로 불러오기. 모두 local view 제어, OS 액션 0.

## 한 줄 요약
팔레트 명령을 순수 빌더로 추출(검증 가능)하고, 현재 뷰를 **사용자 정의 Saved View**(로컬)로 저장/적용/삭제하며, 그 저장 뷰를 **Command Palette에서 apply**할 수 있게 했다. 저장/삭제/적용은 local preference action일 뿐 OS 액션이 아니다.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #586 | A | 인박스 팔레트 명령을 순수 `buildInboxPaletteCommands`로 추출(단위 검증) |
| #587 | B/C | 사용자 정의 Saved Views 모델 + 매니저 UI(persistFilters 게이트) |
| #588 | D | 저장 뷰 → Command Palette apply(`applyView` command-bus) + PR2 리뷰 백필 |
| #589 | E | 본 핸드오프(docs/118) + 체크리스트 |

## 상호작용 철학 (정교화)
```text
Allowed — local preference actions:
  save view locally · delete saved view locally · apply view locally
Forbidden — OS actions:
  send · approve · write memory · append event · run tool · apply patch · dispatch · external call · server append
```
- 저장/삭제/적용 컨트롤은 `data-action-scope="local-preference"`로 표식(테스트가 모든 버튼이 local-preference임을 단언).
- "button 0"이 아니라 **"no side-effect action control"**. Saved View Manager는 `persistFilters` on일 때만 렌더 → 기본 read-only 인박스(버튼 0)는 그대로.

## LINE 요약
- **A** `buildInboxPaletteCommands(handlers, userViews?)` 순수 빌더 → run()은 주입된 view 핸들러만 호출(nav + view-only dispatch). Batch 11의 "App 배선 미검증" 갭 해소.
- **B** `userSavedViews` 모델: 로컬 뷰 상태(mode/focus/category/search) 명명 스냅샷, localStorage만, 결정론 slug id(upsert by name), `schemaVersion:1`, 무효 항목 무시. `applyUserSavedInboxView(view): InboxCommand` 헬퍼(App/팔레트 재사용).
- **C** Saved View Manager(저장 input+버튼 / 적용·삭제 버튼) — `persistFilters` on일 때만. 모두 local preference, "로컬 전용" 표시.
- **D** 저장 뷰가 팔레트 명령으로 등장 → run() 시 `applyView` InboxCommand 발행. **팔레트는 apply만**(저장/삭제는 매니저에만). 컨테이너가 mode, 인박스가 focus/category/search를 atomically 적용. **반복 명령은 nonce 증가 새 객체로 매번 재적용.**
- **E** 본 문서 + 체크리스트.

## 검증
- 신규 테스트(A +3, B +4(모델)+ import 순수성, C +6(매니저), D +3(applyView/팔레트/회귀)) — **전체 desktop 스위트 2025 green** · root typecheck·build·secret green(4 PR CI).
- 모델/빌더 순수성: server/EventStorage/runner/approval import 0(정적 단언). 팔레트 라벨에 send/write/run/apply/dispatch/approve 없음.
- **정직 한계**: 팔레트→인박스 전 경로는 단위/통합 테스트로 검증(빌더 dispatch, command-bus apply, 반복 nonce). 실제 ⌘K 팔레트 UI 클릭 실측은 headless 제약으로 추후 오너 프리뷰.

## 안전 불변식 (0 유지)
```text
ERP/GIO import 0 · fake live 0 · external send 0 · server append/write 0 · EventStorage write 0
runtime load 0 · DB migration 0 · hidden job 0 · approval/send/run/apply/dispatch control 0
preview→live 누수 0 · replay mutation 0
Saved Views(저장/삭제/적용) = local UI preference(localStorage)만
```

## Batch 12 regression 체크리스트
- Saved View Manager는 `persistFilters=true`일 때만 렌더(기본 인박스 버튼 0 유지)
- save/apply/delete 컨트롤은 `data-action-scope="local-preference"` 표식
- Command Palette 저장-뷰 명령은 **local view만 적용**(apply 전용, save/delete 없음)
- 저장 뷰 적용: mode/focus/category/search만 변경 · EventStorage write 0 · server call 0
- 무효 저장 뷰 무시 · 빈 목록 → 동적 엔트리 0 · 반복 명령 재적용(nonce)
- preview 뷰 저장/적용이 LIVE에 fixture 누수 0 · 도메인 용어 0

## 미접촉 / 다음 후보
- Command Palette 저장-뷰 e2e 프리뷰 실측(현재 단위/통합).
- 팔레트에서 저장/삭제(현재 의도적으로 매니저 전용).
- **SANDBOX shell**(action-risk, 계속 보류) · 실제 WorkItem source 배선.
