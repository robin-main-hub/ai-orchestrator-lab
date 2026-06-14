import type {
  GithubBranchCreateExecuteRequest,
  GithubBranchCreateExecuteResponse,
  GithubBranchCreatePlanRequest,
  GithubBranchCreatePlanResponse,
  GithubCommentWriteExecuteRequest,
  GithubCommentWriteExecuteResponse,
  GithubCommentWritePlanRequest,
  GithubCommentWritePlanResponse,
  GithubConnectorStatus,
  GithubFileChangeExecuteRequest,
  GithubFileChangeExecuteResponse,
  GithubFileChangePlanRequest,
  GithubFileChangePlanResponse,
  GithubIssueSummary,
  GithubMultiFileCommitExecuteRequest,
  GithubMultiFileCommitExecuteResponse,
  GithubPullRequestCreateExecuteRequest,
  GithubPullRequestCreateExecuteResponse,
  GithubPullRequestCreatePlanRequest,
  GithubPullRequestCreatePlanResponse,
  GithubPullRequestDetail,
  GithubPullRequestSummary,
  GithubPullRequestUpdateExecuteRequest,
  GithubPullRequestUpdateExecuteResponse,
  GithubPullRequestUpdatePlanRequest,
  GithubPullRequestUpdatePlanResponse,
  GithubPullRequestLabelsUpdateExecuteRequest,
  GithubPullRequestLabelsUpdateExecuteResponse,
  GithubPullRequestLabelsUpdatePlanRequest,
  GithubPullRequestLabelsUpdatePlanResponse,
  GithubReadonlyResourceResponse,
  GithubResourceOutcome,
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

/**
 * Honest result of a read-only resource fetch. `data` is present ONLY when
 * `outcome === "observed"` (real HTTP 200). Every other outcome carries a
 * message and no data, so callers must distinguish 미설정 / 권한 부족 / 연결 실패
 * instead of treating an empty list as "no results".
 */
export type GithubResourceResult<T> = {
  outcome: GithubResourceOutcome;
  data?: T;
  message?: string;
  observedAt?: string;
};

async function fetchGithubResource<T>(
  serverBaseUrl: string | string[] | undefined,
  path: string,
  pick: (payload: GithubReadonlyResourceResponse) => T | undefined,
  fetchImpl: typeof fetch,
): Promise<GithubResourceResult<T>> {
  const base = resolveServerBaseUrl(serverBaseUrl);
  if (!base) return { outcome: "connection_failed", message: "서버 미연결 — 코딩 서버 주소가 없습니다." };
  try {
    const response = await fetchImpl(`${base.replace(/\/$/, "")}${path}`, { method: "GET" });
    if (!response.ok) return { outcome: "github_error", message: `HTTP ${response.status}` };
    const payload = (await response.json()) as GithubReadonlyResourceResponse;
    return { outcome: payload.outcome, data: pick(payload), message: payload.message, observedAt: payload.observedAt };
  } catch (error) {
    return { outcome: "connection_failed", message: error instanceof Error ? error.message : String(error) };
  }
}

export function fetchGithubPullRequests(
  serverBaseUrl: string | string[] | undefined,
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubResourceResult<GithubPullRequestSummary[]>> {
  return fetchGithubResource(
    serverBaseUrl,
    `/integrations/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    (payload) => payload.pullRequests,
    fetchImpl,
  );
}

export function fetchGithubPullRequest(
  serverBaseUrl: string | string[] | undefined,
  owner: string,
  repo: string,
  pullNumber: number,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubResourceResult<GithubPullRequestDetail>> {
  return fetchGithubResource(
    serverBaseUrl,
    `/integrations/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(pullNumber))}`,
    (payload) => payload.pullRequest,
    fetchImpl,
  );
}

export function fetchGithubIssues(
  serverBaseUrl: string | string[] | undefined,
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubResourceResult<GithubIssueSummary[]>> {
  return fetchGithubResource(
    serverBaseUrl,
    `/integrations/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    (payload) => payload.issues,
    fetchImpl,
  );
}

/** badge label/variant for an honest fetch outcome (StatusBadge variants) */
export function githubOutcomeLabel(outcome: GithubResourceOutcome): {
  text: string;
  variant: "success" | "warning" | "danger" | "muted";
} {
  switch (outcome) {
    case "observed":
      return { text: "관측됨", variant: "success" };
    case "not_configured":
      return { text: "미설정", variant: "muted" };
    case "permission_denied":
      return { text: "권한 부족", variant: "warning" };
    case "connection_failed":
      return { text: "연결 실패", variant: "danger" };
    case "github_error":
      return { text: "GitHub 오류", variant: "danger" };
  }
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

// ── W1b: comment write client helpers (서버 라우트만 호출 — 직접 GitHub 호출 없음) ──

/**
 * 브라우저용 sha256 — Web Crypto API. 서버의 createHash sha256과 결과가 같다.
 * preview 일치 확인뿐 아니라 서버에 보내는 bodySha256 (execute의 무결성 키)에 쓴다.
 */
export async function sha256Hex(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function postJson<TIn, TOut>(
  serverBaseUrl: string | string[] | undefined,
  path: string,
  body: TIn,
  fetchImpl: typeof fetch,
): Promise<TOut> {
  const base = resolveServerBaseUrl(serverBaseUrl);
  if (!base) throw new Error("서버 미연결 — 코딩 서버 주소가 없습니다.");
  const response = await fetchImpl(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as TOut;
}

export function postGithubCommentPlan(
  serverBaseUrl: string | string[] | undefined,
  request: GithubCommentWritePlanRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubCommentWritePlanResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/comment/plan", request, fetchImpl);
}

export function postGithubCommentExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubCommentWriteExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubCommentWriteExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/comment/execute", request, fetchImpl);
}

// ── W2/W3/W4 client helpers — Publish Panel이 단일 흐름으로 쓰는 진입점들 ──
// 모든 호출은 서버 라우트를 forwarder처럼 호출만 한다. token/header는 서버 env에만.

export function postGithubBranchPlan(
  serverBaseUrl: string | string[] | undefined,
  request: GithubBranchCreatePlanRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubBranchCreatePlanResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/branch/plan", request, fetchImpl);
}

export function postGithubBranchExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubBranchCreateExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubBranchCreateExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/branch/execute", request, fetchImpl);
}

export function postGithubFileChangePlan(
  serverBaseUrl: string | string[] | undefined,
  request: GithubFileChangePlanRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubFileChangePlanResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/file/plan", request, fetchImpl);
}

export function postGithubFileChangeExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubFileChangeExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubFileChangeExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/file/execute", request, fetchImpl);
}

/**
 * W5b — Multi-file atomic commit execute. 서버가 blob → tree → commit → ref(force=false)로
 * 처리한다. 클라이언트는 단순 transport — 가드는 서버가 다시 검증한다.
 */
export function postGithubMultiFileCommitExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubMultiFileCommitExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubMultiFileCommitExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/multifile/commit/execute", request, fetchImpl);
}

export function postGithubPullRequestPlan(
  serverBaseUrl: string | string[] | undefined,
  request: GithubPullRequestCreatePlanRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestCreatePlanResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/pr/plan", request, fetchImpl);
}

export function postGithubPullRequestExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubPullRequestCreateExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestCreateExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/pr/execute", request, fetchImpl);
}

/**
 * W5c — PR title/body update plan. 서버가 PR을 read하고 diff sha를 계산해 plan 응답으로
 * 돌려준다. 본문 raw는 서버에 저장되며 응답에는 excerpt만 노출.
 */
export function postGithubPullRequestUpdatePlan(
  serverBaseUrl: string | string[] | undefined,
  request: GithubPullRequestUpdatePlanRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestUpdatePlanResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/pr/update/plan", request, fetchImpl);
}

/**
 * W5c — PR title/body update execute. approvalId 필수, TOCTOU 검증은 서버가 다시 수행.
 */
export function postGithubPullRequestUpdateExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubPullRequestUpdateExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestUpdateExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/pr/update/execute", request, fetchImpl);
}

/**
 * W5d Phase 1 — PR labels add/remove plan. 서버가 현재 labels read + diff 계산 + 무결성 hash까지.
 */
export function postGithubPullRequestLabelsUpdatePlan(
  serverBaseUrl: string | string[] | undefined,
  request: GithubPullRequestLabelsUpdatePlanRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestLabelsUpdatePlanResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/pr/labels/plan", request, fetchImpl);
}

/**
 * W5d Phase 1 — PR labels update execute. approvalId 필수, TOCTOU 검증은 서버가 다시.
 * GitHub PUT /issues/:n/labels로 final desired set을 atomic하게 적용.
 */
export function postGithubPullRequestLabelsUpdateExecute(
  serverBaseUrl: string | string[] | undefined,
  request: GithubPullRequestLabelsUpdateExecuteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubPullRequestLabelsUpdateExecuteResponse> {
  return postJson(serverBaseUrl, "/integrations/github/write/pr/labels/execute", request, fetchImpl);
}
