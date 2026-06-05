import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import type { WorkbenchAgent } from "../types";

const allAgentMiMoBinding: Required<Pick<WorkbenchAgent, "providerProfileId" | "modelId" | "authBinding">> = {
  providerProfileId: "provider_mimo_token_openai",
  modelId: "mimo-v2.5-pro",
  authBinding: {
    mode: "provider_profile",
    label: "MiMo Token Plan",
    providerProfileId: "provider_mimo_token_openai",
    secretRefId: "dgx-02:MIMO_API_KEY",
  },
};

export const seededAgentProfiles: WorkbenchAgent[] = defaultAgentProfiles.map((agent) => ({
  ...agent,
  ...allAgentMiMoBinding,
}));
