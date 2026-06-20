import type { AgentSession, AgentSessionStatus } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  isActiveSession,
  transitionSession,
  type PaneSlot,
  type SummonRegistry,
} from "./personaSummon";

// Characterization tests for the two personaSummon exports the existing
// personaSummon.test.ts leaves directly uncovered (no behavior change). The
// wrappers markRunning/yieldPersona/releasePersona/failPersona are pinned there
// and delegate to transitionSession, but transitionSession's own arms (the
// no-target guard, the non-terminal keep-pane path, the terminal free-pane
// path, and single-target isolation) and isActiveSession's terminal-status
// predicate are not asserted head-on. The module is pure: it imports only
// protocol types + a zod schema, no React/DOM/network. We pin every
// AgentSessionStatus through isActiveSession, then the four transitionSession
// branches.

function session(patch: Partial<AgentSession>): AgentSession {
  return {
    id: patch.id ?? "agent_session_1",
    sessionId: patch.sessionId ?? "orchestration_1",
    agentId: patch.agentId ?? "persona_a",
    role: patch.role ?? "code",
    backend: patch.backend ?? "tmux",
    paneId: patch.paneId ?? "pane_1",
    status: patch.status ?? "spawned",
    createdAt: patch.createdAt ?? "2026-06-20T00:00:00.000Z",
    lastEventAt: patch.lastEventAt ?? "2026-06-20T00:00:00.000Z",
  };
}

function busyRegistry(): SummonRegistry {
  const panes: PaneSlot[] = [
    { paneId: "pane_1", role: "code", status: "busy", agentId: "persona_a" },
    { paneId: "pane_2", role: "qa", status: "busy", agentId: "persona_b" },
  ];
  const sessions: AgentSession[] = [
    session({ id: "agent_session_1", paneId: "pane_1", agentId: "persona_a", status: "running" }),
    session({ id: "agent_session_2", paneId: "pane_2", agentId: "persona_b", status: "spawned" }),
  ];
  return { panes, sessions };
}

describe("isActiveSession", () => {
  it("treats planned/spawned/running/yielded as active", () => {
    for (const status of ["planned", "spawned", "running", "yielded"] as AgentSessionStatus[]) {
      expect(isActiveSession(session({ status }))).toBe(true);
    }
  });

  it("treats completed/failed as inactive", () => {
    expect(isActiveSession(session({ status: "completed" }))).toBe(false);
    expect(isActiveSession(session({ status: "failed" }))).toBe(false);
  });
});

describe("transitionSession", () => {
  it("returns the same registry untouched when the session id is unknown", () => {
    const registry = busyRegistry();
    const result = transitionSession(registry, "agent_session_absent", "running", "2026-06-20T01:00:00.000Z");
    expect(result).toBe(registry);
  });

  it("updates status + lastEventAt and keeps panes for a non-terminal transition", () => {
    const registry = busyRegistry();
    const result = transitionSession(registry, "agent_session_2", "yielded", "2026-06-20T02:00:00.000Z");
    expect(result.panes).toBe(registry.panes);
    const updated = result.sessions.find((s) => s.id === "agent_session_2");
    expect(updated).toMatchObject({ status: "yielded", lastEventAt: "2026-06-20T02:00:00.000Z" });
    const untouched = result.sessions.find((s) => s.id === "agent_session_1");
    expect(untouched).toEqual(registry.sessions.find((s) => s.id === "agent_session_1"));
  });

  it("frees only the held pane for a terminal transition", () => {
    const registry = busyRegistry();
    const result = transitionSession(registry, "agent_session_1", "completed", "2026-06-20T03:00:00.000Z");
    expect(result.sessions.find((s) => s.id === "agent_session_1")).toMatchObject({
      status: "completed",
      lastEventAt: "2026-06-20T03:00:00.000Z",
    });
    expect(result.panes.find((p) => p.paneId === "pane_1")).toEqual({
      paneId: "pane_1",
      role: "code",
      status: "free",
      agentId: undefined,
    });
    expect(result.panes.find((p) => p.paneId === "pane_2")).toEqual({
      paneId: "pane_2",
      role: "qa",
      status: "busy",
      agentId: "persona_b",
    });
  });

  it("frees the held pane on failure too", () => {
    const registry = busyRegistry();
    const result = transitionSession(registry, "agent_session_2", "failed", "2026-06-20T04:00:00.000Z");
    expect(result.panes.find((p) => p.paneId === "pane_2")).toMatchObject({ status: "free", agentId: undefined });
    expect(result.panes.find((p) => p.paneId === "pane_1")).toMatchObject({ status: "busy", agentId: "persona_a" });
  });
});
