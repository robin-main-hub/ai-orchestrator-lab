# P8 Command Palette / Local-View Action Scope Audit

> **상태**: audit 완료 — docs only (no merge-affecting code gap found)
> **목표**: command palette·키보드 surface가 local-view / local-detail scope를 정직하게 유지하고, read-only로 둘러보는 맥락에 side-effect action이 새어 들어가지 않음을 inspect-first로 확인하고 명문화한다.

## 한 줄 요약
Command and keyboard surfaces now preserve local-view/local-detail scope without side-effect action leakage.

## 무엇이 확인됐나 (inspect-first)
Command/keyboard surface는 세 군데다:

1. **Inbox palette (local-view command surface)** — `apps/desktop/src/lib/inboxPaletteCommands.ts`의 `buildInboxPaletteCommands`.
   - 모든 entry의 `run()`은 **view-only**다: `goInbox()`(이동), `dispatch(kind, value)`(view-state one-shot), `applyView(view)`(로컬 저장 뷰 적용)만 호출.
   - LIVE / PREVIEW / REPLAY / SANDBOX 좌석 전환도 전부 **view-state 변경**일 뿐(`dispatch("mode", ...)`), 실행/전송/적용이 아니다.
   - 파일 주석이 불변식을 명시: *"Every command is VIEW-ONLY — none sends / writes / runs / approves / dispatches a runner."*(`inboxPaletteCommands.ts:10-11`).
   - 단위 테스트가 이를 강제: `inboxPaletteCommands.test.ts`는 각 entry가 올바른 view command만 dispatch하는지 + 라벨에 side-effect 동사(approve/send/dispatch/run tool/apply/write/execute/commit/sync/refresh)가 없는지 검사.

2. **Global palette (app-wide command surface)** — `App.tsx`의 `paletteCommands` 배열(`App.tsx:4294`).
   - 대부분 view-switch(`switch.*`, `open.*`, `orchestrator.invoke`, `help.shortcuts`)로 안전.
   - side-effecting entry는 명시적으로 존재: `memory.remember`(⌘⇧M), `debate.promote`(⌘⇧D), `debate.os`, `approve.next`(⌘⏎), `reject.next`. 각각 side-effect 동사 라벨(기억/토론/Approve/Reject)을 달고 있다.

3. **Global keyboard shortcuts** — `apps/desktop/src/hooks/useGlobalShortcuts.ts`.
   - ⌘1/2/3/4·⌘I·⌘.·Esc·? = view/focus/local-state (안전).
   - ⌘⏎ approve / ⌘⌫ reject / ⌘⇧D promote / ⌘⇧M remember = global palette와 동일한 side-effecting 핸들러.
   - editable-target skip 로직 있음(`isEditableTarget`): unmodified 키는 입력 필드에서 무시, ⌘ 단축키는 항상 발화(설계 의도).

## 확인된 gap
- local-view command surface(inbox palette)에 side-effect가 새는 **코드 gap은 없다.** inbox palette는 증명 가능하게 view-only이고 테스트로 잠겨 있다.
- side-effecting command(approve/reject/promote/remember)는 **global scope**의 명시적 동작이다. 이들은:
  - 실제 global state에만 작용한다(permission queue / 라이브 대화 / memory adapter). preview/replay/sandbox **fixture·replay 데이터에는 작용하지 않는다.**
  - 명시적 side-effect 동사로 라벨링되어 local-view 명령과 시각적으로 구분된다.
  - 안전 no-op 가드가 있다: `handleResolveNextPermission`은 pending 항목이 없으면 early-return(`App.tsx:3654-3657`).
- 진짜 gap은 **문서**였다: command/keyboard scope 분류(local-view view-only vs global side-effecting)와, "왜 global approve/promote를 inbox 좌석으로 게이팅하지 않는가"가 repo 안에 명문화되어 있지 않았다.

## 의도적으로 만들지 않은 것 (중요)
- **global approve/reject/promote/remember에 inbox 좌석(preview/replay/sandbox) 가드를 추가하지 않았다.**
  - **이유**: 승인(approval)과 승격(promotion)은 **global 동작**이다 — 실제 permission queue / 라이브 대화에 작용하며, inbox의 *display 좌석*과 직교(orthogonal)한다. inbox 좌석은 후보(work-item candidate)를 어떻게 보여줄지에 대한 로컬 선택일 뿐, "다음 required permission이 무엇인가"를 바꾸지 않는다.
  - 만약 inbox가 REPLAY/PREVIEW일 때 ⌘⏎를 막으면, 과거 이벤트를 둘러보면서도 실제 대기 중인 승인을 처리하려는 **정당한 운영 흐름을 조용히 깨뜨린다.** 또한 "좌석을 바꾸면 승인이 막힌다"는 **틀린 scope 모델**을 심어 false sense of safety를 만든다.
  - 이는 P5에서 external smoke exit semantics를 speculative하게 바꾸지 않은 것과 같은 원칙이다: side-effecting 경로에 검증되지 않은 동작 변경을 넣지 않는다.
- side-effecting command를 palette에서 제거하지 않았다 — 이들은 의도된 운영 도구이고 명시적으로 라벨링되어 있다.
- `App.tsx`의 `paletteCommands`를 테스트 가능하게 추출하려고 컴포넌트를 broad refactor하지 않았다 — local-view 불변식은 이미 순수 빌더(`buildInboxPaletteCommands`)와 그 테스트로 잠겨 있어, 추가 추출은 위험 대비 이득이 없다.

## command surface scope 분류 (정본)
| Surface | scope | side-effect | 가드 |
| --- | --- | --- | --- |
| **Inbox palette** (`buildInboxPaletteCommands`) | local-view | **없음** (view-only) | 순수 빌더 + banned-words 테스트 + per-command dispatch 테스트 |
| Inbox 좌석 전환 (LIVE/PREVIEW/REPLAY/SANDBOX) | local-view | 없음 (view-state) | `dispatch("mode", ...)`만 |
| Global palette view-switch (`switch.*`/`open.*`/`invoke`) | app nav | 없음 | nav/focus만 |
| Global palette side-effecting (`approve`/`reject`/`promote`/`remember`/`debate.os`) | **global** | 있음 (실제 state) | 명시적 라벨 + 실제 state 필요 + no-op-when-empty |
| Global shortcuts ⌘1-4/⌘I/⌘./Esc/? | app nav/local-state | 없음 | editable-target skip |
| Global shortcuts ⌘⏎/⌘⌫/⌘⇧D/⌘⇧M | **global** | 있음 (실제 state) | editable-target skip + no-op-when-empty |

판단 원칙: ① local-view command surface(inbox palette)는 side-effect 0이어야 한다 → 테스트로 강제됨. ② side-effecting command는 global scope에서만, 실제 state에 대해서만, 명시적 라벨로 노출된다. ③ inbox display 좌석은 global side-effect를 게이팅하지 않는다(직교).

## 안전 불변식
```text
local-view command surface (inbox palette) stays side-effect-free
side-effecting commands act only on real global state, never on fixture/replay data
no speculative seat-gating of global approve/promote (would break real flows)
no real network calls in tests
no EventStorage write / runner dispatch / external send / patch apply added
generic only
```

## 코드 표면
- docs only. command/shortcut/컴포넌트 코드 변경 없음.
  - `docs/154-command-surface-scope-audit.md` (this file)

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| P0 | done | Swarm IO race guard / stale capture hardening. |
| P1 | done | Permission/redaction boundary. |
| P2 | done | Offline outbox / EventStorage sync duplicate guard. |
| P3 | done | SSE / Agent crash error boundary. |
| P4 | done | Provider discovery degradation isolation. |
| P5 | done | CI/smoke/baseline reliability audit (docs). |
| P6 | done | Ops evidence bundle (redacted read-only projection). |
| P7 | done | Runtime health summary: worst-of subsystem roll-up; degraded/unknown/stale honest. |
| P8 | done | Command/keyboard scope audit. Inbox palette provably view-only(tested); side-effecting commands global/explicit/real-state-guarded. No merge-affecting code gap; docs define scope taxonomy + why no seat-gating. |
| P9 | next | Sandbox Proposal / Patch Candidate Safety Audit. |

## 검증
- inspect-first 읽기: `inboxPaletteCommands.ts`(+test), `CommandPalette.tsx`, `useGlobalShortcuts.ts`, `App.tsx`의 `paletteCommands`/`handleResolveNextPermission`, `CheatSheetOverlay.tsx`.
- docs-only PR이므로 빌드 산출물 변화 없음. 기존 테스트(inboxPaletteCommands / AssistantInboxPaletteE2E / ShortcutAndApprovalLabels)는 이 audit의 불변식을 이미 강제하며 동일 main 기준 green.

## 완료 문구 (과장 금지)
Command and keyboard surfaces now preserve local-view/local-detail scope without side-effect action leakage. 이것은 모든 명령 경로가 end-to-end로 안전하다는 주장이 아니다 — local-view command surface(inbox palette)는 증명 가능하게 view-only이고, side-effecting command는 global scope에서 실제 state에 대해서만 명시적으로 노출된다는 사실을 inspect-first로 확인하고, inbox 좌석으로 global 승인을 게이팅하지 않는 이유를 명문화한 것이다.
