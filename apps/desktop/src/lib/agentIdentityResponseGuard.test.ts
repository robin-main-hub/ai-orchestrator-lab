import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../types";
import { seededAgentProfiles } from "../seeds/agents";
import { applyAgentIdentityResponseGuard } from "./agentIdentityResponseGuard";

const agent = {
  ...seededAgentProfiles[0]!,
  id: "agent_orchestrator",
  name: "Orchestrator",
  role: "orchestrator",
  providerProfileId: "provider_mimo_token_openai",
  modelId: "mimo-v2.5-pro",
} satisfies WorkbenchAgent;

describe("applyAgentIdentityResponseGuard", () => {
  it("corrects name-denial answers when the user asks the selected agent's name", () => {
    const guarded = applyAgentIdentityResponseGuard({
      agent,
      content: "이름은 없다. 역할로 부르면 된다 — Orchestrator.",
      userContent: "네 이름은 뭔데",
    });

    expect(guarded.guardApplied).toBe(true);
    expect(guarded.content).toContain("마키마");
    expect(guarded.content).not.toContain("이름은 없다");
  });

  it("corrects indirect Korean name-denial variants from provider replies", () => {
    const guarded = applyAgentIdentityResponseGuard({
      agent,
      content: "나는 별도의 이름을 가지고 있지 않아. 역할명으로 불러줘.",
      userContent: "너 누구야",
    });

    expect(guarded.guardApplied).toBe(true);
    expect(guarded.content).toContain("마키마");
    expect(guarded.content).not.toContain("별도의 이름");
    expect(guarded.content).not.toContain("역할명으로");
  });

  it("does not rewrite ordinary answers", () => {
    const guarded = applyAgentIdentityResponseGuard({
      agent,
      content: "마키마 기준으로 다음 작업은 테스트 검증입니다.",
      userContent: "다음 작업 알려줘",
    });

    expect(guarded.guardApplied).toBe(false);
    expect(guarded.content).toBe("마키마 기준으로 다음 작업은 테스트 검증입니다.");
  });
});
