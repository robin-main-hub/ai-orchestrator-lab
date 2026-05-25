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

  it("findFirstExisting returns the first candidate that's a key, in call-order", async () => {
    const src = createInMemoryPersonaSource({
      "agents/x/avatar.png": "binary blob ignored",
      "agents/x/avatar.svg": "svg body ignored",
    });
    expect(
      await src.findFirstExisting!(["agents/x/avatar.svg", "agents/x/avatar.png"]),
    ).toBe("agents/x/avatar.svg");
    expect(
      await src.findFirstExisting!(["agents/x/avatar.png", "agents/x/avatar.svg"]),
    ).toBe("agents/x/avatar.png");
  });

  it("findFirstExisting returns null when no candidate exists", async () => {
    const src = createInMemoryPersonaSource({});
    expect(
      await src.findFirstExisting!(["agents/ghost/avatar.svg", "agents/ghost/avatar.png"]),
    ).toBeNull();
  });
});

describe("loadPersona — asset discovery (avatar, background)", () => {
  it("populates avatarPath when agents/<name>/avatar.svg exists", async () => {
    const src = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "# soul",
      "agents/architect/AGENTS.md": "# agents",
      "agents/architect/avatar.svg": "<svg/>",
    });
    const loaded = await loadPersona("architect", "soul_plus_agents", src);
    expect(loaded.avatarPath).toBe("agents/architect/avatar.svg");
  });

  it("avatarPath is null when no avatar.* file exists", async () => {
    const src = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "# soul",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    expect(loaded.avatarPath).toBeNull();
  });

  it("tries SVG first, falls through to other extensions when SVG missing", async () => {
    const src = createInMemoryPersonaSource({
      "agents/x/SOUL.md": "# x",
      // No SVG; PNG is the first extension actually present.
      "agents/x/avatar.png": "png bytes",
      "agents/x/avatar.webp": "webp bytes",
    });
    const loaded = await loadPersona("x", "soul_only", src);
    expect(loaded.avatarPath).toBe("agents/x/avatar.png");
  });

  it("user-dropped real photo (avatar.jpg) wins when SVG placeholder is absent", async () => {
    const src = createInMemoryPersonaSource({
      "agents/portrait/SOUL.md": "# portrait",
      "agents/portrait/avatar.jpg": "jpeg bytes",
    });
    const loaded = await loadPersona("portrait", "soul_only", src);
    expect(loaded.avatarPath).toBe("agents/portrait/avatar.jpg");
  });

  it("chatBackgroundPath is populated when agents/<name>/background.* exists", async () => {
    const src = createInMemoryPersonaSource({
      "agents/cozy/SOUL.md": "# cozy",
      "agents/cozy/background.webp": "webp bytes",
    });
    const loaded = await loadPersona("cozy", "soul_only", src);
    expect(loaded.chatBackgroundPath).toBe("agents/cozy/background.webp");
  });

  it("chatBackgroundPath is null when no background.* exists (mobile falls back to user-uploaded image)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "# soul",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    expect(loaded.chatBackgroundPath).toBeNull();
  });

  it("mode=off still discovers avatar + background (renderer wants the face even without markdown injection)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/architect/avatar.svg": "<svg/>",
      "agents/architect/background.png": "png bytes",
      // no SOUL.md or AGENTS.md needed for off mode
    });
    const loaded = await loadPersona("architect", "off", src);
    expect(loaded.fragments).toEqual([]);
    expect(loaded.avatarPath).toBe("agents/architect/avatar.svg");
    expect(loaded.chatBackgroundPath).toBe("agents/architect/background.png");
  });

  it("source without findFirstExisting cleanly returns null for both asset paths", async () => {
    // A minimal source — markdown-only, no asset discovery support.
    const minimal = {
      async readMarkdown(p: string) {
        return p === "agents/x/SOUL.md" ? "# x" : null;
      },
    };
    const loaded = await loadPersona("x", "soul_only", minimal);
    expect(loaded.fragments).toHaveLength(1);
    expect(loaded.avatarPath).toBeNull();
    expect(loaded.chatBackgroundPath).toBeNull();
  });
});
