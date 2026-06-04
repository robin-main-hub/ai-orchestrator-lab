# Operator Cockpit Blueprint

The Operator Cockpit is the central command center. Its purpose is not to add new backend features, but to visualize:
- What each worker is doing
- Why a worker is blocked
- What exact payload will replay upon approval
- The evidence supporting an approval/rejection
- Memory recall logic
- Continuity health (MacBook vs DGX)
- Provider/model selection rationale
- Recovery states

## Layout Segments

### Top Navigation
- Conversation
- Debate
- Coding
- Tmux Workers
- Memory
- Recovery
- Provider Status

### Cockpit Cards
1. **Worker Fleet:** cmux-style status rings, role, worktree, branch, blocked reasons.
2. **Approval & Evidence:** Block reasons, evidence, command preview, payload binding status.
3. **Handoff / Missing Info:** Owner, next action, missing-info slot.
4. **Memory Recall:** Context reasons, MacBook authority, DGX mirror health, contradiction warnings.
5. **Provider Routing:** Selected model, fallback status, cost/speed/trust badge.
6. **Recovery / Continuity:** Offline resume, outbox sync, health indicators.
7. **Dispatch History:** Requester, approval state, replay payload digest, tamper warning.
