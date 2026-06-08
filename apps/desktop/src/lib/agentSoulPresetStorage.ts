import type { AgentPersonaSettings, AgentVoicePreset } from "../types";

export const agentSoulPresetStorageKey = "ai-orchestrator.agent-soul-presets.v1";

export type AgentSoulPreset = Pick<
  AgentPersonaSettings,
  "forbiddenStyle" | "soulExampleDialogue" | "soulMdPath" | "soulSummary" | "voicePreset"
> & {
  agentId: string;
  id: string;
  label: string;
  savedAt: string;
};

export type AgentSoulPresetState = {
  presets: AgentSoulPreset[];
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function createSoulPresetFromPersona({
  agentId,
  label,
  persona,
  savedAt = new Date().toISOString(),
}: {
  agentId: string;
  label: string;
  persona: AgentPersonaSettings;
  savedAt?: string;
}): AgentSoulPreset {
  return {
    agentId,
    forbiddenStyle: persona.forbiddenStyle,
    id: createSoulPresetId(agentId, label, savedAt),
    label: label.trim() || "Soul 저장본",
    savedAt,
    soulExampleDialogue: persona.soulExampleDialogue,
    soulMdPath: persona.soulMdPath,
    soulSummary: persona.soulSummary,
    voicePreset: persona.voicePreset,
  };
}

export function parseAgentSoulPresetState(value: unknown): AgentSoulPresetState {
  if (!isRecord(value) || !Array.isArray(value.presets)) {
    return { presets: [] };
  }

  return {
    presets: value.presets.filter(isAgentSoulPreset),
  };
}

export function getSoulPresetsForAgent(state: AgentSoulPresetState, agentId: string): AgentSoulPreset[] {
  return state.presets
    .filter((preset) => preset.agentId === agentId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function upsertSoulPreset(state: AgentSoulPresetState, preset: AgentSoulPreset): AgentSoulPresetState {
  return {
    presets: [
      preset,
      ...state.presets.filter((existing) => existing.id !== preset.id),
    ].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
  };
}

export function applySoulPresetToPersona(preset: AgentSoulPreset): Partial<AgentPersonaSettings> {
  return {
    forbiddenStyle: preset.forbiddenStyle,
    soulExampleDialogue: preset.soulExampleDialogue,
    soulMdPath: preset.soulMdPath,
    soulSummary: preset.soulSummary,
    voicePreset: preset.voicePreset,
  };
}

export function readAgentSoulPresetState(storage = getBrowserStorage()): AgentSoulPresetState {
  if (!storage) {
    return { presets: [] };
  }

  const raw = storage.getItem(agentSoulPresetStorageKey);
  if (!raw) {
    return { presets: [] };
  }

  try {
    return parseAgentSoulPresetState(JSON.parse(raw));
  } catch {
    storage.removeItem(agentSoulPresetStorageKey);
    return { presets: [] };
  }
}

export function writeAgentSoulPresetState(state: AgentSoulPresetState, storage = getBrowserStorage()) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(agentSoulPresetStorageKey, JSON.stringify(parseAgentSoulPresetState(state)));
  } catch {
    // Storage quota or private-mode failures should never break Soul editing.
  }
}

function createSoulPresetId(agentId: string, label: string, savedAt: string) {
  const normalized = `${agentId}-${label}-${savedAt}`.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
  return `soul_preset_${normalized || "default"}`;
}

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAgentSoulPreset(value: unknown): value is AgentSoulPreset {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.agentId === "string" &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.savedAt === "string" &&
    typeof value.soulMdPath === "string" &&
    typeof value.soulSummary === "string" &&
    typeof value.soulExampleDialogue === "string" &&
    typeof value.forbiddenStyle === "string" &&
    isAgentVoicePreset(value.voicePreset)
  );
}

function isAgentVoicePreset(value: unknown): value is AgentVoicePreset {
  return value === "direct" || value === "calm" || value === "architect" || value === "reviewer" || value === "executor";
}
