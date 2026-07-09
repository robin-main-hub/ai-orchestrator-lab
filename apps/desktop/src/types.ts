import type { LucideIcon } from "lucide-react";
import type { AgentProfile, ConversationAttachment, DebateUtterance, ModelDescriptor } from "@ai-orchestrator/protocol";
import type { AttachmentProcessingPlan } from "./lib/attachmentProcessing";

export type CenterMode = "conversation" | "debate" | "tmux" | "cockpit" | "annex";
export type AgentActivityStatus =
  | "idle"
  | "preparing"
  | "tooling"
  | "capturing"
  | "dispatching"
  | "testing"
  | "waiting_approval"
  | "responding"
  | "error";
export type WorkbenchAgent = AgentProfile;
export type ModelCatalog = Record<string, ModelDescriptor[]>;
export type ProviderRegistrationMode = "api_key" | "cli" | "oauth";
export type AgentConfigTab = "profile" | "soul" | "agents_md" | "creativity" | "injection" | "preview" | "edit";
export type AgentVoicePreset = "direct" | "calm" | "architect" | "reviewer" | "executor";
export type AgentCreativityLevel = "strict" | "focused" | "balanced" | "creative" | "experimental";
export type DraftAttachment = ConversationAttachment & {
  processingMode?: AttachmentProcessingPlan["processingMode"];
  processingStatus?: AttachmentProcessingPlan["status"];
  processingReason?: string;
};
export type PendingProviderRetry = {
  permissionItemId: string;
  sessionId: string;
  providerProfileId: string;
  agentId: string;
  modelId: string;
  content: string;
  attachments: DraftAttachment[];
  attachmentProcessingPlans: AttachmentProcessingPlan[];
  createdAt: string;
};
export type Stage3DebateUtteranceView = DebateUtterance & {
  roundTitle: string;
  agentName: string;
  agentRole: AgentProfile["role"];
  /** 번들 캐릭터 초상화 URL (personaName→role 해석), 없으면 이니셜 폴백 */
  portraitUrl?: string;
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
export type NavItemId =
  | "none"
  | "dashboard"
  | "sessions"
  | "projects"
  | "providers"
  | "config_files"
  | "channels"
  | "backup"
  | "run"
  | "theater"
  | "coding"
  | "research"
  | "rmas"
  | "persona"
  | "command_center";
export type NavItem = {
  id: NavItemId;
  label: string;
  icon: LucideIcon;
};
/** Sidebar group: a titled cluster of nav items (메인 / 작전 / 시스템). */
export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
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
/**
 * Tri-state used by MetaOnboardingSignal. The legacy WindowAuditItem
 * shared this enum but is removed (no production consumers — see
 * design-decisions §1, WindowChecklist deletion).
 */
export type WindowAuditStatus = "ready" | "partial" | "blocked";
export type MetaOnboardingSignal = {
  id: string;
  label: string;
  status: WindowAuditStatus;
  suggestion: string;
};
