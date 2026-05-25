# Manus output — AI Orchestrator Lab 경쟁 도구 UX 레퍼런스 조사

> **출처**: Manus AI, 2026-05-25
> **대상 도구**: Linear, Arc Browser, Cursor, Warp, Notion AI, Raycast, Cline
> **참고 데이터**: `competitive_tool_ux_research.csv` (같은 디렉터리)
>
> 이 문서는 Manus가 작성한 본문을 **원본 그대로** 보존한 archive입니다.
> 우리가 채택/보류/거부한 결정은 `../design-decisions.md`에 정리되어 있습니다.

---

## 1. Executive Summary

현재 AI Orchestrator Lab의 방향은 다크 테마 기반의 command-room, agent roster, debate board, tmux-style multi-pane, human-in-the-loop inbox가 결합된 형태로 보인다. 경쟁 제품을 종합하면, 이 방향은 Linear의 밀도 높은 product-workspace, Arc의 context workspace, Cursor와 Cline의 agentic coding approval loop, Warp의 terminal block/pane model, Raycast의 keyboard-first launcher, Notion AI의 workspace-context agent 개념과 맞닿아 있다. 특히 Linear는 최근 UI 재설계에서 sidebar, tabs, headers, panels를 조정해 시각적 노이즈를 줄이고 navigation density를 높였다고 설명하며, 이는 현재 화면의 우측 Agents/Memento 패널과 하단 Inbox를 정리하는 데 직접적인 참고점이 된다.

가장 중요한 결론은 AI Orchestrator Lab이 단순한 채팅 앱이 아니라 작업 지휘 체계(command system)로 인식되어야 한다는 점이다. Linear는 agent를 팀원처럼 issue에 배정하면서도 인간 assignee가 책임을 유지하도록 설계했고, 변경과 reasoning을 훑어보거나 깊게 검사할 수 있게 한다. Cline도 파일 읽기, 코드 작성, 터미널 명령, 브라우저 사용을 수행하지만 모든 action에 명시적 승인을 요구한다고 설명한다. 이 두 사례는 현재 Lab의 "승인/차단/질문/자동" inbox가 올바른 방향이라는 강한 근거다.

디자인적으로는 지금의 teal-on-dark palette가 제품의 정체성을 잘 만든다. 다만 경쟁 도구에서 공통적으로 발견되는 성공 패턴은 색상은 상태와 권한을 설명하고, 레이아웃은 작업의 소유권과 핸드오프를 설명하며, 단축키는 사용자의 mental model을 설명한다는 것이다. 따라서 현재 UI는 시각적 완성도를 높이는 것보다 먼저, "누가 무엇을 하고 있으며, 다음 승인 지점이 어디인지"를 더 선명하게 드러내는 방향으로 다듬는 것이 좋다.

### 우선순위 권고

| 우선순위 | 핵심 권고 | 이유 | 참고 레퍼런스 |
|---|---|---|---|
| 1 | Agent state vocabulary를 고정한다. 예: active, ready, gated, waiting approval, blocked, watch only. | 여러 에이전트가 동시에 움직일 때 상태어가 UI의 언어가 된다. | Linear Agents, Cursor, Cline |
| 2 | 하단 Inbox를 "handoff queue"로 격상한다. | 승인, 질문, 차단, 자동 처리의 흐름이 orchestration의 핵심이다. | Cline approval, Linear accountability |
| 3 | Command Palette를 최상위 조작 계층으로 둔다. | Arc, Warp, Cursor, Raycast 모두 keyboard-first entry point를 가진다. | Arc, Warp, Cursor, Raycast |
| 4 | Debate와 Tmux를 같은 데이터 모델의 다른 view로 설계한다. | debate는 reasoning timeline이고 tmux는 execution topology다. | Linear views, Warp panes, Arc spaces |
| 5 | 색상은 브랜드보다 상태에 우선 배정한다. | 많은 pane과 agent가 있을수록 accent 남용은 정보 노이즈가 된다. | Linear LCH theme, Warp UI surface |

## 2. 현재 AI Orchestrator Lab 화면에 대한 진단

첨부된 화면은 이미 modern AI 작업 도구의 여러 장점을 자연스럽게 결합하고 있다. 상단에는 Conversation, Debate, Tmux라는 mode tab이 있고, 우측에는 agent inventory와 memory panel이 있으며, 중앙에는 채팅, debate cards, pane grid가 각각 모드별로 표시된다. 하단에는 Assistant Inbox가 존재해 pending task, approval, question, block을 분류한다. 이 구조는 대화 중심 AI 앱이 아니라 작업 운영실에 가깝다.

다만 화면 밀도와 상태 표현 사이에는 아직 개선 여지가 있다. 첫째, 우측 agent list의 model selector, role subtitle, in-use badge가 반복되어 정보량이 많지만, 현재 task와 무관한 agent도 같은 시각적 무게를 갖는다. 둘째, Debate mode의 card grid는 reasoning을 잘 보여주지만, 어떤 card가 최종 결정으로 이어졌는지, 어떤 card가 반박되었는지의 causal link가 더 강해야 한다. 셋째, Tmux mode의 pane cards는 실행 topology를 보여주지만, 실제로 사용자가 개입해야 하는 pane과 watch-only pane의 차이가 더 즉각적으로 보여야 한다.

| 화면 영역 | 현재 장점 | 리스크 | 개선 방향 |
|---|---|---|---|
| Top navigation | Conversation, Debate, Tmux의 mental model이 명확하다. | mode 간 데이터 연속성이 약해 보일 수 있다. | 같은 task를 mode별 다른 projection으로 보여준다는 affordance를 강화한다. |
| Right Agents | 역할, 모델, 사용 상태가 보인다. | 모든 agent가 같은 무게로 보여 우선순위가 흐려진다. | active lane, standby lane, specialist drawer로 정보 밀도를 구분한다. |
| Debate board | agent별 주장과 round가 분리된다. | round 간 causal chain이 약하다. | "claim → critique → decision → patch" 연결선을 추가한다. |
| Tmux grid | multi-pane orchestration에 적합하다. | pane card가 실행 로그인지 작업 슬롯인지 모호할 수 있다. | pane type을 chat, dispatch, monitor, execution, guard 등으로 고정한다. |
| Assistant Inbox | human approval loop가 명확하다. | 하단 보조 UI처럼 보여 중요도가 낮아질 수 있다. | inbox를 handoff queue로 명명하고 command palette와 연결한다. |

## 3. 도구별 UX reference matrix

### 3.1 Visual system, typography, spacing

Linear, Warp, Arc의 공식 자료에서 공통적으로 확인되는 것은 theme system이 단순한 장식이 아니라 작업 공간의 계층 구조를 만드는 장치라는 점이다. Linear는 LCH 기반 theme generation을 사용해 background, foreground, panels, dialogs, modals 같은 elevation을 처리한다고 설명한다. Warp는 기존 terminal theme과 호환되도록 16 ANSI 색상을 foundation으로 삼고, tab indicator와 block selection 같은 accent 영역을 추가하며, command palette와 dialog 같은 overlay를 위한 "UI surface" 스타일을 둔다. Arc는 각 Space가 고유한 pinned/unpinned section, theme, icon을 가진 context unit이라고 설명한다.

| 도구 | 색상 팔레트 관찰 | Typography | Spacing/density 패턴 | AI Orchestrator Lab 적용 |
|---|---|---|---|---|
| Linear | Indigo accent, dark/light theme, LCH 기반 surface/elevation. 공개 관찰 palette는 #5E6AD2, #08090A, #F7F8F8, #8A8F98 계열이 자주 언급된다. | Inter 계열의 정밀한 SaaS UI 인상. | sidebar, tabs, headers, panels를 조정해 visual noise 감소와 navigation density 상승. | 현재 teal palette를 유지하되 surface token을 background/panel/elevated/dialog로 더 엄격히 분리한다. |
| Arc | Space별 theme, icon, sidebar 중심. theme이 context boundary를 만든다. | 브라우저 chrome은 가볍고 콘텐츠가 전면에 온다. | sidebar를 중심으로 tabs, folders, spaces를 정리하며 필요 시 split view를 하나의 tab으로 저장한다. | agent project/workspace별 색상이나 icon을 부여하되, global status color와 충돌하지 않게 한다. |
| Cursor | VS Code/IDE 기반 dark editor, code-first contrast. | UI sans + code monospace. | editor, sidebar, agent/chat panel이 공존하는 split layout. | Debate 내용은 sans, logs/commands/tool calls는 mono로 구분한다. |
| Warp | 16 ANSI colors + accent + UI surface. overlay background를 일관된 surface로 처리. | terminal font 설정과 cursor 표시가 핵심. | block 단위 output, split pane, command palette, settings overlay. | agent 실행 결과를 "block"으로 묶어 입력, 실행, 출력, 승인 상태를 한 카드에서 보인다. |
| Notion AI | light-first document workspace, soft neutral, AI accent는 보조적. | document readability 중심. | page/database/card hierarchy로 긴 문서를 담는다. | 장기 memory와 보고서 결과물은 Notion식 document canvas로 분리한다. |
| Raycast | launcher overlay, custom theme, compact command rows. | 짧은 command/action name 중심. | overlay 한 장에서 search, action, extension, AI를 전환. | ⌘K 또는 global summon UI에서 agent, task, memory, slot을 모두 검색한다. |
| Cline | VS Code side panel 기반, editor theme을 따른다. | coding agent interaction에 맞춘 dense text. | 승인 card, diff, command run, browser action이 sequential feed로 쌓인다. | 위험 action은 pane 안에서 바로 실행하지 말고 approval queue로 승격한다. |

### 추천 token 방향

현재 Lab의 추천 token 방향은 다음과 같다. 실제 구현에서는 Tailwind 또는 CSS variables로 고정해 모든 mode가 같은 언어를 쓰게 만드는 것이 중요하다.

| Token | 추천 값 | 용도 | 비고 |
|---|---|---|---|
| `--bg-app` | `#00191B` | 전체 배경 | 현재 화면의 deep teal/black 정체성 유지 |
| `--surface-1` | `#052629` | 기본 panel/card | 우측 Agents, Debate card |
| `--surface-2` | `#0A3337` | elevated panel | active card, selected pane |
| `--surface-3` | `#103F45` | overlay/command palette | Warp의 UI surface 개념 참조 |
| `--border-muted` | `#174A50` | 기본 경계 | 과도한 cyan line을 줄인다 |
| `--border-active` | `#3BC7D4` | active focus | keyboard focus ring에 우선 사용 |
| `--text-primary` | `#E8F6F5` | 주요 텍스트 | 다크 배경 대비 확보 |
| `--text-secondary` | `#A3BFC0` | 보조 텍스트 | subtitle, timestamps |
| `--text-tertiary` | `#6F9294` | 메타 텍스트 | pane label, hints |
| `--status-success` | `#34D399` | online, approved | green 계열 |
| `--status-warning` | `#FBBF24` | gated, pending | yellow 계열 |
| `--status-danger` | `#F87171` | blocked, risky | red 계열 |
| `--status-agent` | `#7C83FF` | agentic action | Linear/Cursor식 AI accent |

Typography는 UI sans와 mono의 역할 분리가 가장 중요하다. 현재 화면의 한글/영문 혼합 환경에서는 Pretendard Variable 또는 Inter 계열을 UI 기본으로, JetBrains Mono 또는 Berkeley Mono 계열을 command, model id, session id, event id에 사용하는 구성이 적합하다. 추천 scale은 11/12/13/14/16/20px 정도의 compact scale이며, pane card가 많을수록 13px body와 11px meta를 기본으로 잡는 것이 좋다.

| Level | Size/line-height | Weight | 용도 |
|---|---|---|---|
| Display small | 20/28 | 650 | mode title, screen title |
| Section title | 16/24 | 650 | Agents, Memento, Status Hub |
| Card title | 14/22 | 650 | agent name, pane name |
| Body | 13/21 | 450 | message, debate card content |
| Meta | 12/18 | 450 | timestamp, role, provider |
| Micro | 11/16 | 500 | badge, shortcut hint, event id |
| Mono micro | 11/16 | 500 | codex-session, DGX-02, pane-4 |

Spacing은 4px 기반 scale이 가장 적합하다. Linear식 high-density UI와 Warp식 block separation을 결합하려면 큰 여백보다 일관된 rhythm이 중요하다. 추천 scale은 2, 4, 6, 8, 12, 16, 20, 24, 32이며, card 내부 padding은 12 또는 16, pane gap은 12, panel gap은 16, screen margin은 16~20으로 유지하는 것이 좋다.

## 4. Multi-agent / multi-pane UI 패턴 비교

경쟁 도구의 multi-pane 전략은 크게 네 가지로 나뉜다. Linear는 issue, project, list, board, timeline, split, fullscreen 같은 structured layout을 통해 같은 업무 데이터를 여러 view로 보여준다. Arc는 Spaces로 context를 분리하고, Split View를 하나의 sidebar tab으로 저장해 다시 돌아올 수 있게 한다. Warp는 terminal session을 pane과 block으로 쪼개고, keyboard shortcut으로 pane 생성, 이동, 최대화를 제공한다. Cursor와 Cline은 editor 안에 AI agent가 들어와 plan, diff, command, approval의 cycle을 만든다.

| 패턴 | 대표 도구 | 장점 | 단점 | Lab 적용 방식 |
|---|---|---|---|---|
| Context workspace | Arc Spaces, Notion workspace | 업무/프로젝트 경계를 명확히 한다. | space가 많아지면 navigation debt가 생긴다. | 프로젝트별 Lab Space를 두고 agent set, memory, provider를 저장한다. |
| Structured work views | Linear list/board/timeline/split | 같은 작업을 다른 관점에서 볼 수 있다. | view 간 관계가 흐려질 수 있다. | Conversation/Debate/Tmux를 같은 task graph의 3개 view로 설계한다. |
| Execution panes | Warp panes, tmux | 병렬 실행과 관찰에 강하다. | 비전문가는 복잡하게 느낄 수 있다. | pane type과 status badge를 엄격히 고정한다. |
| Agent feed + approval | Cline, Cursor | 안전하고 추적 가능하다. | 승인 피로가 생길 수 있다. | approval threshold를 risk level별로 조정한다. |
| Launcher overlay | Raycast | 어디서든 빠르게 작업을 시작한다. | 긴 작업 monitoring에는 약하다. | command palette는 시작/검색/전환에 집중하고 monitoring은 workspace로 보낸다. |

AI Orchestrator Lab의 핵심 차별점은 Debate와 Tmux가 모두 있다는 점이다. 이를 별개의 화면으로만 두면 사용자는 "토론 결과가 실제 실행으로 어떻게 넘어갔는지"를 추적하기 어렵다. 권장하는 모델은 Debate card를 task graph node로 보고, Tmux pane을 execution node로 보는 방식이다. 예를 들어 Reviewer가 Round 5에서 "같은 모델의 여러 가상 에이전트는 합의가 과장될 수 있다"고 반박하면, 해당 card는 QA & Security pane의 guardrail task로 handoff되어야 한다. 이 handoff가 화면에서 선명하게 보이면 Lab은 단순히 멋진 UI가 아니라 신뢰 가능한 orchestration tool이 된다.

## 5. Keyboard shortcut 체계

키보드 체계는 이 제품군에서 거의 제품 철학이다. Raycast는 기본 global hotkey가 ⌥ Space이며, 현재 앱 위에 overlay로 뜨기 때문에 사용자가 focus를 유지할 수 있다고 설명한다. Warp는 CMD-P command palette, CMD-D split pane right, SHIFT-CMD-D split pane down, pane navigation과 resize shortcut을 포함한 광범위한 shortcut table을 제공한다. Arc는 Command-T를 tab 생성뿐 아니라 command bar처럼 활용하며, Split View 생성과 Space 전환도 shortcut으로 제공한다. Cursor 문서도 검색 문서 상단에서 ⌘K search docs와 ⌘I Ask AI를 노출하고, Cursor를 AI editor and coding agent로 정의한다.

AI Orchestrator Lab은 command palette를 단순 검색이 아니라 orchestration grammar로 설계하는 것이 좋다. 예를 들어 agent assign, debate start, handoff reviewer, tmux open, approve all low-risk, recall memory 같은 verb-first 명령 체계를 만들면 사용자가 키보드로 복잡한 agent 시스템을 조작할 수 있다.

| Shortcut | 추천 기능 | 레퍼런스 근거 | 설계 의도 |
|---|---|---|---|
| ⌘K | Global Command Palette | Cursor/Raycast/Warp 계열 command-first UX | 모든 기능의 단일 진입점 |
| ⌘I | Ask / Invoke Orchestrator | Cursor Ask AI 패턴 | 현재 context에 대해 AI 호출 |
| ⌘1/2/3 | Conversation/Debate/Tmux 전환 | Arc/Chrome style tab navigation | mode switching의 muscle memory 형성 |
| ⌘⇧D | Debate 생성 또는 pane split down | Warp split pane shortcut | 실행/토론 공간 빠른 확장 |
| ⌘⇧A | Approval queue 열기 | Cline/Linear approval loop | human-in-the-loop를 숨기지 않음 |
| ⌘⇧M | Memory/Memento 열기 | Notion knowledge workspace | 장기 context 접근 |
| ⌘. | Stop / interrupt active agent | terminal/editor convention | runaway agent 즉시 중단 |
| ⌘Enter | selected draft 승인/전송 | chat/editor convention | 빠른 handoff |
| Esc | overlay 닫기 또는 focus reset | universal convention | modal fatigue 감소 |
| ? | Shortcut help | Linear shortcut help 패턴 | 학습 가능성 강화 |

단축키 도움말은 별도 문서가 아니라 UI 안에서 contextual cheat sheet로 제공하는 것이 좋다. Debate mode에서는 round 이동, claim accept/reject, handoff shortcut을 보여주고, Tmux mode에서는 pane 이동, maximize, send, read shortcut을 보여주는 방식이다.

## 6. Delegation / handoff UX 사례

AI 작업 도구에서 가장 중요한 UX는 "AI가 할 수 있다"가 아니라 AI가 무엇을 했고, 누가 책임지며, 사용자가 언제 개입해야 하는가이다. Linear Agents는 agent를 workspace member처럼 issue, project, mention thread에 넣을 수 있고, issue가 agent에게 delegated되어도 human user가 primary assignee로 남는다고 설명한다. Cline은 agent가 editor와 terminal에서 파일을 읽고 쓰고 명령을 실행하며 브라우저도 사용할 수 있지만, 모든 action에 명시적 승인을 요구한다고 설명한다. Notion AI는 Notion, connected apps, web의 context를 사용해 complex multi-step tasks를 수행하는 Notion Agent와 반복 업무를 자동화하는 Custom Agents를 소개한다.

| Handoff stage | 좋은 UX 사례 | Lab에서의 구현 제안 |
|---|---|---|
| Intent capture | Raycast처럼 overlay에서 즉시 명령 입력 | ⌘K → "debate this with reviewer and architect" |
| Agent selection | Linear처럼 agent를 팀원/기여자로 배정 | Orchestrator가 primary owner, specialist가 contributor |
| Permission boundary | Cline처럼 위험 action은 명시 승인 | 파일 수정, 외부 전송, 비용 발생, shell 실행은 approval queue |
| Progress visibility | Cursor/Warp처럼 진행 상태와 실행 단위 노출 | planned → running → waiting approval → done timeline |
| Review surface | diff, summary, reasoning inspect | "요약 보기 / reasoning 보기 / raw log 보기" 3단계 |
| Apply / rollback | PR, patch, archive, reject | 승인 후 patch 생성, reject 시 이유를 memory에 기록 |
| Accountability | Linear처럼 human remains accountable | 모든 task에는 human owner와 agent contributors 표시 |

현재 화면의 "Human Peek"와 "Assistant Inbox"는 매우 좋은 출발점이다. 다만 용어를 더 제품화할 필요가 있다. Human Peek는 관찰 패널에 가까우므로 Handoff Trace 또는 Agent Relay가 더 명확할 수 있다. Assistant Inbox는 단순 inbox가 아니라 Control Queue 또는 Handoff Queue로 명명하면 이 제품의 핵심 기능으로 보인다.

## 7. 도구별 구체 시사점

### Linear

Linear에서 가져올 핵심은 밀도 높은 정보 구조와 책임 모델이다. Linear는 visual noise를 줄이고 alignment와 navigation density를 높이는 방향으로 UI를 재설계했으며, Agents에서는 agent에게 issue를 위임하되 human user가 primary assignee로 남는 accountability 모델을 제시한다. Lab의 우측 agent list는 Linear처럼 "누가 소유자이고 누가 contributor인가"를 명확히 보여줘야 한다.

| 적용 요소 | 구체 설계 |
|---|---|
| Issue-like task object | 모든 대화, debate, tmux 실행을 하나의 task id에 묶는다. |
| Primary owner | Orchestrator 또는 인간 사용자를 primary로 표시한다. |
| Contributor agents | Architect, Reviewer, Builder 등은 contributor로 표시한다. |
| Inspect reasoning | 요약만 보이다가 필요 시 reasoning/log를 펼친다. |
| Dense navigation | sidebar의 badge, model, role을 압축하고 active task 중심으로 재정렬한다. |

### Arc Browser

Arc에서 가져올 핵심은 context switching의 시각적 언어다. Spaces는 서로 다른 browsing context를 분리하고 각 Space가 pinned/unpinned section, theme, icon을 가진다. Split View는 여러 tab을 하나의 window에서 동시에 보고, 생성된 split view 자체가 sidebar의 tab으로 저장되어 돌아올 수 있다. Lab에서는 project, company 업무, 개인 업무, experiment를 Space 단위로 분리하고, 각 Space에 기본 agent set과 memory scope를 저장하는 방식이 적합하다.

### Cursor

Cursor는 AI editor and coding agent로서 codebase 이해, feature planning/building, bug fixing, review, workflow connection을 제공한다고 설명한다. Lab이 Cursor에서 가져올 점은 자율성의 단계화다. 즉, 자동완성 수준의 low autonomy, targeted edit 수준의 medium autonomy, full agent 수준의 high autonomy가 같은 제품 안에 공존해야 한다. 현재 Lab의 Conversation, Debate, Tmux는 각각 "상담", "검토", "실행"의 자율성 단계로도 재해석할 수 있다.

### Warp

Warp는 terminal을 block과 pane으로 재해석한 사례다. keyboard shortcut 문서에는 pane split, command palette, block navigation, tab switching, pane resize가 체계적으로 정리되어 있다. theme 문서에서는 16 ANSI colors, accent color, UI surface를 통해 terminal text뿐 아니라 전체 UI를 cohesive하게 만들려는 목표를 설명한다. Lab의 Tmux 모드는 Warp처럼 실행 단위를 block으로 저장하고, pane을 관찰 가능한 작업 슬롯으로 만드는 것이 가장 강력하다.

### Notion AI

Notion AI는 "24/7 AI team"이라는 메시지와 함께 Notion Agent가 Notion, connected apps, web context를 사용해 complex multi-step tasks를 수행한다고 설명한다. Lab이 배울 점은 memory와 document surface다. 지금의 Memento 패널은 잘 작지만, 장기적으로는 agent가 만든 결론, 회고, decision record가 document화되어야 한다. Debate final decision은 Notion식 doc으로 export되거나 내부 Decision Log로 저장될 때 업무 도구로서 가치가 커진다.

### Raycast

Raycast는 global hotkey로 현재 앱 위에 overlay를 띄워 focus를 유지하게 하며, 기본 hotkey는 ⌥ Space라고 설명한다. Raycast Pro는 Quick AI, AI Commands, custom themes, clipboard history, window management 등을 하나의 launcher interface로 통합한다. Lab이 가져올 점은 항상 호출 가능한 command layer다. 사용자는 전체 앱으로 이동하지 않아도 "이 문서를 Reviewer에게 넘겨", "최근 memory 불러와", "tmux pane 3 읽어"를 어디서든 실행할 수 있어야 한다.

### Cline

Cline은 editor와 terminal 안에 사는 AI coding agent이며, 파일 읽기/쓰기, terminal command 실행, browser 사용을 할 수 있지만 모든 action은 explicit approval을 요구한다고 설명한다. Lab의 승인 UX는 Cline에서 많은 힌트를 얻을 수 있다. 단, Lab은 coding뿐 아니라 회사 업무 전반을 다루므로 approval category를 더 넓혀야 한다. 예를 들어 외부 메시지 발송, 캘린더 변경, 파일 삭제, 비용 발생, 고객 데이터 접근 등은 모두 명시적 handoff queue로 보내야 한다.

## 8. AI Orchestrator Lab을 위한 최종 디자인 권고안

첫째, agent roster를 "조직도"가 아니라 "현재 작전 상태판"으로 재설계하는 것이 좋다. 모든 agent를 같은 카드로 반복 표시하기보다, active operation에 참여 중인 agent만 상단에 크게 보이고 standby agent는 접힌 drawer로 두는 구조가 더 효율적이다. 현재 in use badge는 좋지만, "왜 사용 중인지"가 보이지 않는다. Frontend Dev — executing pane-5, Reviewer — waiting approval, Architect — proposed plan처럼 현재 task relation을 한 줄로 표시해야 한다.

둘째, Debate mode에는 reasoning provenance를 추가해야 한다. 경쟁 도구들은 task, issue, command, diff, block이 어떤 action의 결과인지 명확히 한다. Debate card에도 source context, claim, evidence, risk, handoff target을 넣으면 card가 단순 발언이 아니라 작업 그래프의 노드가 된다. 특히 최종 결정 card는 어떤 반박을 수용했고 어떤 반박을 기각했는지 표시해야 한다.

셋째, Tmux mode는 pane grid보다 control semantics가 중요하다. 현재 cards는 시각적으로 좋지만, 실제 실행 화면이 아니라 실행 슬롯 상태표처럼 보인다. 각 pane에 input, output, permission, last event, owner, risk를 고정하면 사용자는 어느 pane을 봐야 하는지 바로 안다. Warp의 block model처럼 pane 내부 activity를 시간순 block으로 축적하면, 나중에 전체 실행을 replay하거나 audit할 수 있다.

넷째, approval queue를 제품의 중심으로 끌어올려야 한다. Linear와 Cline의 공통점은 AI가 일을 해도 인간이 책임을 잃지 않게 만든다는 것이다. 현재 하단 Inbox는 매우 중요한데, 화면 하단 보조 요소처럼 느껴질 수 있다. "Assistant Inbox"보다 "Control Queue" 또는 "Handoff Queue"로 명명하고, approve, ask, edit, delegate, block, archive를 keyboard-accessible action으로 제공하는 것이 좋다.

다섯째, AI 자율성 slider를 도입할 만하다. 각 task 또는 agent마다 Suggest only, Draft, Execute with approval, Autopilot low-risk, Autopilot trusted provider 같은 mode를 둘 수 있다. 이는 Cursor의 단계적 agentic experience와 Cline의 explicit approval model 사이에서 균형을 잡는 방식이다.

| Recommendation | UI artifact | 상태/권한 모델 | 기대 효과 |
|---|---|---|---|
| Active operation header | 상단 task title 옆 operation status | owner, phase, risk, pending approvals | 사용자가 현재 작전 상태를 즉시 이해한다. |
| Agent relationship line | agent card subtitle | executing/waiting/reviewing/standby | agent list의 반복 노이즈가 줄어든다. |
| Handoff Queue | 하단 또는 command palette overlay | approve/ask/block/delegate/archive | human-in-the-loop가 명확해진다. |
| Debate provenance | card footer와 연결선 | claim/evidence/risk/decision | 토론이 실제 결정으로 연결된다. |
| Tmux block log | pane 내부 timeline | input/output/tool/approval | 실행 추적과 감사가 쉬워진다. |
| Workspace Space | project-level shell | memory, agents, providers, policies | 개인/회사 업무가 섞이지 않는다. |
| Command grammar | ⌘K palette | verb + object + target | 복잡한 조작이 키보드 중심으로 단순화된다. |

## 9. 우선순위별 실행 로드맵

단기적으로는 디자인 시스템의 큰 개편보다 상태어, 단축키, queue semantics를 먼저 고정하는 것이 좋다. 현재 UI는 이미 충분히 강한 visual direction을 갖고 있으므로, 다음 단계의 성패는 미세한 surface polish보다 orchestration clarity에 달려 있다.

| 기간 | 목표 | 산출물 |
|---|---|---|
| 1주 | 상태 vocabulary 정리 | agent state, task state, approval state enum 정의 |
| 2주 | Command Palette MVP | agent, debate, tmux, memory, approve 명령군 |
| 3주 | Handoff Queue 고도화 | approve/edit/reject/delegate action, risk label |
| 4주 | Debate provenance | card 연결, accepted/rejected claim, decision log |
| 5주 | Tmux block model | pane별 input/output/event/approval block timeline |
| 6주 | Workspace/Space model | 프로젝트별 agent set, memory scope, provider policy |

## 10. References

[1] Linear — How we redesigned the Linear UI
[2] Linear — Artificial teammates. Natural collaboration.
[3] Warp Docs — Keyboard Shortcuts
[4] Warp — How we designed themes for the terminal
[5] Cursor Documentation
[6] Cursor — AI code editor
[7] Notion AI — Meet your 24/7 AI team
[8] Cline Documentation — Overview
[9] Raycast Manual — Hotkey
[10] Raycast Pro
[11] Arc Help Center — Split View
[12] Arc Help Center — Spaces
[13] Arc Help Center — Keyboard Shortcuts
