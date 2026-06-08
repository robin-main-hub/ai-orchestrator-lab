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
    secretRef: {
      id: "secret_claude_a",
      label: "Claude A",
      redactedPreview: "dgx-02:ANTHROPIC_API_KEY",
      scope: "profile",
      transient: false,
    },
    tags: ["apikey.fun"],
    trustLevel: "limited",
  },
  {
    defaultModel: "claude-opus-4-7",
    enabled: true,
    id: "provider_apifun_claude_b",
    kind: "anthropic",
    name: "APIKey.fun Claude B",
    secretRef: {
      id: "secret_claude_b",
      label: "Claude B",
      redactedPreview: "dgx-02:ANTHROPIC_API_KEY_ALT",
      scope: "profile",
      transient: false,
    },
    tags: ["apikey.fun"],
    trustLevel: "limited",
  },
  {
    defaultModel: "mock-orchestrator",
    enabled: true,
    id: "provider_mock_local",
    kind: "custom",
    name: "Mock Local Provider",
    tags: ["mock"],
    trustLevel: "trusted",
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
  {
    id: "mimo-v2.5",
    name: "mimo-v2.5",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
  {
    id: "mimo-v2.5-asr-2",
    name: "mimo-v2.5-asr-2",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: false,
    tags: [],
  },
  {
    id: "mimo-v2.5-code",
    name: "mimo-v2.5-code",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
  {
    id: "mimo-v2.5-reasoner",
    name: "mimo-v2.5-reasoner",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
  {
    id: "mimo-v2.5-long-context",
    name: "mimo-v2.5-long-context",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
  {
    id: "mimo-v2.5-research",
    name: "mimo-v2.5-research",
    providerProfileId: "provider_mimo_token_openai",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
];

const claudeModels: ModelDescriptor[] = [
  {
    id: "claude-opus-4-8",
    name: "claude-opus-4-8",
    providerProfileId: "provider_apifun_claude",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
  {
    id: "claude-opus-4-7",
    name: "claude-opus-4-7",
    providerProfileId: "provider_apifun_claude_b",
    supportsStreaming: true,
    supportsTools: true,
    tags: [],
  },
];

describe("AgentQuickSwitchPanel", () => {
  it("에이전트의 모델, 공급자, SOUL, AGENTS를 한 번에 바꾸는 선택지를 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentQuickSwitchPanel
        defaultCredentialProviderIds={new Set(["provider_mimo_token_openai"])}
        modelCatalog={{
          provider_apifun_claude: claudeModels.filter((model) => model.providerProfileId === "provider_apifun_claude"),
          provider_apifun_claude_b: claudeModels.filter((model) => model.providerProfileId === "provider_apifun_claude_b"),
          provider_mimo_token_openai: models,
        }}
        onAssignModel={vi.fn()}
        onAssignProvider={vi.fn()}
        onBack={vi.fn()}
        onRefreshModels={vi.fn()}
        onUpdateAgentConfig={vi.fn()}
        providers={providers}
        selectedAgent={selectedAgent}
        selectedProvider={providers[0]}
      />,
    );

    expect(html).toContain("원클릭 전환");
    expect(html).toContain("공급업체별 모델");
    expect(html).toContain("MiMo");
    expect(html).toContain("Claude");
    expect(html).not.toContain("MiMo Token Plan OpenAI");
    expect(html).not.toContain("APIKey.fun Claude A");
    expect(html).not.toContain("APIKey.fun Claude B");
    expect(html).not.toContain("Mock Local Provider");
    expect(html).toContain("MiMo V2.5 Pro");
    expect(html).toContain("MiMo V2.5 ASR");
    expect(html).toContain("MiMo V2.5 Long Context");
    expect(html).toContain("MiMo V2.5 Research");
    expect(html).toContain("Claude Opus 4.8");
    expect(html).toContain("Claude Opus 4.7");
    expect(html).toContain("SOUL");
    expect(html).toContain("요약");
    expect(html).toContain("검색 기억");
    expect(html).toContain("AGENTS");
    expect(html).toContain("Markdown");
    expect(html).toContain("내부");
    expect(html).toContain("← Agents로 돌아가기");
    expect(html).toContain("표시된 모델 새로고침");
    expect(html).toContain("패널을 열 때 표시된 공급업체 모델을 다시 확인합니다");
    expect(html).toContain("data-testid=\"agent-model-scroll-region\"");
    expect(html).toContain("max-h-80");
    expect(html).toContain("overflow-y-auto");
    expect(html).not.toContain("undefined");
  });
});
