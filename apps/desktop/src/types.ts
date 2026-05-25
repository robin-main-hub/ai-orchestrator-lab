import type { LucideIcon } from "lucide-react";
import type { AgentProfile, ConversationAttachment, DebateUtterance, ModelDescriptor } from "@ai-orchestrator/protocol";

export type CenterMode = "conversation" | "debate" | "tmux";
export type AgentActivityStatus = "idle" | "preparing" | "responding";
export type WorkbenchAgent = AgentProfile;
export type ModelCatalog = Record<string, ModelDescriptor[]>;
export type ProviderRegistrationMode = "api_key" | "cli" | "oauth";
export type AgentConfigTab = "profile" | "soul" | "agents_md" | "creativity" | "injection" | "preview" | "edit";
export type AgentVoicePreset = "direct" | "calm" | "architect" | "reviewer" | "executor";
export type AgentCreativityLevel = "strict" | "focused" | "balanced" | "creative" | "experimental";
export type DraftAttachment = ConversationAttachment;
export type PendingProviderRetry = {
  permissionItemId: string;
  providerProfileId: string;
  agentId: string;
  modelId: string;
  content: string;
  attachments: DraftAttachment[];
  createdAt: string;
};
export type Stage3DebateUtteranceView = DebateUtterance & {
  roundTitle: string;
  agentName: string;
};
export type AgentPersonaSettings = {
  voicePreset: AgentVoicePreset;
  creativityLevel: AgentCreativityLevel;
  agentsMdPath: string;
  soulMdPath: string;
  soulSummary: string;
  soulExampleDialogue: string;
  agentsInstruction: string;
  forbiddenStyle: string;
};
export type AgentVisualSettings = {
  avatarDataUrl?: string;
  avatarUpdatedAt?: string;
};
export type NavItemId = "sessions" | "projects" | "providers" | "config_files" | "channels" | "backup";
export type NavItem = {
  id: NavItemId;
  label: string;
  icon: LucideIcon;
};
export type AgentConfigFileKind = "soul" | "agents" | "skill" | "memory_policy" | "prompt_template";
export type AgentConfigFileScope = "global" | "project" | "agent";
export type AgentConfigFile = {
  id: string;
  kind: AgentConfigFileKind;
  label: string;
  scope: AgentConfigFileScope;
  path: string;
  tags: string[];
  version: number;
  linkedAgentIds: string[];
  updatedAt: string;
  body: string;
};
export type AgentProfilePack = {
  id: string;
  label: string;
  description: string;
  agentRole: WorkbenchAgent["role"];
  configFileIds: string[];
  tags: string[];
};
export type WindowAuditStatus = "ready" | "partial" | "blocked";
export type WindowAuditItem = {
  id: string;
  label: string;
  status: WindowAuditStatus;
  detail: string;
};
export type MetaOnboardingSignal = {
  id: string;
  label: string;
  status: WindowAuditStatus;
  suggestion: string;
};
