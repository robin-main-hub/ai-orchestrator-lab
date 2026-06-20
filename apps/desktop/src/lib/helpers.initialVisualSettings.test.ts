// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchAgent } from "../types";
import { createInitialAgentVisualSettings } from "./helpers";
import { getPersonaAvatarUrl } from "./personaAvatars";
import { agentVisualStorageKey } from "./appConstants";

// Characterization tests (no behavior change) for createInitialAgentVisualSettings,
// a previously-unasserted export in helpers.ts (the existing helpers.test.ts /
// helpersAgentIdentity.test.ts / helpers.draftAttachment.test.ts / persona-default
// suites never touch the two-layer avatar resolver).
//
// The function builds each agent's AgentVisualSettings from two precedence layers:
//   Layer 1 (lowest): bundled persona avatar from agents/<personaName|role>/avatar.*
//   Layer 2 (highest): localStorage-stored user uploads.
// The load-bearing invariant — spelled out in the source comment — is the PER-KEY
// DEEP MERGE: a stored EMPTY entry ({}) (written by add-agent / clear-avatar / runs
// predating the bundled avatar.* files) must NOT shadow the bundled fallback, while
// a stored avatarDataUrl still wins. Plus the SSR/no-window and corrupt-JSON guards
// must both degrade to the bundled defaults rather than throw.
//
// We drive it through the public seam with one agent that HAS a bundled avatar
// (role "orchestrator" → agents/orchestrator/avatar.png) and one that does NOT
// (role "companion" → no agents/companion dir). Expected bundled URLs are derived
// from getPersonaAvatarUrl so the test stays self-consistent with the asset glob.

function makeAgent(overrides: Partial<WorkbenchAgent> & { id: string; role: WorkbenchAgent["role"] }): WorkbenchAgent {
  return {
    name: "Agent",
    kind: "virtual",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    ...overrides,
  };
}

// "orchestrator" dir ships an avatar.png; "companion" has no agents/ dir.
const AGENT_WITH_AVATAR = makeAgent({ id: "a_bundled", role: "orchestrator" });
const AGENT_NO_AVATAR = makeAgent({ id: "a_plain", role: "companion" });
const AGENTS = [AGENT_WITH_AVATAR, AGENT_NO_AVATAR];

const BUNDLED_URL = getPersonaAvatarUrl("orchestrator");

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("createInitialAgentVisualSettings", () => {
  it("guards: the bundled-avatar fixture genuinely resolves a URL and the other does not", () => {
    expect(BUNDLED_URL).toBeTruthy();
    expect(getPersonaAvatarUrl("companion")).toBeUndefined();
  });

  it("with no stored visuals, seeds each agent from the bundled avatar layer", () => {
    const result = createInitialAgentVisualSettings(AGENTS);
    expect(result["a_bundled"]).toEqual({ avatarDataUrl: BUNDLED_URL });
    expect(result["a_plain"]).toEqual({});
  });

  it("does NOT let a stored EMPTY entry shadow the bundled fallback (per-key deep merge)", () => {
    window.localStorage.setItem(agentVisualStorageKey, JSON.stringify({ a_bundled: {} }));
    const result = createInitialAgentVisualSettings(AGENTS);
    // the empty stored entry merges OVER the bundled default, preserving it
    expect(result["a_bundled"]).toEqual({ avatarDataUrl: BUNDLED_URL });
  });

  it("lets a stored avatarDataUrl win over the bundled fallback", () => {
    const userUpload = "data:image/png;base64,USERUPLOAD";
    window.localStorage.setItem(agentVisualStorageKey, JSON.stringify({ a_bundled: { avatarDataUrl: userUpload } }));
    const result = createInitialAgentVisualSettings(AGENTS);
    expect(result["a_bundled"]).toEqual({ avatarDataUrl: userUpload });
  });

  it("merges stored entries for ids beyond the agent list (parsed keys all flow through)", () => {
    window.localStorage.setItem(agentVisualStorageKey, JSON.stringify({ ghost: { avatarDataUrl: "data:x" } }));
    const result = createInitialAgentVisualSettings(AGENTS);
    expect(result["ghost"]).toEqual({ avatarDataUrl: "data:x" });
    // agents without a stored override keep their bundled defaults
    expect(result["a_bundled"]).toEqual({ avatarDataUrl: BUNDLED_URL });
  });

  it("falls back to the bundled defaults when the stored payload is corrupt JSON", () => {
    window.localStorage.setItem(agentVisualStorageKey, "not json{");
    const result = createInitialAgentVisualSettings(AGENTS);
    expect(result["a_bundled"]).toEqual({ avatarDataUrl: BUNDLED_URL });
    expect(result["a_plain"]).toEqual({});
  });

  it("is SSR-safe: with no window it returns the bundled defaults without reading storage", () => {
    window.localStorage.setItem(agentVisualStorageKey, JSON.stringify({ a_bundled: { avatarDataUrl: "data:should-be-ignored" } }));
    vi.stubGlobal("window", undefined);
    const result = createInitialAgentVisualSettings(AGENTS);
    expect(result["a_bundled"]).toEqual({ avatarDataUrl: BUNDLED_URL });
    expect(result["a_plain"]).toEqual({});
  });
});
