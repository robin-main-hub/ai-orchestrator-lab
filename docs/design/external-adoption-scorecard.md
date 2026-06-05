# External Adoption Scorecard

Used to evaluate design patterns before implementation.

## 1. Evaluation Criteria
- **Operator Value:** Does it help the operator judge or command faster?
- **Control Surface:** Does it fit in the cockpit dashboard?
- **Recovery Value:** Does it aid in resuming work?
- **Evidence Value:** Does it clarify *why* an action is requested?
- **Memory Value:** Does it explain context retrieval?
- **Handoff Value:** Does it clarify context transfer between agents?
- **Transplantability:** Can it be added via a small, isolated PR?
- **Guardrail Fit:** Does it respect WorkLane/Surface, MacBook authority, and tmux gates?

## 2. Decision Logic
- Extract the pattern, discard the bulk.
- Steal the idea, discard messy architecture.
- Defer if it doesn't fit the core loop right now.

## 3. Implementation Modes
All adoptions must first land in one of these modes:
- `docs-first`
- `mock-first`
- `read-only-first`
- `protocol-first`
