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

// The named happy-path cases are covered above, but two branches stay unpinned
// and both are authority-relevant: (1) personaNameForProfile only ever runs with
// personaName UNSET (role fallback) — the R3.1 override (two profiles sharing one
// role routed to DISTINCT persona dirs) is the whole point of the field and is
// untested; a silent drop of the `?? profile.role` override would pass today.
// (2) inferModeFromConfigSource's default branch: an UNRECOGNIZED configSource
// must fall back to "off" (deny-by-default — never accidentally load markdown
// files for a config value we don't know), but only the 3 named cases are pinned.
describe("personaNameForProfile + inferModeFromConfigSource — identity routing & deny-by-default", () => {
  it("an explicit personaName overrides the role directory (R3.1 multi-profile-per-role routing)", () => {
    const base = {
      id: "agent_skeptic_yohane",
      name: "Yohane",
      kind: "virtual",
      role: "skeptic",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
    } as const;
    // two profiles, SAME role, DIFFERENT personaName → distinct persona dirs
    const yohane: AgentProfile = { ...base, personaName: "yohane" };
    const asuka: AgentProfile = { ...base, id: "agent_skeptic_asuka", personaName: "asuka" };
    expect(personaNameForProfile(yohane)).toBe("yohane"); // override, NOT "skeptic"
    expect(personaNameForProfile(asuka)).toBe("asuka");
    // the override is used verbatim even when it is not itself a shipped role name
    const exotic: AgentProfile = { ...base, personaName: "kurumi_nightcord" };
    expect(personaNameForProfile(exotic)).toBe("kurumi_nightcord");
  });

  it("an UNRECOGNIZED configSource falls back to off (deny-by-default — never auto-loads markdown)", () => {
    // anything outside the known enum must NOT resolve to a file-loading mode
    expect(inferModeFromConfigSource("totally_unknown" as AgentProfile["configSource"])).toBe("off");
    // sanity: the only value that DOES load files is the explicit "markdown"
    expect(inferModeFromConfigSource("markdown")).toBe("soul_plus_agents");
  });
});

describe("loadPersona", () => {
  it('mode="off" returns empty fragments and reads only SAFETY.md (universal injection)', async () => {
    const reads: string[] = [];
    const watchful = createInMemoryPersonaSource({});
    const wrapped = {
      async readMarkdown(p: string) {
        reads.push(p);
        return watchful.readMarkdown(p);
      },
    };
    const loaded = await loadPersona("architect", "off", wrapped);
    expect(loaded.mode).toBe("off");
    expect(loaded.fragments).toHaveLength(0);
    // SAFETY.md is universal — fetched even when persona body is off.
    // No persona-specific reads (SOUL.md / AGENTS.md) happen.
    expect(reads).toEqual(["agents/SAFETY.md"]);
    expect(loaded.safetyContent).toBeNull();
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

describe("loadPersona — SAFETY.md universal injection", () => {
  const SAFETY_BODY = "# SAFETY\n\nDGX-01 금기. secret 금기. permission gate 의무.\n";

  it("populates safetyContent when agents/SAFETY.md exists", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY_BODY,
      "agents/architect/SOUL.md": "# soul",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    expect(loaded.safetyContent).toBe(SAFETY_BODY);
  });

  it("safetyContent is null when agents/SAFETY.md is absent (loader does not throw)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "# soul",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    expect(loaded.safetyContent).toBeNull();
    // and persona fragments still load fine
    expect(loaded.fragments).toHaveLength(1);
  });

  it("SAFETY.md is loaded even when mode=off (caller can still inject safety alone)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY_BODY,
    });
    const loaded = await loadPersona("architect", "off", src);
    expect(loaded.fragments).toEqual([]);
    expect(loaded.safetyContent).toBe(SAFETY_BODY);
  });
});

describe("buildPersonaPromptFragment — SAFETY injection", () => {
  const SAFETY_BODY = "DGX-01 금기.\nsecret 금기.\npermission gate 의무.";

  it("auto-injects SAFETY as a top-level section before the persona body (default)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY_BODY,
      "agents/architect/SOUL.md": "나는 설계자다.",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    const out = buildPersonaPromptFragment(loaded);

    // Safety section appears
    expect(out).toContain("# System Safety Boundaries");
    expect(out).toContain("DGX-01 금기");
    // Persona section appears
    expect(out).toContain("# Persona: architect");
    expect(out).toContain("나는 설계자다");
    // Safety comes BEFORE persona (precedence: rules ⊃ character)
    expect(out.indexOf("# System Safety Boundaries")).toBeLessThan(
      out.indexOf("# Persona: architect"),
    );
  });

  it("respects omitSafety: true (debug / inspector use case)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY_BODY,
      "agents/architect/SOUL.md": "나는 설계자다.",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    const out = buildPersonaPromptFragment(loaded, { omitSafety: true });

    expect(out).not.toContain("# System Safety Boundaries");
    expect(out).not.toContain("DGX-01 금기");
    expect(out).toContain("# Persona: architect");
    expect(out).toContain("나는 설계자다");
  });

  it("when SAFETY.md is absent, output is identical to pre-SAFETY behavior (no empty section)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "나는 설계자다.",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    const out = buildPersonaPromptFragment(loaded);

    expect(out).not.toContain("# System Safety Boundaries");
    expect(out).toContain("# Persona: architect");
    expect(out).toContain("나는 설계자다");
  });

  it("mode=off + SAFETY present → output is SAFETY only (no persona section)", async () => {
    const src = createInMemoryPersonaSource({ "agents/SAFETY.md": SAFETY_BODY });
    const loaded = await loadPersona("architect", "off", src);
    const out = buildPersonaPromptFragment(loaded);

    expect(out).toContain("# System Safety Boundaries");
    expect(out).toContain("DGX-01 금기");
    expect(out).not.toContain("# Persona: architect");
  });

  it("mode=off + SAFETY absent → empty string (caller decides fallback)", async () => {
    const src = createInMemoryPersonaSource({});
    const loaded = await loadPersona("architect", "off", src);
    expect(buildPersonaPromptFragment(loaded)).toBe("");
  });

  it("headerLine still comes before everything (system tag stays at the top)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": SAFETY_BODY,
      "agents/architect/SOUL.md": "나는 설계자다.",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    const out = buildPersonaPromptFragment(loaded, {
      headerLine: "[system] persona injection start",
    });
    expect(out.startsWith("[system] persona injection start")).toBe(true);
    expect(out.indexOf("[system] persona injection start")).toBeLessThan(
      out.indexOf("# System Safety Boundaries"),
    );
  });

  it("safety content is trimmed (no trailing-newline bloat)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": `${SAFETY_BODY}\n\n\n\n`,
      "agents/architect/SOUL.md": "x",
    });
    const loaded = await loadPersona("architect", "soul_only", src);
    const out = buildPersonaPromptFragment(loaded);
    // No 3+ consecutive newlines between safety and persona
    expect(out).not.toMatch(/\n{3,}# Persona/);
  });
});

describe("loadPersona — optional IDENTITY.md / USER.md fragments", () => {
  it("loads IDENTITY.md when present (slotted before character body)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/kurumi/SOUL.md": "soul body",
      "agents/kurumi/AGENTS.md": "agents body",
      "agents/kurumi/IDENTITY.md": "# Identity\n\nWho am I.",
    });
    const loaded = await loadPersona("kurumi", "soul_plus_agents", src);
    const sources = loaded.fragments.map((f) => f.source);
    // IDENTITY first, then mandatory SOUL → AGENTS
    expect(sources).toEqual(["identity", "soul", "agents"]);
    expect(loaded.fragments[0]!.relativePath).toBe("agents/kurumi/IDENTITY.md");
  });

  it("loads USER.md when present (slotted after character body)", async () => {
    const src = createInMemoryPersonaSource({
      "agents/kurumi/SOUL.md": "soul body",
      "agents/kurumi/AGENTS.md": "agents body",
      "agents/kurumi/USER.md": "# User\n\nAbout 오빠.",
    });
    const loaded = await loadPersona("kurumi", "soul_plus_agents", src);
    const sources = loaded.fragments.map((f) => f.source);
    expect(sources).toEqual(["soul", "agents", "user"]);
  });

  it("loads IDENTITY + USER together in the canonical 4-file shape", async () => {
    const src = createInMemoryPersonaSource({
      "agents/kurumi/SOUL.md": "soul body",
      "agents/kurumi/AGENTS.md": "agents body",
      "agents/kurumi/IDENTITY.md": "identity body",
      "agents/kurumi/USER.md": "user body",
    });
    const loaded = await loadPersona("kurumi", "soul_plus_agents", src);
    const sources = loaded.fragments.map((f) => f.source);
    // identity → soul → agents → user
    expect(sources).toEqual(["identity", "soul", "agents", "user"]);
  });

  it("silently skips missing optional fragments (no PersonaFragmentMissingError)", async () => {
    // The 17 legacy personas don't have IDENTITY/USER. Loader must NOT
    // throw — it should just return the SOUL+AGENTS pair unchanged.
    const src = createInMemoryPersonaSource({
      "agents/architect/SOUL.md": "soul",
      "agents/architect/AGENTS.md": "agents",
    });
    const loaded = await loadPersona("architect", "soul_plus_agents", src);
    const sources = loaded.fragments.map((f) => f.source);
    expect(sources).toEqual(["soul", "agents"]);
  });

  it("still throws when a MANDATORY file is missing (regression guard)", async () => {
    // Only optional fragments are silently skipped. Missing SOUL/AGENTS
    // must still surface as PersonaFragmentMissingError.
    const src = createInMemoryPersonaSource({
      "agents/architect/AGENTS.md": "agents",
      "agents/architect/IDENTITY.md": "identity",
    });
    await expect(loadPersona("architect", "soul_plus_agents", src)).rejects.toBeInstanceOf(
      PersonaFragmentMissingError,
    );
  });
});

// Every optional-fragment test above runs in soul_plus_agents mode, so one
// branch stays unpinned: the optional IDENTITY/USER probe is INDEPENDENT of the
// mandatory mode — it runs for any non-off mode (soul_only / agents_only too),
// not only the 2-file character body. The flip side is least-privilege: a file
// that is mandatory in ANOTHER mode (AGENTS in soul_only, SOUL in agents_only)
// is NOT silently pulled in as an optional — only IDENTITY/USER are optional, so
// soul_only never loads AGENTS. Pin both, self-consistent (sources derived from
// which files the fixture provides + the mode's mandatory set).
describe("loadPersona — optional probe is mode-independent for any non-off mode", () => {
  it("soul_only still slots IDENTITY before / USER after the single SOUL, and does NOT pull in AGENTS", async () => {
    const src = createInMemoryPersonaSource({
      "agents/kurumi/SOUL.md": "soul body",
      "agents/kurumi/AGENTS.md": "agents body (not a soul_only mandatory)",
      "agents/kurumi/IDENTITY.md": "identity body",
      "agents/kurumi/USER.md": "user body",
    });
    const loaded = await loadPersona("kurumi", "soul_only", src);
    const sources = loaded.fragments.map((f) => f.source);
    expect(sources).toEqual(["identity", "soul", "user"]); // optionals wrap the lone mandatory SOUL
    // AGENTS is mandatory only in other modes and is not optional → never loaded here
    expect(loaded.fragments.some((f) => f.source === "agents")).toBe(false);
  });

  it("agents_only also picks up IDENTITY (optional probe independent of the mandatory set), without loading SOUL", async () => {
    const src = createInMemoryPersonaSource({
      "agents/kurumi/SOUL.md": "soul body (not an agents_only mandatory)",
      "agents/kurumi/AGENTS.md": "agents body",
      "agents/kurumi/IDENTITY.md": "identity body",
    });
    const loaded = await loadPersona("kurumi", "agents_only", src);
    const sources = loaded.fragments.map((f) => f.source);
    expect(sources).toEqual(["identity", "agents"]); // identity before the lone AGENTS; no USER fixture → skipped
    expect(loaded.fragments.some((f) => f.source === "soul")).toBe(false);
  });
});

describe("buildPersonaPromptFragment — 4-file companion (kurumi shape)", () => {
  it("renders all four fragments with their relativePath headings in order", async () => {
    const src = createInMemoryPersonaSource({
      "agents/SAFETY.md": "# Safety rules\n",
      "agents/kurumi/IDENTITY.md": "## who\nkurumi",
      "agents/kurumi/SOUL.md": "## voice\nplayful",
      "agents/kurumi/AGENTS.md": "## rules\nbe playful",
      "agents/kurumi/USER.md": "## user\n오빠",
    });
    const loaded = await loadPersona("kurumi", "soul_plus_agents", src);
    const out = buildPersonaPromptFragment(loaded);
    // Each fragment heading appears
    expect(out).toContain("## From agents/kurumi/IDENTITY.md");
    expect(out).toContain("## From agents/kurumi/SOUL.md");
    expect(out).toContain("## From agents/kurumi/AGENTS.md");
    expect(out).toContain("## From agents/kurumi/USER.md");
    // Order: IDENTITY before SOUL, SOUL before AGENTS, AGENTS before USER
    const idxId = out.indexOf("IDENTITY.md");
    const idxSoul = out.indexOf("SOUL.md");
    const idxAg = out.indexOf("AGENTS.md");
    const idxUser = out.indexOf("USER.md");
    expect(idxId).toBeLessThan(idxSoul);
    expect(idxSoul).toBeLessThan(idxAg);
    expect(idxAg).toBeLessThan(idxUser);
  });
});
