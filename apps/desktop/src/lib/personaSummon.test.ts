import { describe, expect, it } from "vitest";
import {
  activeSessions,
  createSummonRegistry,
  failPersona,
  freePanes,
  markRunning,
  releasePersona,
  summonPersona,
  yieldPersona,
  type SummonContext,
} from "./personaSummon";

const ctx = (now = "2026-06-10T00:00:00.000Z"): SummonContext => ({
  now,
  makeSessionId: (persona, paneId) => `as_${persona}_${paneId}`,
});

const roster = () =>
  createSummonRegistry([
    { paneId: "%1", role: "code" },
    { paneId: "%2", role: "qa" },
    { paneId: "%3", role: "research" },
  ]);

describe("summonPersona", () => {
  it("binds a persona to a free pane of the preferred role", () => {
    const result = summonPersona(roster(), { personaName: "makise", sessionId: "s1", preferredRole: "qa" }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.agentId).toBe("makise");
    expect(result.session.paneId).toBe("%2");
    expect(result.session.role).toBe("qa");
    expect(result.session.status).toBe("spawned");
    expect(freePanes(result.registry).map((p) => p.paneId)).toEqual(["%1", "%3"]);
  });

  it("falls back to any free pane when the preferred role is taken", () => {
    let registry = roster();
    const first = summonPersona(registry, { personaName: "a", sessionId: "s1", preferredRole: "qa" }, ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    registry = first.registry;
    const second = summonPersona(registry, { personaName: "b", sessionId: "s1", preferredRole: "qa" }, ctx());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.session.paneId).not.toBe("%2"); // qa pane already busy
  });

  it("refuses when no pane is free", () => {
    let registry = createSummonRegistry([{ paneId: "%1", role: "code" }]);
    const first = summonPersona(registry, { personaName: "a", sessionId: "s1" }, ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = summonPersona(first.registry, { personaName: "b", sessionId: "s1" }, ctx());
    expect(second).toEqual({ ok: false, reason: "no_free_pane" });
  });

  it("refuses to summon the same persona twice while it is active", () => {
    const first = summonPersona(roster(), { personaName: "makise", sessionId: "s1" }, ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = summonPersona(first.registry, { personaName: "makise", sessionId: "s1" }, ctx());
    expect(again).toEqual({ ok: false, reason: "already_summoned" });
  });

  it("allows re-summon after the previous session is released", () => {
    const first = summonPersona(roster(), { personaName: "makise", sessionId: "s1" }, ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const released = releasePersona(first.registry, first.session.id, "2026-06-10T00:01:00.000Z");
    const again = summonPersona(released, { personaName: "makise", sessionId: "s1" }, ctx("2026-06-10T00:02:00.000Z"));
    expect(again.ok).toBe(true);
  });
});

describe("lifecycle transitions", () => {
  it("keeps the pane busy through running and yielded", () => {
    const summon = summonPersona(roster(), { personaName: "yui", sessionId: "s1", preferredRole: "code" }, ctx());
    expect(summon.ok).toBe(true);
    if (!summon.ok) return;
    let registry = markRunning(summon.registry, summon.session.id, "2026-06-10T00:01:00.000Z");
    expect(registry.sessions[0]?.status).toBe("running");
    expect(registry.panes.find((p) => p.paneId === "%1")?.status).toBe("busy");
    registry = yieldPersona(registry, summon.session.id, "2026-06-10T00:02:00.000Z");
    expect(registry.sessions[0]?.status).toBe("yielded");
    expect(registry.panes.find((p) => p.paneId === "%1")?.status).toBe("busy"); // still attached
  });

  it("frees the pane on release (completed) and on failure", () => {
    const summon = summonPersona(roster(), { personaName: "sora", sessionId: "s1", preferredRole: "code" }, ctx());
    expect(summon.ok).toBe(true);
    if (!summon.ok) return;
    const released = releasePersona(summon.registry, summon.session.id, "2026-06-10T00:03:00.000Z");
    const pane = released.panes.find((p) => p.paneId === "%1");
    expect(pane?.status).toBe("free");
    expect(pane?.agentId).toBeUndefined();
    expect(activeSessions(released)).toHaveLength(0);

    const failedSummon = summonPersona(released, { personaName: "asuka", sessionId: "s1" }, ctx());
    expect(failedSummon.ok).toBe(true);
    if (!failedSummon.ok) return;
    const failed = failPersona(failedSummon.registry, failedSummon.session.id, "2026-06-10T00:04:00.000Z");
    expect(failed.panes.find((p) => p.paneId === failedSummon.session.paneId)?.status).toBe("free");
  });

  it("is a no-op for an unknown session id", () => {
    const registry = roster();
    expect(transitionsUnchanged(registry)).toBe(true);
  });
});

function transitionsUnchanged(registry: ReturnType<typeof roster>): boolean {
  const after = releasePersona(registry, "does_not_exist", "2026-06-10T00:00:00.000Z");
  return after.sessions.length === registry.sessions.length && after.panes.every((p, i) => p.status === registry.panes[i]?.status);
}
