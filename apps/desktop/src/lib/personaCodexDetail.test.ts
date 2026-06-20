import { describe, expect, it } from "vitest";
import type { AgentProfile } from "@ai-orchestrator/protocol";
import type { HermesSlot } from "./hermesSlotPool";
import type { CodexEntry } from "./personaCodex";
import { buildCodexDetail, soulExcerptFromBundle } from "./personaCodexDetail";

function entry(over: Partial<CodexEntry> = {}): CodexEntry {
  return { personaName: "kurumi", displayName: "쿠루미", role: "companion", caption: "본체", ...over };
}

function profile(over: Partial<AgentProfile> = {}): AgentProfile {
  return {
    personaName: "kurumi",
    role: "companion",
    permissionLevel: "trusted",
    enabled: true,
    ...over,
  } as unknown as AgentProfile;
}

function slot(over: Partial<HermesSlot> = {}): HermesSlot {
  return { id: "slot_1", status: "bound", persona: "kurumi", needsReset: false, ...over };
}

// Characterization tests for the persona codex detail assembly (no behavior
// change). soulExcerptFromBundle reads agents/<persona>/SOUL.md, drops heading
// and blank lines, trims, joins with newlines and caps at the limit;
// buildCodexDetail folds a codex entry + injected bundle/slots/profiles into a
// detail (soul excerpt, declared permission/enabled, role→pane-role binding,
// sticky bound-slot id). These pin the excerpt filtering/limit and each detail
// field's resolution and fallbacks. All pure with injected deps.
describe("soulExcerptFromBundle", () => {
  it("returns empty when the bundle has no SOUL.md for the persona", () => {
    expect(soulExcerptFromBundle({}, "kurumi")).toBe("");
    expect(soulExcerptFromBundle({ "agents/other/SOUL.md": "x" }, "kurumi")).toBe("");
  });

  it("drops heading and blank lines, trims and joins the rest with newlines", () => {
    const bundle = { "agents/kurumi/SOUL.md": "# Title\n\n  First line  \n## Sub\nSecond line\n   \n" };
    expect(soulExcerptFromBundle(bundle, "kurumi")).toBe("First line\nSecond line");
  });

  it("caps the excerpt at the limit", () => {
    const bundle = { "agents/kurumi/SOUL.md": "abcdefghij" };
    expect(soulExcerptFromBundle(bundle, "kurumi", 5)).toBe("abcde");
  });

  it("stops accumulating once the limit is reached before adding the next line", () => {
    const bundle = { "agents/kurumi/SOUL.md": "aaa\nbbb" };
    expect(soulExcerptFromBundle(bundle, "kurumi", 3)).toBe("aaa");
  });
});

describe("buildCodexDetail", () => {
  const bundle = { "agents/kurumi/SOUL.md": "Kurumi soul intro" };

  it("assembles every field for a fully matched persona", () => {
    const detail = buildCodexDetail(entry(), {
      bundleMap: bundle,
      slots: [slot()],
      profiles: [profile()],
    });
    expect(detail.entry).toEqual(entry());
    expect(detail.soulExcerpt).toBe("Kurumi soul intro");
    expect(detail.permissionLevel).toBe("trusted");
    expect(detail.enabled).toBe(true);
    expect(detail.paneRole).toBe("orchestrator"); // companion → orchestrator station
    expect(detail.slotId).toBe("slot_1");
  });

  it("matches a profile by role when the persona name differs", () => {
    const detail = buildCodexDetail(entry({ personaName: "unmapped", role: "verifier" }), {
      bundleMap: {},
      slots: [],
      profiles: [profile({ personaName: "someone_else", role: "verifier", permissionLevel: "limited", enabled: false })],
    });
    expect(detail.permissionLevel).toBe("limited");
    expect(detail.enabled).toBe(false);
    expect(detail.paneRole).toBe("qa"); // verifier → qa station
  });

  it("leaves permission/enabled undefined when no profile matches", () => {
    const detail = buildCodexDetail(entry({ personaName: "ghost", role: "negotiator" }), {
      bundleMap: {},
      slots: [],
      profiles: [profile()],
    });
    expect(detail.permissionLevel).toBeUndefined();
    expect(detail.enabled).toBeUndefined();
    expect(detail.paneRole).toBeUndefined(); // negotiator has no pane station
  });

  it("binds the slot id only for a bound slot matching the persona", () => {
    const spareSlot = buildCodexDetail(entry(), {
      bundleMap: {},
      slots: [slot({ status: "spare" })],
      profiles: [],
    });
    expect(spareSlot.slotId).toBeUndefined();

    const otherPersona = buildCodexDetail(entry(), {
      bundleMap: {},
      slots: [slot({ persona: "someone_else" })],
      profiles: [],
    });
    expect(otherPersona.slotId).toBeUndefined();
  });
});
