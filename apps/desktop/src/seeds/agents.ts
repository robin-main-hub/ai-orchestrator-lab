import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import type { WorkbenchAgent } from "../types";

export const seededAgentProfiles: WorkbenchAgent[] = defaultAgentProfiles.map((agent, index) => {
  const bindings: Array<Required<Pick<WorkbenchAgent, "providerProfileId" | "modelId" | "authBinding">>> = [
    {
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      authBinding: {
        mode: "oauth",
        label: "Codex OAuth",
        providerProfileId: "provider_codex_oauth",
        oauthRef: "oauth_codex_dgx02",
      },
    },
    {
      providerProfileId: "provider_openai_compat",
      modelId: "gpt-5.5-pro",
      authBinding: {
        mode: "provider_profile",
        label: "API secretRef",
        providerProfileId: "provider_openai_compat",
        secretRefId: "session secret",
      },
    },
    {
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      authBinding: {
        mode: "provider_profile",
        label: "APIKey.fun Claude A",
        providerProfileId: "provider_apifun_claude",
        secretRefId: "dgx-02:ANTHROPIC_API_KEY",
      },
    },
    {
      providerProfileId: "provider_mock_local",
      modelId: "mock-builder",
      authBinding: {
        mode: "local",
        label: "local mock runtime",
        providerProfileId: "provider_mock_local",
      },
    },
  ];

  return {
    ...agent,
    ...bindings[index % bindings.length],
  };
});
