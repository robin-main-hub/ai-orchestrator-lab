# Kimi Tmux-Agent Research Digest

## 1. Top 10 Patterns Worth Absorbing

1. **cmux status rings / primitive-not-solution**
2. **AWS CAO handoff / assign / send_message**
3. **Claude Squad worktree + TUI overview**
4. **amux self-healing / mobile dashboard / kanban**
5. **Bernstein deterministic scheduler + HMAC audit**
6. **Composio AO CI/review feedback loop**
7. **ccswarm native PTY / MessageBus** (later pattern)
8. **Zellij NDJSON / tmux Control Mode observability evolution**
9. **sandbox risk tier spectrum**
10. **MCP-ready boundary**

## 2. Pattern Breakdown

### 1. cmux status rings / primitive-not-solution
- **Source Project:** cmux
- **Inspiring Idea:** 4-color status ring and composing primitives instead of fixed solutions.
- **Operator Value:** Immediate visual feedback of worker status without parsing terminal text.
- **Transplant Shape:** Add status rings to the Worker Fleet UI cards.
- **Smallest Safe PR:** Add `status_ring` UI component to cockpit mock.
- **Guardrails:** Keep WorkLane as `auto/check/ask/approve/blocked`.
- **Decision:** Adopt

### 2. AWS CAO handoff / assign / send_message
- **Source Project:** AWS CAO
- **Inspiring Idea:** Clear orchestration primitives for agents.
- **Operator Value:** Allows precise tracking of who owns what task and context transfer.
- **Transplant Shape:** Map directly to our `WorkItemHandoff`, next action cards, and missing-info slots.
- **Smallest Safe PR:** Add Handoff / Missing Info view to cockpit mock.
- **Guardrails:** No live tmux expansion.
- **Decision:** Adopt

### 3. Claude Squad worktree + TUI overview
- **Source Project:** Claude Squad
- **Inspiring Idea:** tmux session + git worktree isolation visual overview.
- **Operator Value:** Operators can verify that agents are strictly isolated.
- **Transplant Shape:** Worker pane overview with branch/worktree isolation badges.
- **Smallest Safe PR:** Add worktree/branch indicator to worker UI mock.
- **Guardrails:** MacBook authority rules.
- **Decision:** Adopt

### 4. amux self-healing / mobile dashboard / kanban
- **Source Project:** amux
- **Inspiring Idea:** Detecting stuck agents and rate limits, mobile UI.
- **Operator Value:** Remote monitoring and autonomous recovery awareness.
- **Transplant Shape:** Kanban-style blocked reasons and mobile-ready layout.
- **Smallest Safe PR:** Add blocked reason and rate-limit cards to cockpit mock.
- **Guardrails:** No state transitions handled by LLM (must be deterministic).
- **Decision:** Adopt

### 5. Bernstein deterministic scheduler + HMAC audit
- **Source Project:** Bernstein
- **Inspiring Idea:** 1 LLM call to plan, the rest is deterministic Python with HMAC audit chain.
- **Operator Value:** Trustable audit trails that prove why an execution happened.
- **Transplant Shape:** Display HMAC digest and approval state in Dispatch History.
- **Smallest Safe PR:** Add Dispatch History mock with tamper warnings.
- **Guardrails:** Planning is LLM, execution state logic is code.
- **Decision:** Adopt

### 6. Composio AO CI/review feedback loop
- **Source Project:** Composio AO
- **Inspiring Idea:** Translating CI failures into feedback loops for agents.
- **Operator Value:** Exposing why an agent is retrying.
- **Transplant Shape:** Feedback loop card tracking CI/Review responses.
- **Smallest Safe PR:** Add CI feedback badge to UI.
- **Guardrails:** WorkItemKind must not be polluted.
- **Decision:** Prototype

### 7. ccswarm native PTY / MessageBus
- **Source Project:** ccswarm
- **Inspiring Idea:** tmux-free native PTY and MessageBus for token savings.
- **Operator Value:** Efficient sharing of results and context.
- **Transplant Shape:** Context capsule / result sharing architecture.
- **Smallest Safe PR:** N/A (Defer for now)
- **Guardrails:** Do not rewrite backend yet.
- **Decision:** Defer

### 8. Zellij NDJSON / tmux Control Mode observability evolution
- **Source Project:** Zellij / tmux
- **Inspiring Idea:** Moving from polling to structured side-channel observers.
- **Operator Value:** Reliable state reporting instead of ANSI parsing.
- **Transplant Shape:** Read-only tmux observer adapter.
- **Smallest Safe PR:** Define `OperatorCockpitSnapshot` schema (PR 2).
- **Guardrails:** No backend replacement.
- **Decision:** Adopt (Pattern only)

### 9. Sandbox risk tier spectrum
- **Source Project:** Multiple (tmux -> Container -> gVisor -> Firecracker)
- **Inspiring Idea:** Visualizing the security perimeter.
- **Operator Value:** Operators instantly know if an agent has dangerous access.
- **Transplant Shape:** Risk tier / sandbox profile badges.
- **Smallest Safe PR:** Add security tier badge to worker mock.
- **Guardrails:** Deny-by-default permission matrix.
- **Decision:** Adopt

### 10. MCP-ready boundary
- **Source Project:** MCP Standard
- **Inspiring Idea:** Standardized tool boundaries.
- **Operator Value:** Future-proofing for ecosystem tools.
- **Transplant Shape:** Designate boundary interfaces without implementing servers.
- **Smallest Safe PR:** Add provider/tool routing badge.
- **Guardrails:** No MCP server creation yet.
- **Decision:** Defer implementation, Adopt design boundary.

## 3. Trust Filter
- **Warning:** Kimi files contain future-dated metadata (e.g., 2026-06-11, 2026-07-09) and aggressive claims.
- **Rule:** Treat all factual claims (star counts, benchmarks) as unverified until explicitly checked per PR.
- **Rule:** Treat design patterns purely as inspiration, not absolute truth.

## 4. Do Not Copy
- **No AGPL code copying**
- **No giant swarm/tool explosion**
- **No live tmux write expansion**
- **No SimpleMem/MCP runtime expansion**
- **No WorkLane/WorkItemKind pollution**
