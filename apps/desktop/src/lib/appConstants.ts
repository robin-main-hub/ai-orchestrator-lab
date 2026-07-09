import type { WorkbenchAgent } from "../types";

export const modelWindowSize = 8;
export const maxDraftAttachments = 5;
export const agentVisualStorageKey = "ai-orchestrator-lab.agent-visuals.v1";
export const agentProfilesStorageKey = "ai-orchestrator-lab.agent-profiles.v1";
export const selectedAgentIdStorageKey = "ai-orchestrator-lab.selected-agent-id.v1";
export const providerProfilesStorageKey = "ai-orchestrator-lab.provider-profiles.v1";
export const legacyProviderSessionSecretsStorageKey = "ai-orchestrator-lab.provider-session-secrets.v1";
export const providerDefaultCredentialsStorageKey = "ai-orchestrator-lab.provider-default-credentials.v1";
export const providerProfilesSeedVersionKey = "ai-orchestrator-lab.provider-profiles.seed-version";
export const providerProfilesSeedVersion = "2026-07-09-rmas-dgx01-endpoint";
export const defaultObsidianVaultRoot = "F:/obsidian/ai-headquarter";

export const agentRoleOptions: WorkbenchAgent["role"][] = [
  "orchestrator",
  "architect",
  "builder",
  "reviewer",
  "skeptic",
  "verifier",
  "memory_curator",
  "executor",
  "external",
  "auditor",
];

export const now = new Date("2026-05-24T00:20:00.000+09:00").toISOString();
