import {
  GithubNotConfiguredError,
  GithubReadonlyError,
  type GithubReadonlyClient,
} from "../integrations/githubReadonlyClient.js";
import type { GithubResourceOutcome } from "@ai-orchestrator/protocol";

/**
 * Read-only GitHub connector routes. Every route is GET; there is no write
 * surface. The token never crosses this boundary — only the connector status
 * (booleans) and read-only resources do.
 *
 * Outcomes are honest and distinct: only `observed` carries real HTTP-200 data;
 * `not_configured` / `permission_denied` (401·403) / `connection_failed`
 * (network) / `github_error` each name exactly why there is no data, so the UI
 * never shows an empty list that looks like "no PRs".
 *
 *   GET /integrations/github/status
 *   GET /integrations/github/repos/:owner/:repo/overview
 *   GET /integrations/github/repos/:owner/:repo/pulls
 *   GET /integrations/github/repos/:owner/:repo/pulls/:number
 *   GET /integrations/github/repos/:owner/:repo/issues
 */

export type GithubRouteDependencies = {
  pathname: string;
  method?: string;
  /** builds a client from the server-side token (env). Injected for testability. */
  createClient: () => GithubReadonlyClient;
  respondJson: (statusCode: number, payload: unknown) => void;
  /** ISO clock — injected for deterministic observedAt in tests */
  now?: () => string;
};

const REPO_RESOURCE = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/(overview|pulls|issues)$/;
const PR_DETAIL = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/;
const FILE_RESOURCE = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/file$/;

const NOT_CONFIGURED_MESSAGE = "미설정 — 서버 GITHUB_TOKEN을 설정하면 조회됩니다.";

function parseState(pathname: string): "open" | "closed" | "all" {
  const match = /[?&]state=(open|closed|all)\b/.exec(pathname);
  return (match?.[1] as "open" | "closed" | "all" | undefined) ?? "open";
}

/** map a thrown error to an honest, distinct outcome the UI can render */
function outcomeForError(error: unknown): { outcome: GithubResourceOutcome; message: string } {
  if (error instanceof GithubNotConfiguredError) {
    return { outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE };
  }
  if (error instanceof GithubReadonlyError) {
    if (error.status === 401 || error.status === 403) {
      return { outcome: "permission_denied", message: "권한 부족 — 토큰 스코프 또는 저장소 접근 권한을 확인하세요." };
    }
    if (error.status === 0) {
      return { outcome: "connection_failed", message: "연결 실패 — GitHub에 도달하지 못했습니다." };
    }
    return { outcome: "github_error", message: error.message };
  }
  return { outcome: "github_error", message: error instanceof Error ? error.message : String(error) };
}

export async function handleGithubRoute({
  pathname,
  method,
  createClient,
  respondJson,
  now = () => new Date().toISOString(),
}: GithubRouteDependencies): Promise<boolean> {
  if (!pathname.startsWith("/integrations/github/")) return false;
  if ((method ?? "GET") !== "GET") {
    // read-only connector — reject any non-GET verb explicitly
    respondJson(405, { error: "method_not_allowed", message: "GitHub 커넥터는 읽기 전용입니다" });
    return true;
  }

  const pathOnly = pathname.split("?")[0] ?? pathname;

  if (pathOnly === "/integrations/github/status") {
    respondJson(200, { status: createClient().status() });
    return true;
  }

  const detailMatch = PR_DETAIL.exec(pathOnly);
  if (detailMatch) {
    const owner = decodeURIComponent(detailMatch[1]!);
    const repo = decodeURIComponent(detailMatch[2]!);
    const pullNumber = Number(detailMatch[3]!);
    const client = createClient();
    const status = client.status();
    const repoLabel = `${owner}/${repo}`;
    if (!status.configured) {
      respondJson(200, { status, repo: repoLabel, outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE });
      return true;
    }
    try {
      const pullRequest = await client.getPullRequest(owner, repo, pullNumber);
      respondJson(200, { status, repo: repoLabel, outcome: "observed", observedAt: now(), pullRequest });
    } catch (error) {
      const mapped = outcomeForError(error);
      respondJson(200, { status, repo: repoLabel, ...mapped });
    }
    return true;
  }

  const fileMatch = FILE_RESOURCE.exec(pathOnly);
  if (fileMatch) {
    const owner = decodeURIComponent(fileMatch[1]!);
    const repo = decodeURIComponent(fileMatch[2]!);
    const query = new URLSearchParams(pathname.includes("?") ? pathname.slice(pathname.indexOf("?") + 1) : "");
    const filePath = (query.get("path") ?? "").trim();
    const ref = query.get("ref")?.trim() || undefined;
    const client = createClient();
    const status = client.status();
    const repoLabel = `${owner}/${repo}`;
    if (!status.configured) {
      respondJson(200, { status, repo: repoLabel, outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE });
      return true;
    }
    if (!filePath) {
      respondJson(200, { status, repo: repoLabel, outcome: "github_error", message: "path 쿼리 파라미터가 필요합니다" });
      return true;
    }
    try {
      const file = await client.getFileContent(owner, repo, filePath, ref);
      respondJson(200, { status, repo: repoLabel, outcome: "observed", observedAt: now(), file });
    } catch (error) {
      const mapped = outcomeForError(error);
      respondJson(200, { status, repo: repoLabel, ...mapped });
    }
    return true;
  }

  const repoMatch = REPO_RESOURCE.exec(pathOnly);
  if (repoMatch) {
    const owner = decodeURIComponent(repoMatch[1]!);
    const repo = decodeURIComponent(repoMatch[2]!);
    const resource = repoMatch[3]!;
    const client = createClient();
    const status = client.status();
    const repoLabel = `${owner}/${repo}`;
    if (!status.configured) {
      respondJson(200, { status, repo: repoLabel, outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE });
      return true;
    }
    try {
      const observedAt = now();
      if (resource === "overview") {
        respondJson(200, { status, repo: repoLabel, outcome: "observed", observedAt, overview: await client.getRepoOverview(owner, repo) });
      } else if (resource === "pulls") {
        respondJson(200, {
          status,
          repo: repoLabel,
          outcome: "observed",
          observedAt,
          pullRequests: await client.listPullRequests(owner, repo, { state: parseState(pathname) }),
        });
      } else {
        respondJson(200, {
          status,
          repo: repoLabel,
          outcome: "observed",
          observedAt,
          issues: await client.listIssues(owner, repo, { state: parseState(pathname) }),
        });
      }
    } catch (error) {
      const mapped = outcomeForError(error);
      respondJson(200, { status, repo: repoLabel, ...mapped });
    }
    return true;
  }

  respondJson(404, { error: "github_route_not_found", pathname: pathOnly });
  return true;
}
