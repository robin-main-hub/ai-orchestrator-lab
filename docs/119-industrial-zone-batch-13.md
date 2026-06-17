# Batch 13 (구현 핸드오프) — Command Palette E2E + Real OS WorkItem Source

> **상태**: 구현 완료 · PR #590 #591 #592 · 선행 Batch 12 docs/118 · SANDBOX 계속 보류
> **목표**: Batch 12의 두 약점(실제 ⌘K 실측 갭, 약한 WorkItem source)을 정면 해소.

## 한 줄 요약
팔레트→인박스 전 경로를 통합 테스트로 잠그고(⌘K 갭 해소), 작전극장 레인을 실제 분류된 eventLog 활동에서 끌어오게 했다. 모두 local view 제어, OS 액션 0.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #590 | A | Command Palette ↔ 인박스 E2E 통합 테스트(⌘K 갭 해소) |
| #591 | B/C | 레인이 실제 분류 이벤트에서(Blocked←failure, Runner←runner, Learning←learning, Waiting←approval) |
| #592 | D/E | 팔레트 저장-뷰 카피 명확화 + 본 핸드오프(docs/119) + 체크리스트 |

## LINE 요약
- **A** — (1) 실제 `CommandPalette`를 렌더해 인박스 프리셋 + 사용자 저장 뷰 엔트리가 보이는지 단언, (2) 하니스(빌더 → command-bus → AssistantInboxContainer)로 run() → 인박스 뷰 변화(focus/mode/category/search·저장뷰 atomic·반복 nonce) 단언. Batch 12의 deferred ⌘K 정직 갭을 jsdom 수준까지 잠금. cmdk용 ResizeObserver/scrollIntoView 폴리필. 테스트-only, 소스 변경 0.
- **B/C** — 작전극장 레인이 카드 항목뿐 아니라 **실제 eventLog 활동**을 분류해 반영: Blocked←failure, Runner←runner, Learning←learning, Waiting←approval. 각 이벤트 행은 분류 카테고리 배지 유지. WorkItem-lite는 이미 title/category/status/source/createdAt/observed 보유(Batch 9). 이벤트 없으면 변화 0(정직 empty), LIVE에 fixture 누수 0, generic only.
- **D** — 팔레트 저장-뷰 라벨 `인박스 뷰 적용: <name>` + hint `로컬 저장 뷰 · 부작용 없음`(명확·간결). 저장/삭제는 여전히 매니저 전용.
- **E** — 본 문서 + 체크리스트.

## 검증
- 신규 테스트: A +4(통합), B/C +3(레인 source). 인박스 스위트 그린 · root typecheck·build·secret green(CI).
- **정직 한계(축소)**: 팔레트→인박스 경로를 통합 테스트로 검증(실제 CommandPalette 렌더 + run()→view 변화). 실제 브라우저 ⌘K 입력/선택 실측은 headless 제약으로 오너 체크리스트로 남김(아래).

## 안전 불변식 (0 유지)
```text
ERP/domain import 0 · fake live 0 · external send 0 · server append/write 0 · EventStorage write 0
runtime load 0 · DB migration 0 · hidden job 0 · side-effect OS action 0
preview→live 누수 0 · replay mutation 0 · approval semantics 변경 0
Command Palette = local view 제어만 · Saved Views = local preference만 · SANDBOX 실행 0
```

## Batch 13 regression 체크리스트
- ⌘K에 인박스 프리셋 + 저장 뷰 엔트리가 보임 · 선택 시 mode/focus/category/search 반영
- 저장 뷰 명령 라벨 "인박스 뷰 적용: <name>" · 부작용 없음 표시 · 반복 실행 재적용
- 레인(Today/Recent/Waiting/Blocked/Learning/Runner)이 실제 이벤트 활동 반영 · 이벤트 없으면 honest empty
- WorkItem-lite 행: title/category/source/observed · 가짜 live 0 · LIVE에 fixture 누수 0
- 도메인 용어 0 · EventStorage/server/runner import 0 · side-effect command 0

## 미접촉 / 다음 후보
- 실제 브라우저 ⌘K e2e 실측(오너 프리뷰).
- approval/control queue를 인박스 live source로 read-only 배선(현재 eventLog 분류까지).
- **Batch 14 후보**: Generic Plugin Source(plugin manifest + evidence/workitem provider; 도메인 결합은 generic interface 위 plugin example로만 — OS core 무오염). **SANDBOX shell은 그 뒤**(action-risk).
