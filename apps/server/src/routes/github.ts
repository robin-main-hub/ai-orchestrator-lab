import {
  GithubNotConfiguredError,
  type GithubReadonlyClient,
} from "../integrations/githubReadonlyClient.js";

/**
 * Read-only GitHub connector routes. Every route is GET; there is no write
 * surface. The token never crosses this boundary — only the connector status
 * (booleans) and read-only resources do.
 *
 *   GET /integrations/github/status
 *   GET /integrations/github/repos/:owner/:repo/overview
 *   GET /integrations/github/repos/:owner/:repo/pulls
 *   GET /integrations/github/repos/:owner/:repo/issues
 */

export type GithubRouteDependencies = {
  pathname: string;
  method?: string;
  /** builds a client from the server-side token (env). Injected for testability. */
  createClient: () => GithubReadonlyClient;
  respondJson: (statusCode: number, payload: unknown) => void;
};

const REPO_RESOURCE = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/(overview|pulls|issues)$/;

function parseState(pathname: string): "open" | "closed" | "all" {
  const match = /[?&]state=(open|closed|all)\b/.exec(pathname);
  return (match?.[1] as "open" | "closed" | "all" | undefined) ?? "open";
}

export async function handleGithubRoute({
  pathname,
  method,
  createClient,
  respondJson,
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

  const repoMatch = REPO_RESOURCE.exec(pathOnly);
  if (repoMatch) {
    const owner = decodeURIComponent(repoMatch[1]!);
    const repo = decodeURIComponent(repoMatch[2]!);
    const resource = repoMatch[3]!;
    const client = createClient();
    const status = client.status();
    if (!status.configured) {
      respondJson(200, {
        status,
        repo: `${owner}/${repo}`,
        note: "미설정 — 서버 GITHUB_TOKEN을 설정하면 조회됩니다.",
      });
      return true;
    }
    try {
      if (resource === "overview") {
        respondJson(200, { status, repo: `${owner}/${repo}`, overview: await client.getRepoOverview(owner, repo) });
      } else if (resource === "pulls") {
        respondJson(200, {
          status,
          repo: `${owner}/${repo}`,
          pullRequests: await client.listPullRequests(owner, repo, { state: parseState(pathname) }),
        });
      } else {
        respondJson(200, {
          status,
          repo: `${owner}/${repo}`,
          issues: await client.listIssues(owner, repo, { state: parseState(pathname) }),
        });
      }
    } catch (error) {
      if (error instanceof GithubNotConfiguredError) {
        respondJson(200, { status, repo: `${owner}/${repo}`, note: "미설정 — 서버 GITHUB_TOKEN을 설정하면 조회됩니다." });
        return true;
      }
      respondJson(502, {
        error: "github_readonly_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  respondJson(404, { error: "github_route_not_found", pathname: pathOnly });
  return true;
}
