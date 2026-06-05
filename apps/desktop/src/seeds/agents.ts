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
    {
      providerProfileId: "provider_apifun_claude_b",
      modelId: "claude-opus-4-6",
      authBinding: {
        mode: "provider_profile",
        label: "APIKey.fun Claude B",
        providerProfileId: "provider_apifun_claude_b",
        secretRefId: "dgx-02:ANTHROPIC_API_KEY_ALT",
      },
    },
  ];

  let binding = bindings[1]; // default to GPT 5.5 Pro

  if (agent.role === "orchestrator" || agent.role === "companion" || agent.id === "agent_orchestrator") {
    binding = bindings[0]; // Codex
  } else if (agent.role === "executor" || agent.id === "agent_executor") {
    binding = bindings[2]; // Claude A (4.6 conservative default)
  } else if (agent.role === "researcher" || agent.role === "domain_expert" || agent.role === "auditor" || agent.id.includes("backend")) {
    binding = bindings[4]; // Claude B (4.6 conservative default)
  } else if (agent.id.includes("mock")) {
    binding = bindings[3]; // Mock Local
  }

  return {
    ...agent,
    ...binding,
  };
});
