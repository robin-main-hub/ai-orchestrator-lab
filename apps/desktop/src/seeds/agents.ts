import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import type { WorkbenchAgent } from "../types";

export const seededAgentProfiles: WorkbenchAgent[] = defaultAgentProfiles.map((agent, index) => {
  const bindings: Array<Required<Pick<WorkbenchAgent, "providerProfileId" | "modelId" | "authBinding">>> = [
    {
      providerProfileId: "provider_dgx02_vllm",
      modelId: "qwen36-domain-wiki-rag-prisma",
      authBinding: {
        mode: "provider_profile",
        label: "DGX-02 vLLM route",
        providerProfileId: "provider_dgx02_vllm",
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
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      authBinding: {
        mode: "oauth",
        label: "OAuth ref",
        providerProfileId: "provider_codex_oauth",
        oauthRef: "oauth_codex_placeholder",
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
