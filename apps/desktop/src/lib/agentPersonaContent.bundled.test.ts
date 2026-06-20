import { describe, expect, it } from "vitest";
import {
  getBundledAgentPersonaContent,
  getBundledAgentPersonaContentByPath,
  getBundledAgentSafetyContent,
  listBundledAgentPersonaContent,
} from "./agentPersonaContent";

// Characterization tests (no behavior change) for the four bundled-persona
// accessors in agentPersonaContent.ts, none of which are pinned elsewhere. The
// module eager-loads agents/<dir>/{AGENTS,SOUL,...}.md + agents/SAFETY.md via
// import.meta.glob, folding them into a directory-keyed Record at import time.
// The repo bundles 18 agent dirs (each with AGENTS.md + SOUL.md) + SAFETY.md,
// so the lookup tables are deterministic here. We pin: the undefined guards,
// the byPath regex non-match arm, the AGENTS->agentsMd / SOUL->soulMd routing
// branches (against whatever the glob bundled, not a hard-coded name), the
// listing/lookup consistency, and the memoized SAFETY content.

describe("getBundledAgentPersonaContent", () => {
  it("returns undefined for an absent directory name (guard arm)", () => {
    expect(getBundledAgentPersonaContent(undefined)).toBeUndefined();
    expect(getBundledAgentPersonaContent("not_a_real_agent_dir")).toBeUndefined();
  });

  it("returns the same record reference listBundledAgentPersonaContent exposes", () => {
    const listed = listBundledAgentPersonaContent();
    const [firstDir] = Object.keys(listed);
    expect(firstDir, "expected at least one bundled agent dir").toBeTruthy();
    expect(getBundledAgentPersonaContent(firstDir)).toBe(listed[firstDir!]);
  });
});

describe("listBundledAgentPersonaContent", () => {
  it("exposes a populated directory-keyed persona record", () => {
    const listed = listBundledAgentPersonaContent();
    expect(Object.keys(listed).length).toBeGreaterThanOrEqual(17);
    for (const [dir, content] of Object.entries(listed)) {
      expect(dir, dir).toBeTruthy();
      expect(typeof content, dir).toBe("object");
    }
  });
});

describe("getBundledAgentPersonaContentByPath", () => {
  it("returns undefined for a missing or non-AGENTS/SOUL path (no-match arm)", () => {
    expect(getBundledAgentPersonaContentByPath(undefined)).toBeUndefined();
    // USER.md is bundled but not exposed through the byPath regex (AGENTS|SOUL only).
    const [firstDir] = Object.keys(listBundledAgentPersonaContent());
    expect(getBundledAgentPersonaContentByPath(`agents/${firstDir}/USER.md`)).toBeUndefined();
    expect(getBundledAgentPersonaContentByPath("totally/unrelated/path.md")).toBeUndefined();
  });

  it("routes an AGENTS path to agentsMd and a SOUL path to soulMd", () => {
    const listed = listBundledAgentPersonaContent();
    const agentsDir = Object.keys(listed).find((dir) => listed[dir]!.agentsMd !== undefined);
    const soulDir = Object.keys(listed).find((dir) => listed[dir]!.soulMd !== undefined);
    expect(agentsDir, "expected a bundled AGENTS.md").toBeTruthy();
    expect(soulDir, "expected a bundled SOUL.md").toBeTruthy();

    expect(getBundledAgentPersonaContentByPath(`agents/${agentsDir}/AGENTS.md`)).toBe(
      getBundledAgentPersonaContent(agentsDir)!.agentsMd,
    );
    expect(getBundledAgentPersonaContentByPath(`agents/${soulDir}/SOUL.md`)).toBe(
      getBundledAgentPersonaContent(soulDir)!.soulMd,
    );
  });
});

describe("getBundledAgentSafetyContent", () => {
  it("returns the memoized SAFETY.md body, stable across calls", () => {
    const safety = getBundledAgentSafetyContent();
    expect(typeof safety).toBe("string");
    expect(safety!.length).toBeGreaterThan(0);
    expect(getBundledAgentSafetyContent()).toBe(safety);
  });
});
