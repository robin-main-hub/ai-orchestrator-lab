# Autonomous Execution Layer

How the orchestrator turns a debate/CodingPacket into actual work done by a
summoned persona in a tmux pane — autonomously, but always behind the same
Event Storage / Permission / Approval / Redaction gates.

This document ties together the modules added across PRs #413–#420. None of it
bypasses a gate; it automates the *deciding* and *relaying* that a human used
to do by hand.

## The problem it solves

The server could already dispatch a command to a pane (`/tmux/dispatch` +
`/approvals/replay`) and capture a pane's output (`/tmux/capture`), but nothing
**read** a captured result and decided the next move. So a CodingPacket could
not be driven to its verification plan without a human relaying every step, and
the 17 personas were inert — `AgentSession` existed in the protocol but no
runtime used it.

## Layers (bottom to top)

```
runAutonomousPersonaTask        (autonomousRun.ts)        <- single entry point
  ├── createApprovalStrategy    (autonomousRun.ts)
  │     ├── pollForApprovalDecision        (mode A: human grant)   closedLoopRuntime.ts
  │     └── createAutoApproveStrategy      (mode B: safe auto)     autoApproveStrategy.ts
  │           └── isAutoApprovableCommand  (allowlist)             safeCommandPolicy.ts
  └── runPersonaCodingTask      (personaTaskRunner.ts)             <- the bridge
        ├── summonPersona / release / fail (personaSummon.ts)      <- #2 lifecycle
        ├── buildPersonaInjectionPlan      (personaSummonPlan.ts)  <- identity inject
        └── runClosedLoop                  (closedLoopController.ts)<- #1 loop
              ├── reduceClosedLoop         (closedLoopController.ts)
              ├── classifyPaneOutput       (closedLoopExecution.ts)
              ├── decideNextStep           (closedLoopExecution.ts)
              └── createClosedLoopEffects  (closedLoopRuntime.ts)  <- gated dispatch/capture
```

### #1 Closed loop — read output, decide next step

- `classifyPaneOutput(text)` → `progressing | awaiting_input | needs_approval |
  blocked | completed | failed`. Failures and approval prompts dominate over
  completion claims (a worker that prints "done" next to a traceback is not
  done).
- `decideNextStep(state)` → `dispatch_next | await_capture | escalate_approval |
  complete | fail`. Conservative: blocked / stuck / needs-permission escalate
  to a human; only an unambiguous "keep going" auto-dispatches.
- `reduceClosedLoop` + `runClosedLoop` drive a `CodingPacket.verificationPlan`
  one step at a time, with a hard iteration cap that escalates rather than
  spinning.

### #2 Persona summon — bind an identity to a pane on demand

- `summonPersona` allocates a free pane, binds the persona (`AgentSession`
  spawned), and refuses double-summon / no-free-pane. `release`/`fail` free the
  pane. An un-summoned persona holds no pane, so a 17-persona roster costs
  nothing until one is pulled in.
- `buildPersonaInjectionPlan` renders `SAFETY.md` + `IDENTITY/SOUL/AGENTS/USER`
  (via `@ai-orchestrator/agents`) into the identity-injection dispatch steps.

### The bridge — `runPersonaCodingTask`

Summon → inject identity (+ kickoff = packet goal) → drive the verification
plan → release / fail / retain the pane based on the outcome
(`awaiting_human` keeps the pane bound until a human resolves the approval).

### Approval modes

| Mode | Behaviour |
| --- | --- |
| `human` (mode A) | Every dispatch waits for a human grant in the Ops queue, then replays to execute. |
| `auto_safe` (mode B) | A vetted, deny-by-default allowlist of read-only / verification commands auto-approves (recorded with actor `agent`); identity injection, the kickoff, and anything risky fall back to the human poll. |

Mode B **removes the human click for safe commands, not the gate** — grants
still go through `/approvals/grant` and dispatch still replays through the
server gate. The allowlist (`safeCommandPolicy.ts`) is the security boundary
and is fully overridable.

## Using it

```ts
import { runAutonomousPersonaTask } from "@/lib/autonomousRun";

const outcome = await runAutonomousPersonaTask({
  registry,                       // SummonRegistry of available panes
  summon: { personaName: "makise", sessionId, preferredRole: "qa" },
  persona,                        // LoadedPersona (from @ai-orchestrator/agents)
  packet,                         // CodingPacket with a verificationPlan
  ctx: { now, makeSessionId },
  mode: "auto_safe",              // or "human"
  server: { serverBaseUrl, tmuxSessionName: "ai-swarm" },
});
// outcome.loopStatus: completed | failed | awaiting_human
```

In production `createClosedLoopEffects` talks to the real DGX clients; in tests
every client is injected, which is why the whole layer is unit-tested without a
running server.

## Invariants

- No module here executes `tmux send-keys`. Execution only happens server-side
  in `dispatchServerTmuxCommandIfAllowed`, behind the env gate
  (`ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1`) and the approval replay.
- Every loop-issued dispatch flows through the same permission/approval/
  redaction path as a human dispatch.
- Ambiguity is resolved toward a human (escalate), not toward action.

## Not yet built

- UI surface to start a run and render each iteration's timeline.
- Dynamic pane roles beyond the fixed 10-role `tmuxPaneRole` enum.
- Real persona-file loading wiring in the desktop renderer (bundle vs node
  source) and provider routing for the model the worker uses.
