import { describe, expect, it } from "vitest";
import { resolveExternalIngressTargetAgentId } from "./externalIngressRouting";

describe("resolveExternalIngressTargetAgentId", () => {
  it("외부 인입은 현재 선택 에이전트가 아니라 오케스트레이터 triage 채널로 보낸다", () => {
    expect(
      resolveExternalIngressTargetAgentId({
        agents: [
          { id: "agent_builder", role: "builder" },
          { id: "agent_orchestrator", role: "orchestrator" },
        ],
      }),
    ).toBe("agent_orchestrator");
  });

  it("오케스트레이터가 없으면 첫 에이전트 또는 fallback을 사용한다", () => {
    expect(
      resolveExternalIngressTargetAgentId({
        agents: [{ id: "agent_builder", role: "builder" }],
      }),
    ).toBe("agent_builder");
    expect(resolveExternalIngressTargetAgentId({ agents: [], fallbackAgentId: "agent_triage" })).toBe("agent_triage");
  });
});
