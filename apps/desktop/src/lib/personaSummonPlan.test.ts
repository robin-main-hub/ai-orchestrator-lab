import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { buildPersonaInjectionPlan } from "./personaSummonPlan";

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
});
