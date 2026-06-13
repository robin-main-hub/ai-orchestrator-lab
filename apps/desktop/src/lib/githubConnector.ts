import type {
  GithubConnectorStatus,
  GithubIssueSummary,
  GithubPullRequestSummary,
} from "@ai-orchestrator/protocol";

/**
 * Desktop-side client for the read-only GitHub connector. The token never
 * reaches the browser — these helpers only talk to the server's
 * /integrations/github routes, which hold the token. Asking for status does NOT
 * hit GitHub when unconfigured (the server returns configured:false), so this is
 * safe to call on mount.
 */

export function resolveServerBaseUrl(serverBaseUrl?: string | string[]): string | undefined {
  if (Array.isArray(serverBaseUrl)) return serverBaseUrl.find((url) => url && url.trim()) || undefined;
  return serverBaseUrl?.trim() || undefined;
}

export type GithubConnectorView =
  | { state: "unknown" }
  | { state: "error"; message: string }
  | { state: "ready"; status: GithubConnectorStatus };

export async function fetchGithubConnectorStatus(
  serverBaseUrl: string | string[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubConnectorView> {
  const base = resolveServerBaseUrl(serverBaseUrl);
  if (!base) return { state: "unknown" };
  try {
    const response = await fetchImpl(`${base.replace(/\/$/, "")}/integrations/github/status`, { method: "GET" });
    if (!response.ok) return { state: "error", message: `HTTP ${response.status}` };
    const payload = (await response.json()) as { status?: GithubConnectorStatus };
    if (!payload.status) return { state: "error", message: "잘못된 응답" };
    return { state: "ready", status: payload.status };
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchGithubPullRequests(
  serverBaseUrl: string | string[] | undefined,
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestSummary[]> {
  const base = resolveServerBaseUrl(serverBaseUrl);
  if (!base) return [];
  const response = await fetchImpl(
    `${base.replace(/\/$/, "")}/integrations/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    { method: "GET" },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as { pullRequests?: GithubPullRequestSummary[] };
  return payload.pullRequests ?? [];
}

export async function fetchGithubIssues(
  serverBaseUrl: string | string[] | undefined,
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubIssueSummary[]> {
  const base = resolveServerBaseUrl(serverBaseUrl);
  if (!base) return [];
  const response = await fetchImpl(
    `${base.replace(/\/$/, "")}/integrations/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    { method: "GET" },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as { issues?: GithubIssueSummary[] };
  return payload.issues ?? [];
}

export type GithubConnectorChipLabel = { text: string; tone: "configured" | "idle" | "error"; title: string };

/** honest one-line label for the connector chip */
export function githubConnectorChipLabel(view: GithubConnectorView): GithubConnectorChipLabel {
  if (view.state === "unknown") {
    return { text: "GitHub: 서버 미연결", tone: "idle", title: "서버 주소가 없어 커넥터 상태를 확인할 수 없습니다." };
  }
  if (view.state === "error") {
    return { text: "GitHub: 확인 불가", tone: "error", title: `상태 조회 실패: ${view.message}` };
  }
  if (view.status.configured) {
    return { text: "GitHub 읽기전용: 연결됨", tone: "configured", title: view.status.note };
  }
  return { text: "GitHub 읽기전용: 미설정", tone: "idle", title: view.status.note };
}
