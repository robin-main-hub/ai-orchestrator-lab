import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import type { ClosedLoopEffects } from "./closedLoopController";
import { createSummonRegistry, type SummonContext } from "./personaSummon";
import { runPersonaCodingTask } from "./personaTaskRunner";

const ctx: SummonContext = {
  now: "2026-06-10T00:00:00.000Z",
  makeSessionId: (persona, paneId) => `as_${persona}_${paneId}`,
};

const persona = (): LoadedPersona => ({
  personaName: "makise",
  mode: "soul_plus_agents",
  safetyContent: "Never touch DGX-01.",
  fragments: [{ source: "soul", relativePath: "agents/makise/SOUL.md", content: "Precise." }],
});

const packet = (verificationPlan: string[]): CodingPacket => ({
  goal: "Implement the widget",
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan,
  reviewerNotes: [],
});

function fakeEffects(captures: string[]): {
  factory: (session: AgentSession) => ClosedLoopEffects;
  dispatched: string[];
  escalations: string[];
} {
  const dispatched: string[] = [];
  const escalations: string[] = [];
  let i = 0;
  const factory = () => ({
    dispatch: (command: string) => {
      dispatched.push(command);
    },
    capture: () => captures[Math.min(i++, captures.length - 1)] ?? "",
    escalate: (reason: string) => {
      escalations.push(reason);
    },
  });
  return { factory, dispatched, escalations };
}

const roster = () => createSummonRegistry([{ paneId: "%1", role: "qa" }]);

describe("runPersonaCodingTask", () => {
  it("summons, injects identity, then drives the verification plan to completion", async () => {
    const { factory, dispatched } = fakeEffects(["All tests passed", "12 passed, 0 failed"]);
    const result = await runPersonaCodingTask({
      registry: roster(),
      summon: { personaName: "makise", sessionId: "s1", preferredRole: "qa" },
      persona: persona(),
      packet: packet(["run tests", "run lint"]),
      ctx,
      createEffects: factory,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loopStatus).toBe("completed");
    // identity injection + kickoff task first, then the two verification steps
    expect(dispatched[0]).toContain("Precise."); // identity blob
    expect(dispatched[1]).toBe("Implement the widget"); // kickoff = packet.goal
    expect(dispatched.slice(2)).toEqual(["run tests", "run lint"]);
    // pane released on completion
    expect(result.registry.panes.find((p) => p.paneId === "%1")?.status).toBe("free");
  });

  it("returns no_free_pane when the roster is full", async () => {
    let registry = roster();
    const { factory } = fakeEffects(["All tests passed"]);
    const first = await runPersonaCodingTask({
      registry,
      summon: { personaName: "a", sessionId: "s1" },
      persona: persona(),
      packet: packet([]), // empty plan completes immediately, but pane only frees after
      ctx,
      createEffects: factory,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    registry = first.registry; // pane freed (empty plan -> completed -> released)

    // Occupy the single pane with a long-running (awaiting_human) task, then try again.
    const blocking = await runPersonaCodingTask({
      registry,
      summon: { personaName: "b", sessionId: "s1" },
      persona: persona(),
      packet: packet(["loop forever"]),
      ctx,
      createEffects: fakeEffects(["Allow edit? (y/n)"]).factory, // needs_approval -> awaiting_human, pane retained
    });
    expect(blocking.ok).toBe(true);
    if (!blocking.ok) return;
    expect(blocking.loopStatus).toBe("awaiting_human");

    const full = await runPersonaCodingTask({
      registry: blocking.registry,
      summon: { personaName: "c", sessionId: "s1" },
      persona: persona(),
      packet: packet(["x"]),
      ctx,
      createEffects: fakeEffects(["ok"]).factory,
    });
    expect(full).toEqual({ ok: false, reason: "no_free_pane" });
  });

  it("fails and frees the pane when identity injection is rejected", async () => {
    const rejectingFactory = (): ClosedLoopEffects => ({
      dispatch: () => {
        throw new Error("approval rejected");
      },
      capture: () => "",
      escalate: () => {},
    });
    const result = await runPersonaCodingTask({
      registry: roster(),
      summon: { personaName: "makise", sessionId: "s1" },
      persona: persona(),
      packet: packet(["run tests"]),
      ctx,
      createEffects: rejectingFactory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loopStatus).toBe("failed");
    expect(result.registry.panes.find((p) => p.paneId === "%1")?.status).toBe("free");
  });

  it("resolves cancelled (not failed) and frees the pane when a dispatch throws while aborted", async () => {
    // human 모드 중지의 실제 경로: 승인 폴이 abort로 깨어나 dispatch가 throw한다 —
    // 취소 중의 실패는 실패가 아니라 취소다 (runClosedLoop와 동일 규칙).
    const controller = new AbortController();
    const abortingFactory = (): ClosedLoopEffects => ({
      dispatch: () => {
        controller.abort();
        throw new Error("approval timeout for verification step -1");
      },
      capture: () => "",
      escalate: () => {},
    });
    const result = await runPersonaCodingTask({
      registry: roster(),
      summon: { personaName: "makise", sessionId: "s1" },
      persona: persona(),
      packet: packet(["run tests"]),
      ctx,
      createEffects: abortingFactory,
      signal: controller.signal,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loopStatus).toBe("cancelled");
    expect(result.registry.panes.find((p) => p.paneId === "%1")?.status).toBe("free");
  });

  it("retains the pane when the loop ends awaiting a human", async () => {
    const { factory } = fakeEffects(["I am blocked: missing the API spec"]);
    const result = await runPersonaCodingTask({
      registry: roster(),
      summon: { personaName: "makise", sessionId: "s1" },
      persona: persona(),
      packet: packet(["run tests"]),
      ctx,
      createEffects: factory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loopStatus).toBe("awaiting_human");
    expect(result.registry.panes.find((p) => p.paneId === "%1")?.status).toBe("busy");
  });
});
