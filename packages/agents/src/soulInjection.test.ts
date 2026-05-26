import { describe, expect, it } from "vitest";
import type { AgentProfile } from "@ai-orchestrator/protocol";
import {
  buildAgentSystemPrompt,
  estimateTokens,
  soulModeToPersonaSourceMode,
} from "./soulInjection.js";
import { createInMemoryPersonaSource } from "./personaLoader.js";

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "agent_test",
    name: "Test",
    kind: "virtual",
    role: "architect",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    ...overrides,
  };
}

describe("soulModeToPersonaSourceMode", () => {
  it("full -> soul_plus_agents", () => {
    expect(soulModeToPersonaSourceMode("full")).toBe("soul_plus_agents");
  });
  it("summary -> soul_only", () => {
    expect(soulModeToPersonaSourceMode("summary")).toBe("soul_only");
  });
  it("retrieved -> soul_only (static fallback)", () => {
    expect(soulModeToPersonaSourceMode("retrieved")).toBe("soul_only");
  });
  it("off -> off", () => {
    expect(soulModeToPersonaSourceMode("off")).toBe("off");
  });
});

describe("estimateTokens", () => {
  it("returns ceil(length / 4)", () => {
    expect(estimateTokens("aaaa")).toBe(1);
    expect(estimateTokens("aaaaa")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("buildAgentSystemPrompt", () => {
  const SOUL = "# Soul\n나는 건축가다.";
  const AGENTS = "# Rules\n결과물을 구체적으로 제시하라.";
  const SAFETY = "# Safety\n비밀을 노출하지 말 것.";

  it("mode=summary injects SOUL only", async () => {
    const source = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": SOUL,
      "agents/architect/AGENTS.md": AGENTS,
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(makeProfile({ soulMode: "summary" }), source);
    expect(report.mode).toBe("summary");
    expect(report.fragmentsInjected).toEqual(["agents/architect/SOUL.md"]);
    expect(report.safetyInjected).toBe(true);
    expect(report.promptText).toContain("나는 건축가다");
    expect(report.promptText).not.toContain("결과물을 구체적으로");
  });

  it("mode=full injects SOUL + AGENTS", async () => {
    const source = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": SOUL,
      "agents/architect/AGENTS.md": AGENTS,
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(makeProfile({ soulMode: "full" }), source);
    expect(report.fragmentsInjected).toEqual([
      "agents/architect/SOUL.md",
      "agents/architect/AGENTS.md",
    ]);
    expect(report.promptText).toContain("결과물을 구체적으로");
  });

  it("mode=off returns empty prompt but still injects safety", async () => {
    const source = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(makeProfile({ soulMode: "off" }), source);
    expect(report.fragmentsInjected).toHaveLength(0);
    expect(report.safetyInjected).toBe(true);
    expect(report.promptText).toContain("비밀을 노출");
  });

  it("estimatedTokens is positive when prompt is non-empty", async () => {
    const source = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": SOUL,
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(makeProfile({ soulMode: "summary" }), source);
    expect(report.estimatedTokens).toBeGreaterThan(0);
  });

  it("personaName override is respected", async () => {
    const source = createInMemoryPersonaSource({
      "agents/yohane/SOUL.md": "# Yohane soul",
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "summary", personaName: "yohane" }),
      source,
    );
    expect(report.personaName).toBe("yohane");
    expect(report.promptText).toContain("Yohane soul");
  });
});
