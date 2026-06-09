import {
  agentSessionSchema,
  type AgentSession,
  type AgentSessionStatus,
  type ExecutionRuntimeBackend,
  type TmuxPaneRole,
} from "@ai-orchestrator/protocol";

/**
 * On-demand persona summon -> pane binding lifecycle.
 *
 * The product philosophy is "summon the persona you need, when you need it" —
 * personas are not all permanently resident; an idle persona occupies no pane.
 * The protocol already models a single agent's lifecycle (AgentSession:
 * planned -> spawned -> running -> yielded -> completed/failed) but nothing
 * drove it. This is the pure state machine that does:
 *
 *   summonPersona()   allocate a free pane, bind the persona, status=spawned
 *   markRunning()     spawned/yielded -> running
 *   yieldPersona()    running -> yielded (paused, pane retained)
 *   releasePersona()  -> completed (frees the pane)
 *   failPersona()     -> failed (frees the pane)
 *
 * Pure and side-effect free: callers persist the returned registry and perform
 * the actual tmux pane wiring / SOUL.md injection separately. A persona that is
 * not summoned holds no pane, so a roster of 17 personas costs nothing until
 * one is actually pulled in.
 */

export type PaneSlotStatus = "free" | "busy";

export type PaneSlot = {
  paneId: string;
  role: TmuxPaneRole;
  status: PaneSlotStatus;
  /** agentId (persona name) currently bound to this pane, when busy */
  agentId?: string;
};

export type SummonRegistry = {
  panes: PaneSlot[];
  sessions: AgentSession[];
};

export type SummonInput = {
  personaName: string;
  sessionId: string;
  /** allocate a pane of this role first; falls back to any free pane */
  preferredRole?: TmuxPaneRole;
  backend?: ExecutionRuntimeBackend;
};

export type SummonContext = {
  now: string;
  makeSessionId: (personaName: string, paneId: string) => string;
};

export type SummonResult =
  | { ok: true; registry: SummonRegistry; session: AgentSession }
  | { ok: false; reason: "no_free_pane" | "already_summoned" };

const TERMINAL_STATUSES: ReadonlyArray<AgentSessionStatus> = ["completed", "failed"];

export function createSummonRegistry(panes: Array<{ paneId: string; role: TmuxPaneRole }>): SummonRegistry {
  return {
    panes: panes.map((pane) => ({ paneId: pane.paneId, role: pane.role, status: "free" as const })),
    sessions: [],
  };
}

export function isActiveSession(session: AgentSession): boolean {
  return !TERMINAL_STATUSES.includes(session.status);
}

export function activeSessions(registry: SummonRegistry): AgentSession[] {
  return registry.sessions.filter(isActiveSession);
}

export function freePanes(registry: SummonRegistry): PaneSlot[] {
  return registry.panes.filter((pane) => pane.status === "free");
}

/**
 * Summon a persona into a free pane. Prefers a pane of `preferredRole`, falls
 * back to any free pane. Refuses if the persona already has an active session
 * in this orchestration session, or if no pane is free.
 */
export function summonPersona(registry: SummonRegistry, input: SummonInput, ctx: SummonContext): SummonResult {
  const alreadyActive = registry.sessions.some(
    (session) =>
      session.sessionId === input.sessionId &&
      session.agentId === input.personaName &&
      isActiveSession(session),
  );
  if (alreadyActive) {
    return { ok: false, reason: "already_summoned" };
  }

  const free = freePanes(registry);
  if (free.length === 0) {
    return { ok: false, reason: "no_free_pane" };
  }
  const pane = free.find((slot) => Boolean(input.preferredRole) && slot.role === input.preferredRole) ?? free[0];
  if (!pane) {
    return { ok: false, reason: "no_free_pane" };
  }

  const session = agentSessionSchema.parse({
    id: ctx.makeSessionId(input.personaName, pane.paneId),
    sessionId: input.sessionId,
    agentId: input.personaName,
    role: pane.role,
    backend: input.backend ?? "tmux",
    paneId: pane.paneId,
    status: "spawned",
    createdAt: ctx.now,
    lastEventAt: ctx.now,
  });

  const panes = registry.panes.map((slot) =>
    slot.paneId === pane.paneId ? { ...slot, status: "busy" as const, agentId: input.personaName } : slot,
  );

  return { ok: true, registry: { panes, sessions: [...registry.sessions, session] }, session };
}

/**
 * Transition a summoned session to a new status. Terminal statuses
 * (completed/failed) free the pane the session held; yielded keeps it.
 */
export function transitionSession(
  registry: SummonRegistry,
  agentSessionId: string,
  status: AgentSessionStatus,
  now: string,
): SummonRegistry {
  const target = registry.sessions.find((session) => session.id === agentSessionId);
  if (!target) {
    return registry;
  }

  const sessions = registry.sessions.map((session) =>
    session.id === agentSessionId ? { ...session, status, lastEventAt: now } : session,
  );

  const freesPane = TERMINAL_STATUSES.includes(status);
  const panes = freesPane
    ? registry.panes.map((slot) =>
        slot.paneId === target.paneId ? { ...slot, status: "free" as const, agentId: undefined } : slot,
      )
    : registry.panes;

  return { panes, sessions };
}

export function markRunning(registry: SummonRegistry, agentSessionId: string, now: string): SummonRegistry {
  return transitionSession(registry, agentSessionId, "running", now);
}

export function yieldPersona(registry: SummonRegistry, agentSessionId: string, now: string): SummonRegistry {
  return transitionSession(registry, agentSessionId, "yielded", now);
}

export function releasePersona(registry: SummonRegistry, agentSessionId: string, now: string): SummonRegistry {
  return transitionSession(registry, agentSessionId, "completed", now);
}

export function failPersona(registry: SummonRegistry, agentSessionId: string, now: string): SummonRegistry {
  return transitionSession(registry, agentSessionId, "failed", now);
}
