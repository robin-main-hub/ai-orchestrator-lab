import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../../types";
import { AgentChannelStatusBar } from "./AgentChannelStatusBar";

const orchestrator: WorkbenchAgent = {
  id: "agent_orchestrator",
  enabled: true,
  kind: "virtual",
  name: "Orchestrator",
  role: "orchestrator",
  modelId: "mimo-v2.5-pro",
  providerProfileId: "provider_mimo_token_openai",
  configSource: "internal",
  soulMode: "summary",
};

describe("AgentChannelStatusBar", () => {
  it("상태바에서도 내부 역할명이 아니라 캐릭터 이름을 대표 이름으로 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentChannelStatusBar
        adapterStatus="ready"
        memoryRecordCount={2}
        messageCount={4}
        modelId="mimo-v2.5-pro"
        providerProfileId="provider_mimo_token_openai"
        selectedAgent={orchestrator}
      />,
    );

    expect(html).toContain("마키마");
    expect(html).not.toContain("Orchestrator · Orchestrator");
  });
});
