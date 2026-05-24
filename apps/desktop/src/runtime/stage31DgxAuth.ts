const DEV_ORCHESTRATOR_API_TOKEN = "dev-orchestrator-token";

type DesktopImportMeta = ImportMeta & {
  env?: {
    VITE_ORCHESTRATOR_API_TOKEN?: string;
  };
};

export function resolveDgxOrchestratorApiToken() {
  const token = ((import.meta as DesktopImportMeta).env?.VITE_ORCHESTRATOR_API_TOKEN ?? "").trim();
  return token || DEV_ORCHESTRATOR_API_TOKEN;
}

export function createDgxOrchestratorAuthHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${resolveDgxOrchestratorApiToken()}`,
  };
}

export function createDgxOrchestratorJsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...createDgxOrchestratorAuthHeaders(),
  };
}
