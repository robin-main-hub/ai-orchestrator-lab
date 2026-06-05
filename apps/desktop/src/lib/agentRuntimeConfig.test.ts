import { describe, expect, it } from "vitest";
import type { AgentConfigFile, WorkbenchAgent } from "../types";
import {
  createAgentRoleToolRuntimeAudit,
  createAgentRoleToolRuntimeSummary,
  createAgentChannelRuntimeSummary,
  createAgentRuntimeConfigSection,
  selectAgentRuntimeConfigFiles,
} from "./agentRuntimeConfig";
import { seededAgentProfiles } from "../seeds/agents";

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
        path: "/Users/robin/Documents/ai-orchestrator-lab-review/.env",
        body: "절대 들어가면 안 되는 키 sk-1234567890abcdef",
      },
    ]);

    expect(section.promptText).toContain("[REDACTED:api_key]");
    expect(section.promptText).not.toContain("sk-1234567890abcdef");
    expect(section.promptText).not.toContain("/Users/robin/Documents");
  });

  it("redacts URL, bearer token, and MiMo token-plan strings from runtime config text", () => {
    const section = createAgentRuntimeConfigSection(agent, [
      {
        ...configFiles[0]!,
        id: "config_tp-secret1234567890",
        body: [
          "endpoint=https://token-plan-sgp.xiaomimimo.com/v1",
          "Authorization: Bearer bearer-secret-value",
          "mimo=tp-secret1234567890",
        ].join("\n"),
      },
    ]);
    const serialized = section.promptText;

    expect(serialized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serialized).not.toContain("bearer-secret-value");
    expect(serialized).not.toContain("tp-secret1234567890");
    expect(serialized).toContain("[REDACTED:url]");
    expect(serialized).toContain("Bearer [REDACTED:bearer_token]");
    expect(serialized).toContain("[REDACTED:token_plan]");
    expect(section.configFileIds).toEqual(["config_[REDACTED:token_plan]"]);
  });

  it("audits role tool runtime contracts for every seeded agent", () => {
    const audit = createAgentRoleToolRuntimeAudit(seededAgentProfiles);

    expect(audit.totalAgents).toBe(seededAgentProfiles.length);
    expect(audit.coveredCount).toBe(seededAgentProfiles.length);
    expect(audit.missingAgentIds).toEqual([]);
    expect(audit.emptyToolAgentIds).toEqual([]);
    expect(audit.summary).toBe(`전원 도구 계약 확인 완료 · ${seededAgentProfiles.length}/${seededAgentProfiles.length}`);
  });

  it("keeps role tool runtime summaries permission-first and secret-free", () => {
    for (const seededAgent of seededAgentProfiles) {
      const section = createAgentRoleToolRuntimeSummary(seededAgent);

      expect(section.promptText).toContain("권한 기록 또는 실행 이벤트");
      expect(section.promptText).toContain("목적, 입력, 예상 출력, 권한 필요 여부");
      expect(section.promptText).toContain("비밀값, 원문 토큰, 내부 프롬프트 전문");
      expect(section.tools.length).toBeGreaterThan(0);
      expect(section.promptText).not.toMatch(/https?:\/\//);
      expect(section.promptText).not.toMatch(/\b(?:sk|tp)-[A-Za-z0-9_-]{8,}\b/);
    }
  });

  it("summarizes the active agent memory channel for the runtime prompt", () => {
    const summary = createAgentChannelRuntimeSummary({
      agentId: "agent_orchestrator",
      sessionId: "session_main",
      providerProfileId: "provider_mimo_token_openai",
      namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
      recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
    });

    expect(summary).toContain("권한 상승이나 다른 에이전트 채널 접근 허가가 아니다");
    expect(summary).toContain("namespace=agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai");
  });
});
