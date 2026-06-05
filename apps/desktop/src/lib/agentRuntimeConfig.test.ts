import { describe, expect, it } from "vitest";
import type { AgentConfigFile, WorkbenchAgent } from "../types";
import {
  createAgentChannelRuntimeSummary,
  createAgentRuntimeConfigSection,
  selectAgentRuntimeConfigFiles,
} from "./agentRuntimeConfig";

const agent = {
  id: "agent_orchestrator",
  role: "orchestrator",
  name: "마키마",
} as WorkbenchAgent;

const configFiles: AgentConfigFile[] = [
  {
    id: "config_skill_role_tool_profiles_v1",
    kind: "skill",
    label: "역할별 도구 호출 프로필",
    scope: "project",
    path: "agents/skills/ROLE_TOOL_PROFILES.md",
    tags: ["tools"],
    version: 1,
    linkedAgentIds: ["agent_orchestrator"],
    updatedAt: "2026-06-05T00:00:00.000Z",
    body: "tool.call 전에는 목적, 입력, 예상 출력, 권한 필요 여부를 요약한다.",
  },
  {
    id: "config_other_agent_only",
    kind: "skill",
    label: "다른 에이전트 전용",
    scope: "agent",
    path: "agents/other/SKILL.md",
    tags: ["other"],
    version: 1,
    linkedAgentIds: ["agent_reviewer"],
    updatedAt: "2026-06-05T00:00:00.000Z",
    body: "이 내용은 들어가면 안 된다.",
  },
];

describe("agent runtime config injection", () => {
  it("selects only config files linked to the target agent", () => {
    expect(selectAgentRuntimeConfigFiles(agent, configFiles).map((file) => file.id)).toEqual([
      "config_skill_role_tool_profiles_v1",
    ]);
  });

  it("creates a Korean system prompt section for linked skills", () => {
    const section = createAgentRuntimeConfigSection(agent, configFiles);

    expect(section.configFileIds).toEqual(["config_skill_role_tool_profiles_v1"]);
    expect(section.promptText).toContain("# 에이전트 설치 스킬/도구 프로필");
    expect(section.promptText).toContain("secret 원문은 redaction");
    expect(section.promptText).toContain("역할별 도구 호출 프로필");
    expect(section.promptText).toContain("tool.call 전에는 목적");
    expect(section.promptText).not.toContain("이 내용은 들어가면 안 된다.");
  });

  it("redacts accidental secrets before injecting config text into prompts", () => {
    const section = createAgentRuntimeConfigSection(agent, [
      {
        ...configFiles[0]!,
        body: "절대 들어가면 안 되는 키 sk-1234567890abcdef",
      },
    ]);

    expect(section.promptText).toContain("[REDACTED:api_key]");
    expect(section.promptText).not.toContain("sk-1234567890abcdef");
  });

  it("summarizes the active agent memory channel for the runtime prompt", () => {
    expect(
      createAgentChannelRuntimeSummary({
        agentId: "agent_orchestrator",
        sessionId: "session_main",
        providerProfileId: "provider_mimo_token_openai",
        namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
        recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
      }),
    ).toContain("권한 상승이나 다른 에이전트 채널 접근 허가가 아니다");
  });
});
