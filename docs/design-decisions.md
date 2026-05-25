# AI Orchestrator Lab — Design Decisions

> **목적**: v0 design output + Manus 경쟁 도구 UX 리서치를 종합한 **확정 디자인 헌장**.
> 미래의 영역별 마이그레이션 PR은 모두 이 문서의 결정을 따라야 함.
>
> **출처**:
> - v0.app: https://v0.app/chat/ai-orchestrator-lab-jRHRDd067QN
>   (port된 결과: `apps/desktop/src/styles/tokens.css`, `apps/desktop/src/ui/`)
> - Manus 리서치 원본: [`docs/manus/competitive-ux-research-output.md`](manus/competitive-ux-research-output.md)
> - CSV 데이터: [`docs/manus/competitive_tool_ux_research.csv`](manus/competitive_tool_ux_research.csv)
>
> **상태 표기**: ✅ 채택 · 🟡 보류 (조건부) · ❌ 거부 · 📌 추후 결정

---

## 1. Naming — UI 영역 명칭 확정

| 기존 | 신규 (확정) | 출처 | 비고 |
|---|---|---|---|
| Assistant Inbox | ✅ **Control Queue** | Manus | "단순 inbox가 아닌 핵심 기능"으로 격상. ⌘⇧A로 호출 |
| Human Peek | ✅ **Agent Relay** | Manus | 비공개 sub-session 관찰 UI. Trace보다 Relay가 흐름 강조 |
| Assistant Inbox lanes | ✅ approve / ask / edit / delegate / block / archive | Manus | keyboard-accessible action으로 다 매핑 |

(Conversation Workbench / Debate Table / Tmux Swarm / Memento Inspector / Agents Panel 같은 기존 명칭은 그대로 유지.)

## 2. Agent Roster 구조 — "조직도가 아닌 작전 상태판"

### ✅ 채택 — 3-tier layout

| Tier | 영역 | 표시 조건 |
|---|---|---|
| **Active lane** (상단, 큰 카드) | 현재 작전에 참여 중인 agent | `executing` / `waiting_approval` / `reviewing` 상태 |
| **Standby lane** (중간, 압축 카드) | enabled이지만 현재 task 무관 | `ready` 상태 |
| **Specialist drawer** (접힘) | 일반적으로 잘 안 쓰는 전문 persona | 기본 접힘, 사용자가 열어야 보임 |

### Agent state vocabulary (Manus 권고 + 우리 protocol 정렬)

| State | 의미 | UI 표시 |
|---|---|---|
| `active` | 현재 LLM call / tool 실행 중 | cyan pulse dot |
| `ready` | enabled, 호출 가능 | green dot |
| `gated` | enabled이지만 permission 승인 필요 | amber dot |
| `waiting_approval` | 사용자 승인 대기 중 | amber pulse |
| `blocked` | 오류 / 의존성 실패 | red dot |
| `watch_only` | read 전용 (auditor / watchdog 등) | gray dot |
| `standby` | enabled X (또는 specialist drawer 안) | hollow dot |

### Agent card 1줄 표시 (active lane)

```
[채아린]  Companion  ·  delegating → Maomao (researching B2B trend)  ·  ⏱ 12s
```

이름 / role / **현재 무엇을 하고 있는지** / 시간. Standby lane은 이름 + role만.

## 3. Color Tokens — v0 base + Manus 정밀화

### ✅ 채택: v0 기존 token 유지 + Manus 권고 surface 분리 추가

현재 `apps/desktop/src/styles/tokens.css` (v0 base) 는 그대로 두고, surface elevation을 더 엄격히 분리하는 sub-tokens 추가:

| Token (신규) | 값 (v0 기존과 정렬) | 용도 |
|---|---|---|
| `--surface-1` | `var(--card)` = `#0a2428` | 기본 panel/card (우측 Agents, Debate card) |
| `--surface-2` | `var(--accent)` = `#0d3640` | elevated panel (active card, selected pane) |
| `--surface-3` | `#114250` (이미 `--bg-elevated`) | overlay / command palette / modal |
| `--border-active` | `var(--ring)` = `#5fd3e2` | keyboard focus ring (이미 ring과 동일) |
| `--status-agent` | `#7C83FF` (purple-blue) | agentic action 인디케이터 (Linear/Cursor 톤) |

> **거부**: Manus가 제안한 `#00191B / #052629 / #0A3337` 같은 더 어두운 teal hex.
> 이미 v0가 `#04161a / #0a2428 / #0d3640` 으로 잡은 게 같은 의도이고
> 시각 일관성이 더 중요. token **값**은 v0를 따르고, surface 1/2/3 **개념**만 Manus에서 채택.

## 4. Typography — Manus scale 채택

### ✅ 채택: 11/12/13/14/16/20px compact scale

기존 v0 tokens.css의 `--font-sans` / `--font-mono`는 그대로 유지. **Tailwind text class scale을 우리 맞춤으로 정렬:**

| Level | px | line-height | weight | 용도 | Tailwind |
|---|---|---|---|---|---|
| Display small | 20 | 28 | 650 (semibold+) | mode title, screen title | `text-xl font-semibold` |
| Section title | 16 | 24 | 650 | Agents, Memento, Control Queue 헤더 | `text-base font-semibold` |
| Card title | 14 | 22 | 650 | agent name, pane name | `text-sm font-semibold` |
| Body | 13 | 21 | 450 | message, debate card content | `text-[13px] font-normal` |
| Meta | 12 | 18 | 450 | timestamp, role, provider | `text-xs font-normal` |
| Micro | 11 | 16 | 500 | badge, shortcut hint, event id | `text-[11px] font-medium` |
| Mono micro | 11 | 16 | 500 (mono) | session id, model id, pane-N | `text-[11px] font-mono font-medium` |

Tailwind 4 `@theme`에 사용자 size token 추가 예정 (Stage 2 마이그레이션 시).

## 5. Spacing — 4px base scale

### ✅ 채택: 2/4/6/8/12/16/20/24/32

| 위치 | 권고 값 |
|---|---|
| Card 내부 padding | 12 또는 16 |
| Pane gap (TmuxSwarm grid) | 12 |
| Panel gap (top-level zones) | 16 |
| Screen margin | 16~20 |
| 카드 간 vertical gap (list) | 8 |
| Action button group gap | 6 |

이는 Tailwind 기본 spacing scale (`p-2 = 8px`, `p-3 = 12px`, `p-4 = 16px`)과 호환. 추가 token 불필요.

## 6. Keyboard Shortcut 체계

### ✅ 채택: verb-first command grammar + 10개 우선순위 shortcut

| Shortcut | 기능 | 우선순위 |
|---|---|---|
| `⌘K` | Global Command Palette | 핵심 |
| `⌘I` | Ask / Invoke Orchestrator (현재 context로 AI 호출) | 핵심 |
| `⌘1` / `⌘2` / `⌘3` | Conversation / Debate / Tmux 전환 | 핵심 |
| `⌘⇧A` | **Control Queue** 열기 | 핵심 |
| `⌘⇧M` | Memento 열기 | 보조 |
| `⌘⇧D` | Debate 생성 또는 pane split-down | 보조 |
| `⌘.` | Stop / interrupt active agent | 안전 |
| `⌘Enter` | Selected draft 승인/전송 | 빈번 |
| `Esc` | overlay 닫기 / focus reset | 보편 |
| `?` | Shortcut help (contextual cheat sheet) | 학습 |

**Command Palette grammar**: `verb + object + target`. 예시:
- `assign architect → debate`
- `delegate research → Maomao`
- `approve all low-risk`
- `recall memory → "어제 회의 결정"`
- `open tmux pane 3`

## 7. Debate Card Provenance

### ✅ 채택: card footer에 4-element 연결

각 debate utterance card 하단에 작은 메타 footer:

```
claim → evidence → risk → handoff target
─────────────────────────────────────────
"같은 모델 합의는 과장 가능"
  ↳ Reviewer 발화 (Round 3)
  ↳ Evidence: docs/review-board.md #2
  ↳ Risk: false consensus
  ↳ Handoff: QA & Security pane (Round 5)
```

최종 결정 card (round 6 / final_decision)는 어떤 utterance를 수용했고 어떤 걸 기각했는지 명시:

```
ACCEPTED: Architect (R2 #4), Reviewer (R3 #2)
REJECTED: Skeptic (R3 #7) — reason: 운영 가능성 검증됨
DECISION: …
```

이는 protocol의 `debateUtteranceSchema`에 새 optional field 추가 필요:
- `parentUtteranceId?: string` (어떤 발화에 대한 응답인지)
- `acceptedBy?: string[]` (이 발화를 받아들인 후속 발화 ids)
- `rejectedBy?: string[]` (이 발화를 기각한 후속 발화 ids)

📌 **추후 결정 필요**: protocol schema 변경이라 Codex 작업 영역. 별도 PR로 처리.

## 8. AI 자율성 5단계 Slider

### ✅ 채택: agent profile마다 1~5단계 slider

| Level | 이름 | 의미 | 현재 permissionLevel 매핑 |
|---|---|---|---|
| 1 | **Suggest only** | 제안만, 사용자가 직접 모든 적용 | `read_only` |
| 2 | **Draft** | draft 작성, 사용자 review 후 적용 | `read_only` + draft 권한 |
| 3 | **Execute with approval** | 매 action마다 사용자 승인 | `write_files` + approval gate ON |
| 4 | **Autopilot — low-risk** | 저위험 (read / search / format)은 자동, 위험은 승인 | `write_files` + auto-approve low-risk |
| 5 | **Autopilot — trusted provider** | 신뢰 provider (DGX local)에서만 full autonomy | `run_safe_commands` + trust-bound |

채아린(companion)은 **Level 3**이 기본. Maomao(researcher) read-only 작업은 **Level 4** 가능. Executor 같은 위험 role은 항상 Level 3 이하.

> **보류 (🟡)**: protocol의 `permissionLevel` enum과의 매핑 정확도. 현재 enum은 7개 단계 (read_only / write_files / run_safe_commands / run_dangerous_commands / network_access / remote_workspace / secret_access)인데, autonomy slider는 다른 축. **두 축 독립 운영**이 맞을 수도. Stage 2에서 구체 결정.

## 9. 채택하지 않은 권고

### ❌ 거부

- **Manus token hex값 (`#00191B` 등)** — v0 hex 대신 사용. v0가 이미 충분히 어두운 teal로 잡았고, 일관성이 hex 정밀도보다 중요.
- **Linear의 indigo `#5E6AD2` 도입** — 우리 cyan accent와 충돌.

### 🟡 보류 (조건부 / 추후 결정)

- **Workspace / Space 모델** (project별 agent set / memory / provider 분리) — 가치는 명확하지만 큰 protocol 변경. v1 시점에선 multi-session으로 우회 가능. 사용자 활용 패턴 본 후 결정.
- **자율성 5단계와 protocol permissionLevel 매핑** — 위 8번 참조.
- **Debate provenance schema 변경** — 위 7번 참조.

## 10. Migration Priority (실행 순서)

Manus 6주 로드맵을 우리 Stage 2~3 영역별 마이그레이션과 정렬:

| Stage 2 PR 후보 | 채택할 design decision | Codex 충돌 가능성 |
|---|---|---|
| Agents sidebar 리메이크 | 3-tier (active / standby / specialist drawer), state vocabulary, agent state pulse | 낮음 ✅ |
| Memento → Notion-style document canvas | spacing, typography scale | 낮음 ✅ |
| TerminalDock → Warp block model | mono typography, status block timeline | 낮음 ✅ |
| Control Queue (옛 Assistant Inbox 리네임) | naming, keyboard shortcut, action set | 중간 ⚠️ (Codex가 delegation UI 작업 중) |
| Command Palette (⌘K) 신규 | shortcut grammar, autonomy slider trigger | 낮음 ✅ |
| Debate card provenance | provenance footer + protocol schema 변경 | **높음 🛑** (Codex 영역) |
| Tmux block model | pane timeline schema | **높음 🛑** (Codex 영역) |

추천 순서: **Agents sidebar → Memento → TerminalDock → Command Palette → Control Queue → (Codex 활동 정착 후) Debate provenance / Tmux block model**.

## 11. 자료 출처

- v0.app share link: https://v0.app/chat/ai-orchestrator-lab-jRHRDd067QN
- Manus archive: [`docs/manus/competitive-ux-research-output.md`](manus/competitive-ux-research-output.md)
- v0 raw output (reference only): [`docs/v0/v0-output/`](v0/v0-output/)
- v0 적용 결과 (Stage 0/1a): [`apps/desktop/src/styles/tokens.css`](../apps/desktop/src/styles/tokens.css), [`apps/desktop/src/ui/`](../apps/desktop/src/ui/)
