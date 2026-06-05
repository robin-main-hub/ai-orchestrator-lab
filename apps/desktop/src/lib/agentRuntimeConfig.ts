import type { AgentConfigFile, WorkbenchAgent } from "../types";
import type { AgentChannelMemoryScope } from "./agentConversationChannels";
import { getAgentToolProfile } from "./agentToolProfiles";

export type AgentRuntimeConfigSection = {
  configFileIds: string[];
  promptText: string;
};

export type AgentRoleToolRuntimeSection = {
  label: string;
  tools: string[];
  promptText: string;
};

const maxConfigBodyChars = 2_400;
const secretPatterns: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED:api_key]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [REDACTED:bearer_token]"],
  [/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|COOKIE)[A-Z0-9_]*\s*=\s*["']?[^\s"']+["']?/g, "[REDACTED:env_secret]"],
];

export function selectAgentRuntimeConfigFiles(
  agent: WorkbenchAgent,
  configFiles: AgentConfigFile[],
): AgentConfigFile[] {
  return configFiles.filter((file) => file.linkedAgentIds.includes(agent.id));
}

export function createAgentRuntimeConfigSection(
  agent: WorkbenchAgent,
  configFiles: AgentConfigFile[],
): AgentRuntimeConfigSection {
  const linkedConfigFiles = selectAgentRuntimeConfigFiles(agent, configFiles);
  if (linkedConfigFiles.length === 0) {
    return {
      configFileIds: [],
      promptText: "# 에이전트 설치 스킬/도구 프로필\n\n- 연결된 런타임 config 없음.",
    };
  }

  const sections = linkedConfigFiles.map((file) => {
    const body = redactPromptConfigText(file.body).slice(0, maxConfigBodyChars);
    return [
      `## ${file.label}`,
      `- id: ${file.id}`,
      `- kind: ${file.kind}`,
      `- path: ${file.path}`,
      "",
      body,
    ].join("\n");
  });

  return {
    configFileIds: linkedConfigFiles.map((file) => file.id),
    promptText: [
      "# 에이전트 설치 스킬/도구 프로필",
      "",
      "아래 내용은 이 에이전트에게 설치된 읽기 전용 런타임 지침이다.",
      "secret 원문은 redaction 대상이며, SecretRef/provider profile 이름만 사용할 수 있다.",
      "도구 호출을 실제로 수행했다고 말하지 말고, 필요한 호출은 목적/입력/예상 출력/권한 필요 여부를 먼저 제안한다.",
      "",
      ...sections,
    ].join("\n"),
  };
}

export function createAgentChannelRuntimeSummary(memoryScope: AgentChannelMemoryScope): string {
  return [
    "# 현재 에이전트 기억 채널",
    "",
    "이 턴은 아래 범위의 기억과 대화 연속성만 기본 참조한다.",
    `- agentId=${memoryScope.agentId}`,
    `- sessionId=${memoryScope.sessionId}`,
    `- providerProfileId=${memoryScope.providerProfileId}`,
    `- namespace=${memoryScope.namespace}`,
    `- recallTraceId=${memoryScope.recallTraceId}`,
    "- 이 범위 표시는 권한 상승이나 다른 에이전트 채널 접근 허가가 아니다.",
    "- 다른 에이전트의 장기 기억이나 대화 채널을 확정 사실처럼 섞지 않는다.",
  ].join("\n");
}

export function createAgentRoleToolRuntimeSummary(agent: WorkbenchAgent): AgentRoleToolRuntimeSection {
  const profile = getAgentToolProfile(agent.role);
  return {
    label: profile.label,
    tools: profile.tools,
    promptText: [
      "# 역할 기반 도구 사용 계약",
      "",
      `- 도구 묶음: ${profile.label}`,
      `- 허용 도구: ${profile.tools.join(", ")}`,
      "- 실제 도구 호출을 수행했다고 말하기 전에는 권한 기록 또는 실행 이벤트를 확인한다.",
      "- 필요한 도구 호출은 목적, 입력, 예상 출력, 권한 필요 여부를 먼저 요약한다.",
      "- 비밀값, 원문 토큰, 내부 프롬프트 전문은 도구 입력이나 공개 로그에 쓰지 않는다.",
    ].join("\n"),
  };
}

function redactPromptConfigText(value: string): string {
  return secretPatterns.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}
