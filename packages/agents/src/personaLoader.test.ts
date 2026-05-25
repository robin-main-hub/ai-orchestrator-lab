import { describe, expect, it } from "vitest";
import type { AgentProfile } from "@ai-orchestrator/protocol";
import {
  buildPersonaPromptFragment,
  createInMemoryPersonaSource,
  inferModeFromConfigSource,
  loadPersona,
  personaNameForProfile,
  PersonaFragmentMissingError,
} from "./personaLoader";

const FIXTURE_FILES: Record<string, string> = {
  "agents/architect/SOUL.md": "# Architect Soul\n\n나는 설계자다.\n",
  "agents/architect/AGENTS.md": "# Architect AGENTS\n\n역할은 구조 설계.\n",
  "agents/reviewer/SOUL.md": "# Reviewer Soul\n\n나는 검토자다.\n",
  "agents/reviewer/AGENTS.md": "# Reviewer AGENTS\n\n역할은 합격/거부.\n",
  "agents/skeptic/SOUL.md": "# Skeptic Soul\n\n나는 회의자다.\n",
};

function source() {
  return createInMemoryPersonaSource(FIXTURE_FILES);
}

describe("inferModeFromConfigSource", () => {
  it("markdown → soul_plus_agents", () => {
    expect(inferModeFromConfigSource("markdown")).toBe("soul_plus_agents");
  });

  it("internal → off (embedded persona text, not files)", () => {
    expect(inferModeFromConfigSource("internal")).toBe("off");
  });

  it("off → off", () => {
    expect(inferModeFromConfigSource("off")).toBe("off");
  });
});

describe("personaNameForProfile", () => {
  it("uses role as directory name (1:1 mapping today)", () => {
    const profile: AgentProfile = {
      id: "agent_architect",
      name: "Architect",
      kind: "virtual",
      role: "architect",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
    };
    expect(personaNameForProfile(profile)).toBe("architect");
  });

  it("works for every role we ship a persona for", () => {
    const roles = ["orchestrator", "architect", "reviewer", "skeptic", "verifier", "memory_curator"] as const;
    for (const role of roles) {
      const profile: AgentProfile = {
        id: `agent_${role}`,
        name: role,
        kind: "virtual",
        role,
        soulMode: "summary",
        configSource: "markdown",
        enabled: true,
      };
      expect(personaNameForProfile(profile)).toBe(role);
    }
  });

  it("personaName override wins over role (multi-persona-per-role pattern)", () => {
    // Two skeptics — Asuka uses default (agents/skeptic/), Yohane
    // uses personaName: "yohane" → agents/yohane/. Tests that the
    // override path doesn't accidentally fall back to role.
    const asuka: AgentProfile = {
      id: "agent_skeptic",
      name: "Skeptic (Asuka)",
      kind: "virtual",
      role: "skeptic",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
    };
    const yohane: AgentProfile = {
      id: "agent_skeptic_yohane",
      name: "Idea Bank (Yohane)",
      kind: "virtual",
      role: "skeptic",
      personaName: "yohane",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
    };
    expect(personaNameForProfile(asuka)).toBe("skeptic");
    expect(personaNameForProfile(yohane)).toBe("yohane");
  });
});

describe("loadPersona", () => {
  it('mode="off" returns empty fragments and never touches the source', async () => {
    let touched = false;
    const watchful = createInMemoryPersonaSource({});
    const wrapped = {
      async readMarkdown(p: string) {
        touched = true;
        return watchful.readMarkdown(p);
      },
    };
    const loaded = await loadPersona("architect", "off", wrapped);
    expect(loaded.mode).toBe("off");
    expect(loaded.fragments).toHaveLength(0);
    expect(touched).toBe(false);
  });

  it('mode="soul_only" loads only SOUL.md', async () => {
    const loaded = await loadPersona("architect", "soul_only", source());
    expect(loaded.fragments).toHaveLength(1);
    expect(loaded.fragments[0]!.source).toBe("soul");
    expect(loaded.fragments[0]!.relativePath).toBe("agents/architect/SOUL.md");
    expect(loaded.fragments[0]!.content).toContain("나는 설계자다");
  });

  it('mode="agents_only" loads only AGENTS.md', async () => {
    const loaded = await loadPersona("architect", "agents_only", source());
    expect(loaded.fragments).toHaveLength(1);
    expect(loaded.fragments[0]!.source).toBe("agents");
    expect(loaded.fragments[0]!.relativePath).toBe("agents/architect/AGENTS.md");
  });

  it('mode="soul_plus_agents" loads SOUL first then AGENTS', async () => {
    const loaded = await loadPersona("reviewer", "soul_plus_agents", source());
    expect(loaded.fragments).toHaveLength(2);
    expect(loaded.fragments[0]!.source).toBe("soul");
    expect(loaded.fragments[1]!.source).toBe("agents");
    // load order is fixed: SOUL first, AGENTS second — caller can rely on it
    expect(loaded.fragments[0]!.relativePath).toBe("agents/reviewer/SOUL.md");
    expect(loaded.fragments[1]!.relativePath).toBe("agents/reviewer/AGENTS.md");
  });

  it("throws PersonaFragmentMissingError with both persona and path when SOUL.md missing", async () => {
    const empty = createInMemoryPersonaSource({});
    await expect(loadPersona("ghost", "soul_only", empty)).rejects.toThrow(
      PersonaFragmentMissingError,
    );
    try {
      await loadPersona("ghost", "soul_only", empty);
    } catch (err) {
      expect(err).toBeInstanceOf(PersonaFragmentMissingError);
      const typed = err as PersonaFragmentMissingError;
      expect(typed.personaName).toBe("ghost");
      expect(typed.relativePath).toBe("agents/ghost/SOUL.md");
      expect(typed.message).toContain("ghost");
      expect(typed.message).toContain("agents/ghost/SOUL.md");
    }
  });

  it("throws when soul_plus_agents has SOUL but no AGENTS.md", async () => {
    // skeptic fixture above only has SOUL.md, missing AGENTS.md
    await expect(loadPersona("skeptic", "soul_plus_agents", source())).rejects.toThrow(
      PersonaFragmentMissingError,
    );
  });

  it("propagates non-ENOENT errors instead of translating to PersonaFragmentMissingError", async () => {
    // a source that throws on access models a real filesystem error like EACCES
    const angry = {
      async readMarkdown(_p: string): Promise<string | null> {
        throw new Error("EACCES");
      },
    };
    await expect(loadPersona("architect", "soul_only", angry)).rejects.toThrow("EACCES");
    // and specifically NOT a PersonaFragmentMissingError
    await expect(loadPersona("architect", "soul_only", angry)).rejects.not.toBeInstanceOf(
      PersonaFragmentMissingError,
    );
  });
});

describe("buildPersonaPromptFragment", () => {
  it("returns empty string when fragments is empty (mode=off case)", async () => {
    const loaded = await loadPersona("architect", "off", source());
    expect(buildPersonaPromptFragment(loaded)).toBe("");
  });

  it("includes persona name as level-1 heading and each fragment with its path heading", async () => {
    const loaded = await loadPersona("architect", "soul_plus_agents", source());
    const fragment = buildPersonaPromptFragment(loaded);
    expect(fragment).toContain("# Persona: architect");
    expect(fragment).toContain("## From agents/architect/SOUL.md");
    expect(fragment).toContain("## From agents/architect/AGENTS.md");
    expect(fragment).toContain("나는 설계자다");
    expect(fragment).toContain("역할은 구조 설계");
  });

  it("preserves SOUL-before-AGENTS order in the assembled fragment", async () => {
    const loaded = await loadPersona("reviewer", "soul_plus_agents", source());
    const fragment = buildPersonaPromptFragment(loaded);
    expect(fragment.indexOf("나는 검토자다")).toBeLessThan(fragment.indexOf("역할은 합격/거부"));
  });

  it("can suppress fragment headings for tighter prompts", async () => {
    const loaded = await loadPersona("architect", "soul_only", source());
    const fragment = buildPersonaPromptFragment(loaded, { includeFragmentHeadings: false });
    expect(fragment).toContain("# Persona: architect");
    expect(fragment).not.toContain("## From agents/architect/SOUL.md");
    expect(fragment).toContain("나는 설계자다");
  });

  it("prepends headerLine when provided", async () => {
    const loaded = await loadPersona("architect", "soul_only", source());
    const fragment = buildPersonaPromptFragment(loaded, {
      headerLine: "[system] persona injection start",
    });
    expect(fragment.startsWith("[system] persona injection start")).toBe(true);
  });

  it("trims fragment content (drops trailing newlines that bloat the prompt)", async () => {
    const noisySource = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "# Architect Soul\n\nbody\n\n\n\n\n",
    });
    const loaded = await loadPersona("architect", "soul_only", noisySource);
    const fragment = buildPersonaPromptFragment(loaded);
    expect(fragment).not.toMatch(/\n{3,}$/);
  });
});

describe("createInMemoryPersonaSource", () => {
  it("returns null for unknown paths (so the loader can wrap as PersonaFragmentMissingError)", async () => {
    const src = createInMemoryPersonaSource({ "agents/x/SOUL.md": "x" });
    expect(await src.readMarkdown("agents/x/SOUL.md")).toBe("x");
    expect(await src.readMarkdown("agents/y/SOUL.md")).toBeNull();
  });

  it("does not confuse hasOwnProperty traps (prototype-pollution defense)", async () => {
    // a key like "__proto__" must NOT resolve via prototype chain
    const src = createInMemoryPersonaSource({ "real/file.md": "ok" });
    expect(await src.readMarkdown("__proto__")).toBeNull();
    expect(await src.readMarkdown("constructor")).toBeNull();
    expect(await src.readMarkdown("toString")).toBeNull();
  });
});
