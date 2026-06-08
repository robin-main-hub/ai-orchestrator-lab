import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModelDescriptor, ProviderProfile } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../../types";
import { AgentQuickSwitchPanel } from "./AgentQuickSwitchPanel";

const selectedAgent: WorkbenchAgent = {
  configSource: "markdown",
  enabled: true,
  id: "agent_orchestrator",
  kind: "real",
  modelId: "mimo-v2.5-pro",
  name: "Orchestrator",
  personaName: "orchestrator",
  providerProfileId: "provider_mimo_token_openai",
  role: "orchestrator",
  soulMode: "summary",
};

const providers: ProviderProfile[] = [
  {
    defaultModel: "mimo-v2.5-pro",
    enabled: true,
    id: "provider_mimo_token_openai",
    kind: "openai",
    name: "MiMo Token Plan OpenAI",
    tags: ["mimo"],
    trustLevel: "trusted",
  },
  {
    defaultModel: "claude-opus-4-8",
    enabled: true,
    id: "provider_apifun_claude",
    kind: "anthropic",
    name: "APIKey.fun Claude A",
    tags: ["apikey.fun"],
    trustLevel: "limited",
  },
];

const models: ModelDescriptor[] = [
  {
    id: "mimo-v2.5-pro",
    name: "mimo-v2.5-pro",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
  {
    id: "mimo-v2.5-asr",
    name: "mimo-v2.5-asr",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: false,
    tags: [],
  },
];

describe("AgentQuickSwitchPanel", () => {
  it("에이전트의 모델, 공급자, SOUL, AGENTS를 한 번에 바꾸는 선택지를 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentQuickSwitchPanel
        modelCatalog={{ provider_mimo_token_openai: models }}
        onAssignModel={vi.fn()}
        onAssignProvider={vi.fn()}
        onUpdateAgentConfig={vi.fn()}
        providers={providers}
        selectedAgent={selectedAgent}
        selectedProvider={providers[0]}
      />,
    );

    expect(html).toContain("원클릭 전환");
    expect(html).toContain("MiMo Token Plan OpenAI");
    expect(html).toContain("APIKey.fun Claude A");
    expect(html).toContain("MiMo V2.5 Pro");
    expect(html).toContain("MiMo V2.5 ASR");
    expect(html).toContain("SOUL");
    expect(html).toContain("요약");
    expect(html).toContain("검색 기억");
    expect(html).toContain("AGENTS");
    expect(html).toContain("Markdown");
    expect(html).toContain("내부");
    expect(html).not.toContain("undefined");
  });
});
