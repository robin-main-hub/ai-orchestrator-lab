import type { BranchExperiment, ContextPackTier, ConversationMessage, InsightCategory, ReviewMode, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { AgentConfigTab, AgentCreativityLevel, AgentVoicePreset, WorkbenchAgent } from "../types";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { agentKoreanNameByIdentity, agentPrimaryDisplayName } from "./agentDisplay";

export function reviewModeLabel(mode: ReviewMode) {
  const labels: Record<ReviewMode, string> = {
    deep: "정밀",
    quick: "빠른 검토",
  };

  return labels[mode];
}

export function insightCategoryLabel(category: InsightCategory) {
  const labels: Record<InsightCategory, string> = {
    architecture: "아키텍처",
    performance: "성능",
    security: "보안",
    stability: "안정성",
    tech_debt: "기술 부채",
    testing: "테스트",
  };

  return labels[category];
}

export function branchStatusLabel(status: BranchExperiment["status"]) {
  const labels: Record<BranchExperiment["status"], string> = {
    adopted: "채택됨",
    drafting: "작성중",
    ready: "채택 후보",
  };

  return labels[status];
}

export function branchAgentNameLabel(agentName?: string) {
  if (!agentName) {
    return "에이전트";
  }

  const normalized = normalizeMetadataAgentName(agentName);
  return agentKoreanNameByIdentity[normalized] ?? agentName;
}

export function statusTone(status: RuntimeSnapshot["status"]) {
  if (status === "online") {
    return "ok";
  }
  if (status === "offline") {
    return "danger";
  }
  return "warn";
}

export function guardStepLabel(step: Stage8IngressSnapshot["result"]["guardSteps"][number]["name"]) {
  const labels: Record<Stage8IngressSnapshot["result"]["guardSteps"][number]["name"], string> = {
    shape_unification: "형식",
    noise_filter: "노이즈",
    self_response_prevention: "자기 응답 차단",
    external_agent_isolation: "격리",
    debounce: "중복 억제",
    pii_secret_block: "개인정보/비밀",
    guard_logging: "기록",
    checklist_injection: "체크리스트",
  };

  return labels[step];
}

export function soulModeLabel(mode: WorkbenchAgent["soulMode"]) {
  const labels: Record<WorkbenchAgent["soulMode"], string> = {
    full: "전체",
    summary: "요약",
    retrieved: "검색된 기억",
    off: "꺼짐",
  };

  return labels[mode];
}

export function configSourceLabel(source: WorkbenchAgent["configSource"]) {
  const labels: Record<WorkbenchAgent["configSource"], string> = {
    internal: "앱 내부 설정",
    markdown: "AGENTS.md / SOUL.md",
    off: "주입 안 함",
  };

  return labels[source];
}

export function voicePresetLabel(preset: AgentVoicePreset) {
  const labels: Record<AgentVoicePreset, string> = {
    architect: "설계자형",
    calm: "차분함",
    direct: "직설적",
    executor: "실행자형",
    reviewer: "검토자형",
  };

  return labels[preset];
}

export function creativityLevelLabel(level: AgentCreativityLevel) {
  const labels: Record<AgentCreativityLevel, string> = {
    strict: "보수적",
    focused: "신중",
    balanced: "균형",
    creative: "창의적",
    experimental: "실험적",
  };

  return labels[level];
}

export function creativityTemperature(level: AgentCreativityLevel) {
  const temperatures: Record<AgentCreativityLevel, number> = {
    strict: 0.2,
    focused: 0.4,
    balanced: 0.7,
    creative: 1,
    experimental: 1.2,
  };

  return temperatures[level];
}

export function agentConfigPanelTitle(tab: AgentConfigTab) {
  const labels: Record<AgentConfigTab, string> = {
    agents_md: "AGENTS.md 설정",
    creativity: "창의성 설정",
    edit: "설정 소스",
    injection: "주입 방식",
    preview: "프롬프트 미리보기",
    profile: "프로필",
    soul: "SOUL.md 설정",
  };

  return labels[tab];
}

export function contextPackTierLabel(tier: ContextPackTier) {
  const labels: Record<ContextPackTier, string> = {
    full: "전체",
    lite: "간략",
    standard: "표준",
  };

  return labels[tier];
}

export function messageLabel(
  message: ConversationMessage,
  selectedAgent?: WorkbenchAgent,
  agents: WorkbenchAgent[] = [],
) {
  if (message.role === "user") {
    return "사용자";
  }

  const metadataAgentId = typeof message.metadata?.agentId === "string" ? message.metadata.agentId : undefined;
  const agentName = message.metadata?.agentName;
  const matchedAgent = agents.find((agent) =>
    agent.id === metadataAgentId ||
    (typeof agentName === "string" && agent.name === agentName)
  );
  if (matchedAgent) {
    return agentPrimaryDisplayName(matchedAgent);
  }

  if (selectedAgent) {
    return agentPrimaryDisplayName(selectedAgent);
  }

  if (typeof agentName === "string") {
    return agentKoreanNameByIdentity[normalizeMetadataAgentName(agentName)] ?? agentName;
  }

  return "에이전트";
}

function normalizeMetadataAgentName(value: string) {
  return value.trim().toLowerCase().replace(/^agent[_-]/, "").replace(/\s+/g, "_");
}
