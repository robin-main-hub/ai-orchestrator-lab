import { describe, expect, it } from "vitest";
import type { AgentPersonaSettings } from "../types";
import {
  agentSoulPresetStorageKey,
  applySoulPresetToPersona,
  createSoulPresetFromPersona,
  getSoulPresetsForAgent,
  parseAgentSoulPresetState,
  readAgentSoulPresetState,
  upsertSoulPreset,
  writeAgentSoulPresetState,
} from "./agentSoulPresetStorage";

const persona: AgentPersonaSettings = {
  agentsInstruction: "한국어로만 보고한다.",
  agentsMdPath: "agents/makima/AGENTS.md",
  creativityLevel: "balanced",
  forbiddenStyle: "차가운 시스템 안내문",
  soulExampleDialogue: "사용자: 빠르게 해줘\n마키마: 범위 고정 후 바로 처리합니다.",
  soulMdPath: "agents/makima/SOUL.md",
  soulSummary: "# Makima Soul\n침착하고 지휘적인 말투.",
  voicePreset: "direct",
};

describe("agentSoulPresetStorage", () => {
  it("현재 persona에서 Soul 적용용 프리셋을 만든다", () => {
    const preset = createSoulPresetFromPersona({
      agentId: "agent_makima",
      label: "마키마 기본 소울",
      persona,
      savedAt: "2026-06-07T17:50:00.000Z",
    });

    expect(preset).toMatchObject({
      agentId: "agent_makima",
      label: "마키마 기본 소울",
      savedAt: "2026-06-07T17:50:00.000Z",
      soulMdPath: "agents/makima/SOUL.md",
      soulSummary: "# Makima Soul\n침착하고 지휘적인 말투.",
      soulExampleDialogue: "사용자: 빠르게 해줘\n마키마: 범위 고정 후 바로 처리합니다.",
      voicePreset: "direct",
      forbiddenStyle: "차가운 시스템 안내문",
    });
  });

  it("에이전트별 저장본을 분리하고 최신 저장본을 위로 올린다", () => {
    const first = createSoulPresetFromPersona({
      agentId: "agent_makima",
      label: "첫 저장본",
      persona,
      savedAt: "2026-06-07T17:50:00.000Z",
    });
    const second = createSoulPresetFromPersona({
      agentId: "agent_makima",
      label: "둘째 저장본",
      persona: { ...persona, soulSummary: "두 번째 소울" },
      savedAt: "2026-06-07T17:55:00.000Z",
    });

    const state = upsertSoulPreset(
      upsertSoulPreset(
        { presets: [] },
        first,
      ),
      second,
    );

    expect(getSoulPresetsForAgent(state, "agent_makima").map((preset) => preset.label)).toEqual([
      "둘째 저장본",
      "첫 저장본",
    ]);
    expect(getSoulPresetsForAgent(state, "agent_other")).toEqual([]);
  });

  it("깨진 저장값은 빈 상태로 복원한다", () => {
    expect(parseAgentSoulPresetState({ presets: "bad" })).toEqual({ presets: [] });
    expect(parseAgentSoulPresetState({ presets: [{ agentId: "agent_makima" }] })).toEqual({ presets: [] });
  });
});

// Characterization tests (no behavior change) for the previously-unasserted exports
// applySoulPresetToPersona, readAgentSoulPresetState, writeAgentSoulPresetState and the
// storage key constant. The block above drives the in-memory helpers; these pin the
// persona-projection and the storage seam (via an injected fake — no real localStorage).
// Load-bearing contract:
//   - applySoulPresetToPersona projects ONLY the 5 Soul fields back into persona and NEVER
//     leaks the preset's identity/metadata (agentId/id/label/savedAt) into persona state;
//   - read/write use exactly agentSoulPresetStorageKey, roundtrip through validation, and
//     a write RE-VALIDATES (junk presets are filtered before persisting);
//   - corrupt JSON self-heals: read removes the bad key and returns empty;
//   - a missing storage (undefined) is a safe no-op / empty, never a throw.
describe("applySoulPresetToPersona / storage seam", () => {
  const SOUL_FIELDS = [
    "forbiddenStyle",
    "soulExampleDialogue",
    "soulMdPath",
    "soulSummary",
    "voicePreset",
  ] as const;

  const memStorage = (seed: Record<string, string> = {}) => {
    const map = new Map(Object.entries(seed));
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
  };

  const samplePreset = (savedAt = "2026-06-07T17:50:00.000Z") =>
    createSoulPresetFromPersona({ agentId: "agent_makima", label: "기본", persona, savedAt });

  it("projects only the 5 Soul fields and never leaks preset identity/metadata", () => {
    const preset = samplePreset();
    const partial = applySoulPresetToPersona(preset);
    expect([...Object.keys(partial)].sort()).toEqual([...SOUL_FIELDS].sort());
    for (const leaked of ["agentId", "id", "label", "savedAt"]) {
      expect(partial).not.toHaveProperty(leaked);
    }
    // values are carried straight through from the preset
    expect(partial.soulSummary).toBe(preset.soulSummary);
    expect(partial.voicePreset).toBe(preset.voicePreset);
    expect(partial.forbiddenStyle).toBe(preset.forbiddenStyle);
  });

  it("write→read roundtrips through validation under the documented key", () => {
    const storage = memStorage();
    const state = upsertSoulPreset({ presets: [] }, samplePreset());
    writeAgentSoulPresetState(state, storage);
    // persisted under exactly the storage key constant
    expect(storage.map.has(agentSoulPresetStorageKey)).toBe(true);
    expect(readAgentSoulPresetState(storage)).toEqual(state);
  });

  it("write RE-VALIDATES — junk presets are filtered before persisting", () => {
    const storage = memStorage();
    const valid = samplePreset();
    // a junk entry slipped into the state must not survive the write
    writeAgentSoulPresetState({ presets: [valid, { agentId: "x" } as never] }, storage);
    expect(readAgentSoulPresetState(storage)).toEqual({ presets: [valid] });
  });

  it("corrupt JSON self-heals: read removes the bad key and returns empty", () => {
    const storage = memStorage({ [agentSoulPresetStorageKey]: "{not json" });
    expect(readAgentSoulPresetState(storage)).toEqual({ presets: [] });
    expect(storage.map.has(agentSoulPresetStorageKey)).toBe(false); // bad value evicted
  });

  it("missing storage is a safe empty/no-op, never a throw", () => {
    expect(readAgentSoulPresetState(undefined)).toEqual({ presets: [] });
    expect(() => writeAgentSoulPresetState({ presets: [samplePreset()] }, undefined)).not.toThrow();
  });
});
