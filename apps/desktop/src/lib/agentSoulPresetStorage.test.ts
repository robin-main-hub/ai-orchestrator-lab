import { describe, expect, it } from "vitest";
import type { AgentPersonaSettings } from "../types";
import {
  createSoulPresetFromPersona,
  getSoulPresetsForAgent,
  parseAgentSoulPresetState,
  upsertSoulPreset,
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
