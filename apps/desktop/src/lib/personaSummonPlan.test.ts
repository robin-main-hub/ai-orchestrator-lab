import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { resolvePersonaAgentSet } from "./personaAgentSet";
import { buildPersonaInjectionPlan, chunkDispatchText, MAX_DISPATCH_TEXT_LENGTH } from "./personaSummonPlan";

const session = (overrides: Partial<AgentSession> = {}): AgentSession => ({
  id: "as_makise_%2",
  sessionId: "s1",
  agentId: "makise",
  role: "qa",
  backend: "tmux",
  paneId: "%2",
  status: "spawned",
  createdAt: "2026-06-10T00:00:00.000Z",
  ...overrides,
});

const persona = (overrides: Partial<LoadedPersona> = {}): LoadedPersona => ({
  personaName: "makise",
  mode: "soul_plus_agents",
  safetyContent: "Never touch DGX-01. Protect secrets.",
  fragments: [
    { source: "soul", relativePath: "agents/makise/SOUL.md", content: "Rational, precise voice." },
    { source: "agents", relativePath: "agents/makise/AGENTS.md", content: "Plan before editing." },
  ],
  ...overrides,
});

describe("buildPersonaInjectionPlan", () => {
  it("produces an identity injection step from safety + persona fragments", () => {
    const plan = buildPersonaInjectionPlan({ session: session(), persona: persona() });
    expect(plan.agentId).toBe("makise");
    expect(plan.paneId).toBe("%2");
    expect(plan.role).toBe("qa");
    expect(plan.injectionText).toContain("System Safety Boundaries");
    expect(plan.injectionText).toContain("Rational, precise voice.");
    expect(plan.injectionText).toContain("Plan before editing.");
    expect(plan.steps).toEqual([plan.injectionText]);
  });

  it("appends a kickoff task as a second dispatch step", () => {
    const plan = buildPersonaInjectionPlan({
      session: session(),
      persona: persona(),
      kickoffTask: "Audit the auth module for race conditions.",
    });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1]).toBe("Audit the auth module for race conditions.");
  });

  it("falls back to the header line when the persona has no fragments or safety", () => {
    const plan = buildPersonaInjectionPlan({
      session: session({ agentId: "ghost" }),
      persona: persona({ fragments: [], safetyContent: null, mode: "off" }),
    });
    expect(plan.injectionText).toContain('operating as "ghost"');
    expect(plan.steps).toEqual([plan.injectionText]);
  });

  it("honors a custom header line", () => {
    const plan = buildPersonaInjectionPlan({
      session: session(),
      persona: persona({ fragments: [], safetyContent: null }),
      headerLine: "CUSTOM HEADER",
    });
    expect(plan.injectionText).toBe("CUSTOM HEADER");
  });

  it("ignores a blank kickoff task", () => {
    const plan = buildPersonaInjectionPlan({ session: session(), persona: persona(), kickoffTask: "   " });
    expect(plan.steps).toHaveLength(1);
  });

  it("throws when the session has no pane bound", () => {
    expect(() => buildPersonaInjectionPlan({ session: session({ paneId: undefined }), persona: persona() })).toThrow(
      /no pane bound/,
    );
  });

  it("agent set on a recycled slot: reset boot precedes the identity, header carries slot + declared role", () => {
    const plan = buildPersonaInjectionPlan({
      session: session({ agentId: "kurumi", role: "orchestrator" }),
      persona: persona({ personaName: "kurumi" }),
      kickoffTask: "Run the swarm.",
      agentSet: resolvePersonaAgentSet("kurumi", { slotId: "hermes-02", bootSteps: ["/new"] }),
    });
    // reset -> identity -> kickoff: the recycled slot inherits nothing
    expect(plan.bootSteps).toEqual(["/new"]);
    expect(plan.steps).toEqual(["/new", plan.injectionText, "Run the swarm."]);
    expect(plan.injectionText).toContain("slot hermes-02");
    expect(plan.injectionText).toContain("freshly reset session");
    expect(plan.injectionText).toContain("Declared role: companion");
  });

  it("appends an optional world-info fragment after the identity (lorebook)", () => {
    const plan = buildPersonaInjectionPlan({
      session: session(),
      persona: persona(),
      worldInfo: "## World Info (lorebook)\n[로어] DGX-01은 보호 대상이다.",
    });
    expect(plan.injectionText).toContain("Rational, precise voice.");
    expect(plan.injectionText.indexOf("World Info")).toBeGreaterThan(plan.injectionText.indexOf("Rational"));
    // blank world info is a no-op
    const plain = buildPersonaInjectionPlan({ session: session(), persona: persona(), worldInfo: "  " });
    expect(plain.injectionText).not.toContain("World Info");
  });

  it("agent set on a sticky slot: no boot, the persona keeps her own agent", () => {
    const plan = buildPersonaInjectionPlan({
      session: session(),
      persona: persona(),
      agentSet: resolvePersonaAgentSet("makise", { slotId: "hermes-01" }),
    });
    expect(plan.bootSteps).toEqual([]);
    expect(plan.steps).toEqual([plan.injectionText]);
    expect(plan.injectionText).toContain("slot hermes-01");
    expect(plan.injectionText).not.toContain("freshly reset");
  });

  it("splits an oversized identity into dispatch-sized chunks with continuation markers", () => {
    // 풀 소울 페르소나(architect ≈ 18K)가 서버 commandPreview 8000자 제한에
    // 걸려 identity injection failed: 400 으로 즉사하던 회귀 케이스
    const bigSoul = Array.from({ length: 400 }, (_, i) => `soul line ${i} — ${"x".repeat(40)}`).join("\n");
    const plan = buildPersonaInjectionPlan({
      session: session(),
      persona: persona({
        fragments: [{ source: "soul", relativePath: "agents/makise/SOUL.md", content: bigSoul }],
      }),
      kickoffTask: "Run.",
    });

    const identitySteps = plan.steps.slice(0, -1);
    expect(identitySteps.length).toBeGreaterThan(1);
    for (const step of identitySteps) {
      expect(step.length).toBeLessThanOrEqual(8_000);
    }
    expect(identitySteps[0]).toContain("identity continues in the next message");
    expect(identitySteps.at(-1)).toContain("(identity continued)");
    expect(identitySteps.at(-1)).not.toContain("identity continues in the next message");
    expect(plan.steps.at(-1)).toBe("Run.");
  });

  it("keeps a short identity as a single unmarked step", () => {
    const plan = buildPersonaInjectionPlan({ session: session(), persona: persona() });
    expect(plan.steps).toEqual([plan.injectionText]);
    expect(plan.injectionText).not.toContain("identity continues");
  });
});

describe("chunkDispatchText", () => {
  it("returns short text as a single chunk", () => {
    expect(chunkDispatchText("hello\nworld")).toEqual(["hello\nworld"]);
  });

  it("splits on line boundaries and reassembles losslessly", () => {
    const text = Array.from({ length: 300 }, (_, i) => `line ${i} ${"y".repeat(50)}`).join("\n");
    const chunks = chunkDispatchText(text, 2_000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2_000);
    }
    expect(chunks.join("\n")).toBe(text);
  });

  it("force-splits a single line longer than the limit", () => {
    const text = "z".repeat(MAX_DISPATCH_TEXT_LENGTH * 2 + 10);
    const chunks = chunkDispatchText(text);
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe(text);
  });
});
