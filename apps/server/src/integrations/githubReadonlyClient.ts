import type {
  GithubConnectorStatus,
  GithubFileContent,
  GithubIssueSummary,
  GithubPullRequestDetail,
  GithubPullRequestSummary,
  GithubRepoSummary,
} from "@ai-orchestrator/protocol";

/** bounded file-read excerpt — never return the whole raw file unbounded */
const MAX_FILE_CHARS = 24_000;

/**
 * Read-only GitHub connector — server-side. The token lives ONLY here (server
 * env), never in the browser bundle and never returned to the client. The
 * client is read-only by construction: it issues GET requests only and exposes
 * no write methods. Errors are scrubbed of the token before they ever surface.
 *
 * This is the connector FEATURE (so an operator can enable GitHub by setting a
 * token) — it performs no work until a token is configured; with no token the
 * status is honestly `configured: false` and resource calls throw
 * GithubNotConfiguredError instead of pretending to connect.
 */

const GITHUB_API_BASE = "https://api.github.com";
const SCOPES_NEEDED = ["repo (read-only) 또는 public_repo"];

export class GithubNotConfiguredError extends Error {
  constructor() {
    super("GitHub 커넥터가 설정되지 않았습니다 (서버 env GITHUB_TOKEN 필요)");
    this.name = "GithubNotConfiguredError";
  }
}

export class GithubReadonlyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GithubReadonlyError";
  }
}

export type GithubReadonlyClientOptions = {
  token?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export function githubConnectorStatus(token?: string): GithubConnectorStatus {
  const tokenPresent = typeof token === "string" && token.trim().length > 0;
  return {
    id: "github",
    name: "GitHub (읽기 전용)",
    mode: "read_only",
    configured: tokenPresent,
    tokenPresent,
    scopesNeeded: SCOPES_NEEDED,
    note: tokenPresent
      ? "읽기 전용으로 PR·이슈·저장소 개요를 조회할 수 있습니다. 쓰기 작업은 지원하지 않습니다."
      : "서버 env GITHUB_TOKEN을 설정하면 활성화됩니다(읽기 전용 스코프 권장). 토큰은 서버에만 저장되며 클라이언트로 전달되지 않습니다.",
  };
}

/** remove the token from any string before it is thrown/logged */
function scrub(text: string, token?: string): string {
  if (!token) return text;
  return text.split(token).join("‹redacted-token›");
}

export type GithubReadonlyClient = {
  status(): GithubConnectorStatus;
  getRepoOverview(owner: string, repo: string): Promise<GithubRepoSummary>;
  listPullRequests(owner: string, repo: string, opts?: { state?: "open" | "closed" | "all"; perPage?: number }): Promise<GithubPullRequestSummary[]>;
  getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GithubPullRequestDetail>;
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GithubFileContent>;
  listIssues(owner: string, repo: string, opts?: { state?: "open" | "closed" | "all"; perPage?: number }): Promise<GithubIssueSummary[]>;
};

export function createGithubReadonlyClient(options: GithubReadonlyClientOptions = {}): GithubReadonlyClient {
  const token = options.token?.trim() || undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? GITHUB_API_BASE).replace(/\/$/, "");

  async function getJson(path: string): Promise<unknown> {
    if (!token) throw new GithubNotConfiguredError();
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "ai-orchestrator-lab-readonly",
        },
      });
    } catch (error) {
      throw new GithubReadonlyError(scrub(error instanceof Error ? error.message : String(error), token), 0);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GithubReadonlyError(scrub(`GitHub ${response.status}: ${body.slice(0, 200)}`, token), response.status);
    }
    return response.json();
  }

  return {
    status: () => githubConnectorStatus(token),

    async getRepoOverview(owner, repo) {
      const raw = (await getJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)) as Record<string, unknown>;
      return {
        fullName: String(raw.full_name ?? `${owner}/${repo}`),
        description: typeof raw.description === "string" ? raw.description : null,
        defaultBranch: String(raw.default_branch ?? "main"),
        openIssues: Number(raw.open_issues_count ?? 0),
        stars: Number(raw.stargazers_count ?? 0),
        private: Boolean(raw.private),
        htmlUrl: String(raw.html_url ?? ""),
      };
    },

    async listPullRequests(owner, repo, opts) {
      const state = opts?.state ?? "open";
      const perPage = Math.min(Math.max(opts?.perPage ?? 20, 1), 100);
      const raw = (await getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&per_page=${perPage}`,
      )) as Array<Record<string, unknown>>;
      return (Array.isArray(raw) ? raw : []).map((pr) => ({
        number: Number(pr.number ?? 0),
        title: String(pr.title ?? ""),
        state: String(pr.state ?? ""),
        author: String((pr.user as Record<string, unknown> | undefined)?.login ?? "unknown"),
        draft: Boolean(pr.draft),
        htmlUrl: String(pr.html_url ?? ""),
        createdAt: String(pr.created_at ?? ""),
        updatedAt: String(pr.updated_at ?? ""),
      }));
    },

    async getPullRequest(owner, repo, pullNumber) {
      const pr = (await getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(pullNumber))}`,
      )) as Record<string, unknown>;
      const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);
      return {
        number: Number(pr.number ?? pullNumber),
        title: String(pr.title ?? ""),
        state: String(pr.state ?? ""),
        author: String((pr.user as Record<string, unknown> | undefined)?.login ?? "unknown"),
        draft: Boolean(pr.draft),
        htmlUrl: String(pr.html_url ?? ""),
        createdAt: String(pr.created_at ?? ""),
        updatedAt: String(pr.updated_at ?? ""),
        body: typeof pr.body === "string" ? pr.body : "",
        baseRef: String((pr.base as Record<string, unknown> | undefined)?.ref ?? ""),
        headRef: String((pr.head as Record<string, unknown> | undefined)?.ref ?? ""),
        merged: Boolean(pr.merged),
        additions: numberOrNull(pr.additions),
        deletions: numberOrNull(pr.deletions),
        changedFiles: numberOrNull(pr.changed_files),
        commits: numberOrNull(pr.commits),
      };
    },

    async getFileContent(owner, repo, path, ref) {
      const encodedPath = path
        .split("/")
        .filter((segment) => segment.length > 0)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const raw = await getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${refQuery}`,
      );
      if (Array.isArray(raw)) {
        throw new GithubReadonlyError("경로가 파일이 아니라 디렉터리입니다", 422);
      }
      const record = raw as Record<string, unknown>;
      const encoding = String(record.encoding ?? "");
      const rawContent = typeof record.content === "string" ? record.content : "";
      let text = "";
      if (encoding === "base64" && rawContent) {
        try {
          text = Buffer.from(rawContent.replace(/\n/g, ""), "base64").toString("utf8");
        } catch {
          text = "";
        }
      }
      const truncated = text.length > MAX_FILE_CHARS;
      return {
        path: String(record.path ?? path),
        size: Number(record.size ?? 0),
        sha: String(record.sha ?? ""),
        htmlUrl: String(record.html_url ?? ""),
        content: truncated ? text.slice(0, MAX_FILE_CHARS) : text,
        truncated,
        encoding: "utf8",
      };
    },

    async listIssues(owner, repo, opts) {
      const state = opts?.state ?? "open";
      const perPage = Math.min(Math.max(opts?.perPage ?? 20, 1), 100);
      const raw = (await getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${state}&per_page=${perPage}`,
      )) as Array<Record<string, unknown>>;
      // GitHub's issues endpoint includes PRs (they carry `pull_request`); drop them.
      return (Array.isArray(raw) ? raw : [])
        .filter((issue) => !("pull_request" in issue))
        .map((issue) => ({
          number: Number(issue.number ?? 0),
          title: String(issue.title ?? ""),
          state: String(issue.state ?? ""),
          author: String((issue.user as Record<string, unknown> | undefined)?.login ?? "unknown"),
          comments: Number(issue.comments ?? 0),
          htmlUrl: String(issue.html_url ?? ""),
          createdAt: String(issue.created_at ?? ""),
          updatedAt: String(issue.updated_at ?? ""),
        }));
    },
  };
}
