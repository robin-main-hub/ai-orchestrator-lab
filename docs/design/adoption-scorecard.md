# Adoption Scorecard

## Purpose

Use this scorecard to turn Kimi research and GPT Pro analysis into ranked,
actionable additions for AI Orchestrator Lab.

The scorecard should push reviewers to choose what is worth adding. It should
not become a refusal machine.

## Candidate Summary

| Field | Value |
| --- | --- |
| Candidate name |  |
| Source project / URL |  |
| License / copy policy |  |
| Applicable cockpit slot |  |
| Proposed landing mode | docs-first / mock-first / read-only-first / protocol-first / isolated prototype-first |
| Proposed decision | reject / defer / adopt / prototype |

## Scoring Rubric

Score each category from 0 to 3.

| Category | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Operator value | Nice but irrelevant | Mild convenience | Clear speed or clarity gain | Changes how fast the operator can command or judge |
| Control surface value | Hidden or passive | Small status hint | Useful dashboard element | Core cockpit control or overview |
| Recovery value | No continuity help | Minor resume clue | Helps recover work state | Strong sleep/offline/handoff recovery |
| Evidence value | No explanation | Some labels | Shows why action is safe/blocked | Connects decision to evidence and replay impact |
| Memory value | No memory impact | Displays memory text | Explains recall or trust | Improves recall, contradiction, or memento workflow |
| Handoff value | No handoff help | Some context | Next actor can continue | Produces a concise next-action packet |
| Transplantability | Requires broad rewrite | Medium refactor | Small isolated PR | Docs/mock/read-only PR possible now |
| Guardrail fit | Violates core rules | Needs major redesign | Fits with constraints | Strengthens existing guardrails |

## Decision Bands

| Total | Decision guidance |
| --- | --- |
| 20-24 | Adopt or prototype immediately; identify smallest PR |
| 14-19 | Good candidate; make a focused design note or mock-first PR |
| 8-13 | Defer; preserve pattern but do not implement yet |
| 0-7 | Reject unless user explicitly reopens |

Override the total if a candidate violates a hard security or authority rule.

## Guardrail Fit Checks

Mark each as pass, risk, or fail.

| Check | Result | Notes |
| --- | --- | --- |
| Keeps `WorkLane` business-only |  |  |
| Uses `WorkSurface` for UI/runtime placement |  |  |
| Avoids broad `WorkItemKind` expansion |  |  |
| Preserves MacBook operator authority |  |  |
| Keeps DGX-02 as continuity mirror/index host |  |  |
| Treats SimpleMem/MCP as derived index/projection |  |  |
| Preserves tmux approval/redaction/replay/dry-run gates |  |  |
| Avoids direct Telegram/mobile/API to tmux dispatch |  |  |
| Preserves Permission Matrix deny-by-default behavior |  |  |
| Shows evidence/source trust for operator decisions |  |  |
| Keeps untrusted memory/provider inputs quarantined until activated |  |  |
| Has clear license/copy policy |  |  |
| Can start without live mutation |  |  |

## Positive Selection Questions

Reviewers must answer these before saying "defer" or "reject":

1. What is the best part of this idea?
2. If the implementation is messy, what clean pattern can we extract?
3. What would the smallest safe PR look like?
4. Could it start as docs, mock UI, read-only UI, or protocol only?
5. What operator decision would become faster or safer?

## Output Template For GPT Pro

```text
## Top 10 worth adding
| Rank | Candidate | Source | Score | Why it belongs | Smallest PR |

## Top 3 immediate PRs
1. PR title:
   Scope:
   Files/surfaces:
   Guardrails:
   Verification:

## Top 3 later design patterns
1. Pattern:
   Why later:
   Needed prerequisite:

## Attractive but avoid
1. Candidate:
   Reason:
   Safer alternative:

## Next sprint, max 3 PRs
1.
2.
3.
```

## Copy Policy

| Source state | Allowed action |
| --- | --- |
| MIT / Apache / BSD and attribution path is clear | Copy small code patterns if worthwhile, but prefer adaptation |
| GPL / AGPL / unclear commercial source | Do not copy code; reimplement idea from scratch |
| Screenshot or product demo only | Extract interaction pattern only |
| AI-generated reference | Treat as inspiration; verify against our code and design system |
| `docs/v0/v0-output/` reference | Port the visual language; do not import raw output blindly |
| Manus archive | Treat as historical research; reconcile through current design decisions |

## Russian Judge Rule

- Refusing good ideas because they are external: deduction.
- Copying external architecture blindly: deduction.
- Turning a great design into a small, clean, verified PR: high score.
