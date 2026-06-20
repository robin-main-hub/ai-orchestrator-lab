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

  it("builds the markdown persona configuration used by agent settings into the system prompt", async () => {
    const source = createInMemoryPersonaSource({
      "agents/yohane/SOUL.md": "# Yohane soul\n4차원 아이디어 뱅크 관점.",
      "agents/yohane/AGENTS.md": "# Yohane rules\n새 아이디어와 반례를 함께 낸다.",
      "agents/SAFETY.md": SAFETY,
    });

    const report = await buildAgentSystemPrompt(
      makeProfile({
        configSource: "markdown",
        personaName: "yohane",
        soulMode: "full",
      }),
      source,
    );

    expect(report.personaName).toBe("yohane");
    expect(report.mode).toBe("full");
    expect(report.fragmentsInjected).toEqual([
      "agents/yohane/SOUL.md",
      "agents/yohane/AGENTS.md",
    ]);
    expect(report.promptText).toContain("비밀을 노출하지 말 것");
    expect(report.promptText).toContain("4차원 아이디어 뱅크 관점");
    expect(report.promptText).toContain("새 아이디어와 반례를 함께 낸다");
  });

  it("falls back to canonical profile if custom persona files are missing", async () => {
    const source = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "# Canonical Architect Soul",
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "summary", personaName: "yohane", role: "architect" }),
      source,
    );
    expect(report.personaName).toBe("architect");
    expect(report.mode).toBe("summary");
    expect(report.promptText).toContain("Canonical Architect Soul");
    expect(report.fragmentsInjected).toEqual(["agents/architect/SOUL.md"]);
  });

  it("falls back to off mode if canonical profile files are also missing", async () => {
    const source = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "summary", personaName: "yohane", role: "architect" }),
      source,
    );
    expect(report.personaName).toBe("architect");
    expect(report.mode).toBe("off");
    expect(report.fragmentsInjected).toHaveLength(0);
    expect(report.promptText).toContain("비밀을 노출");
  });

  it("does not hide non-missing canonical persona read failures", async () => {
    const source = {
      async readMarkdown(relativePath: string) {
        if (relativePath === "agents/SAFETY.md") return SAFETY;
        if (relativePath === "agents/yohane/SOUL.md") return null;
        if (relativePath === "agents/architect/SOUL.md") {
          throw new Error("permission denied");
        }
        return null;
      },
    };

    await expect(
      buildAgentSystemPrompt(
        makeProfile({ soulMode: "summary", personaName: "yohane", role: "architect" }),
        source,
      ),
    ).rejects.toThrow("permission denied");
  });

  it("falls back to the canonical companion persona directory", async () => {
    const source = createInMemoryPersonaSource({
      "agents/kurumi/SOUL.md": "# Kurumi Soul",
      "agents/kurumi/AGENTS.md": "# Kurumi Rules",
      "agents/SAFETY.md": SAFETY,
    });

    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "summary", personaName: "missing_companion", role: "companion" }),
      source,
    );

    expect(report.personaName).toBe("kurumi");
    expect(report.mode).toBe("full");
    expect(report.fragmentsInjected).toEqual([
      "agents/kurumi/SOUL.md",
      "agents/kurumi/AGENTS.md",
    ]);
  });
});

// The fallback chain is exercised above only for role=architect (→ the default
// "summary" branch of getCanonicalSoulMode) and role=companion (→ "full"). The
// remaining role-policy branches stay unpinned: the RETRIEVED-role set
// (reviewer/external/auditor/researcher/domain_expert) and the EXECUTOR → "off"
// branch. These encode a real rule — when the custom persona is missing, the
// role's CANONICAL soul mode is adopted and that policy OVERRIDES whatever mode
// the profile requested (a reviewer asking for "full" still collapses to
// retrieved→soul_only; an executor asking for "full" still gets "off" with no
// soul, even when its SOUL.md exists). Pin them, self-consistent (the canonical
// role directory + the mode the role policy forces).
describe("buildAgentSystemPrompt — role-policy fallback modes (getCanonicalSoulMode)", () => {
  const SAFETY = "# Safety\n비밀을 노출하지 말 것.";

  it("a reviewer's missing custom persona adopts RETRIEVED (soul_only) — role policy overrides the requested full", async () => {
    const source = createInMemoryPersonaSource({
      "agents/reviewer/SOUL.md": "# Reviewer Soul",
      "agents/reviewer/AGENTS.md": "# Reviewer Rules",
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "full", personaName: "missing_reviewer", role: "reviewer" }),
      source,
    );
    expect(report.personaName).toBe("reviewer");
    expect(report.mode).toBe("retrieved"); // canonical role policy beats the requested "full"
    // retrieved collapses to soul_only → SOUL injected, AGENTS withheld
    expect(report.fragmentsInjected).toEqual(["agents/reviewer/SOUL.md"]);
    expect(report.promptText).not.toContain("Reviewer Rules");
  });

  it("a domain_expert's missing custom persona also adopts RETRIEVED (the retrieved set is not just reviewer)", async () => {
    const source = createInMemoryPersonaSource({
      "agents/domain_expert/SOUL.md": "# Domain Expert Soul",
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "summary", personaName: "missing_de", role: "domain_expert" }),
      source,
    );
    expect(report.personaName).toBe("domain_expert");
    expect(report.mode).toBe("retrieved");
    expect(report.fragmentsInjected).toEqual(["agents/domain_expert/SOUL.md"]);
  });

  it("an executor's canonical mode is OFF — a present SOUL.md is NOT injected (deny-by-default), safety still is", async () => {
    const source = createInMemoryPersonaSource({
      "agents/executor/SOUL.md": "# Executor Soul (must stay out)",
      "agents/SAFETY.md": SAFETY,
    });
    const report = await buildAgentSystemPrompt(
      makeProfile({ soulMode: "full", personaName: "missing_exec", role: "executor" }),
      source,
    );
    expect(report.personaName).toBe("executor");
    expect(report.mode).toBe("off"); // role policy forces off despite the requested "full"
    expect(report.fragmentsInjected).toHaveLength(0); // SOUL present but withheld
    expect(report.promptText).not.toContain("Executor Soul");
    expect(report.promptText).toContain("비밀을 노출"); // safety boundary still injected
  });
});
