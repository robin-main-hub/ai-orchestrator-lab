import type { IncomingMessage } from "node:http";

export type HealthRouteDependencies = {
  pathname: string;
  method?: string;
  createPersistentEventStorageSnapshot: () => Promise<any>;
  createLiveHealthResponse: () => Promise<any>;
  redactInternalPathsForPublicHealth: (snapshot: any) => any;
  respondJson: (statusCode: number, payload: unknown) => void;
};

export async function handleHealthRoute({
  pathname,
  method,
  createPersistentEventStorageSnapshot,
  createLiveHealthResponse,
  redactInternalPathsForPublicHealth,
  respondJson,
}: HealthRouteDependencies): Promise<boolean> {
  if (pathname === "/health" && (method === "GET" || method === "POST")) {
    try {
      const storageSnapshot = await createPersistentEventStorageSnapshot();
      respondJson(200, {
        ...(await createLiveHealthResponse()),
        eventStorage: redactInternalPathsForPublicHealth(storageSnapshot),
      });
    } catch (error) {
      respondJson(500, {
        error: "health_check_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  return false;
}
