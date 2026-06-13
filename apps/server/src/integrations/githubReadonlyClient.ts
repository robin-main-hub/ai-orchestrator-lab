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
  /**
   * W1 — comment write의 단 하나 허용된 POST. token은 read와 동일(분리하지 않음).
   * 안전 게이트(allowlist/sha/secret-scan/body-cap)는 호출 전에 반드시 통과해야 한다.
   * GitHub 응답이 201일 때만 `{ id, html_url }` 반환; 그 외는 GithubReadonlyError로 던진다.
   */
  postIssueComment(owner: string, repo: string, number: number, body: string): Promise<{ id: number; htmlUrl: string }>;
  /**
   * W2 — source ref의 현재 sha를 GET. 존재하지 않으면 GithubReadonlyError(404).
   * plan에서 sha를 observed로 못 박아 두고, execute에서 같은 sha를 재확인해
   * "내가 plan한 source가 그 사이 바뀌었는지"를 정직하게 막는다.
   */
  getRefSha(owner: string, repo: string, ref: string): Promise<string>;
  /**
   * W2 — POST /repos/:owner/:repo/git/refs로 새 branch 생성.
   * 응답이 201일 때만 `{ ref, sha, html_url }` 반환. 422(already exists 등)는
   * 호출자가 outcome=already_exists로 매핑한다.
   */
  createBranchRef(
    owner: string,
    repo: string,
    refName: string,
    sha: string,
  ): Promise<{ ref: string; sha: string; htmlUrl: string }>;
  /**
   * W3b — PUT /repos/:owner/:repo/contents/:path. single file create/update.
   * 호출자(서버 게이트)가 sha 무결성/approval/path policy를 사전에 통과시켜야 함.
   * 응답 200(update)/201(create)일 때만 `{ commitSha, blobSha, htmlUrl }` 반환.
   * 409(conflict)/422(sha mismatch 등)는 호출자가 outcome으로 매핑한다.
   *
   * content는 UTF-8 텍스트(서버가 base64로 인코딩해서 보냄). sha는 update 시에만 보낸다.
   */
  putFileContents(
    owner: string,
    repo: string,
    path: string,
    params: { branch: string; content: string; message: string; sha?: string },
  ): Promise<{ commitSha: string; blobSha: string; htmlUrl: string }>;
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

    async postIssueComment(owner, repo, number, body) {
      if (!token) throw new GithubNotConfiguredError();
      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(String(number))}/comments`,
          {
            method: "POST",
            headers: {
              accept: "application/vnd.github+json",
              authorization: `Bearer ${token}`,
              "x-github-api-version": "2022-11-28",
              "user-agent": "ai-orchestrator-lab-comment-write",
              "content-type": "application/json",
            },
            body: JSON.stringify({ body }),
          },
        );
      } catch (error) {
        throw new GithubReadonlyError(scrub(error instanceof Error ? error.message : String(error), token), 0);
      }
      if (response.status !== 201) {
        const text = await response.text().catch(() => "");
        throw new GithubReadonlyError(scrub(`GitHub ${response.status}: ${text.slice(0, 200)}`, token), response.status);
      }
      const raw = (await response.json()) as Record<string, unknown>;
      return { id: Number(raw.id ?? 0), htmlUrl: String(raw.html_url ?? "") };
    },

    async getRefSha(owner, repo, ref) {
      if (!token) throw new GithubNotConfiguredError();
      // GitHub git/refs/heads/<name> — branch만 다룬다.
      const raw = (await getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(ref)}`,
      )) as Record<string, unknown>;
      const sha = (raw.object as Record<string, unknown> | undefined)?.sha;
      if (typeof sha !== "string" || !sha) {
        throw new GithubReadonlyError("source ref에 sha가 없습니다", 422);
      }
      return sha;
    },

    async createBranchRef(owner, repo, refName, sha) {
      if (!token) throw new GithubNotConfiguredError();
      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
          {
            method: "POST",
            headers: {
              accept: "application/vnd.github+json",
              authorization: `Bearer ${token}`,
              "x-github-api-version": "2022-11-28",
              "user-agent": "ai-orchestrator-lab-branch-write",
              "content-type": "application/json",
            },
            body: JSON.stringify({ ref: refName, sha }),
          },
        );
      } catch (error) {
        throw new GithubReadonlyError(scrub(error instanceof Error ? error.message : String(error), token), 0);
      }
      if (response.status !== 201) {
        const text = await response.text().catch(() => "");
        throw new GithubReadonlyError(scrub(`GitHub ${response.status}: ${text.slice(0, 200)}`, token), response.status);
      }
      const raw = (await response.json()) as Record<string, unknown>;
      const respRef = String(raw.ref ?? refName);
      const objSha = String((raw.object as Record<string, unknown> | undefined)?.sha ?? sha);
      const htmlUrl = `https://github.com/${owner}/${repo}/tree/${respRef.replace(/^refs\/heads\//, "")}`;
      return { ref: respRef, sha: objSha, htmlUrl };
    },

    async putFileContents(owner, repo, path, params) {
      if (!token) throw new GithubNotConfiguredError();
      // base64 인코딩 — GitHub Contents API의 요구. 텍스트만 들어오는 게 게이트에서 강제됨.
      const base64 = Buffer.from(params.content, "utf8").toString("base64");
      const body: Record<string, unknown> = {
        message: params.message,
        content: base64,
        branch: params.branch,
      };
      if (params.sha) body.sha = params.sha;
      // path는 segment 단위로 인코딩(슬래시 보존) — getFileContent와 같은 규칙.
      const encodedPath = path
        .split("/")
        .filter((segment) => segment.length > 0)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
          {
            method: "PUT",
            headers: {
              accept: "application/vnd.github+json",
              authorization: `Bearer ${token}`,
              "x-github-api-version": "2022-11-28",
              "user-agent": "ai-orchestrator-lab-file-write",
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );
      } catch (error) {
        throw new GithubReadonlyError(scrub(error instanceof Error ? error.message : String(error), token), 0);
      }
      // 200 = update, 201 = create. 그 외는 모두 실패.
      if (response.status !== 200 && response.status !== 201) {
        const text = await response.text().catch(() => "");
        throw new GithubReadonlyError(scrub(`GitHub ${response.status}: ${text.slice(0, 200)}`, token), response.status);
      }
      const raw = (await response.json()) as Record<string, unknown>;
      const commit = raw.commit as Record<string, unknown> | undefined;
      const content = raw.content as Record<string, unknown> | undefined;
      const commitSha = typeof commit?.sha === "string" ? commit.sha : "";
      const blobSha = typeof content?.sha === "string" ? content.sha : "";
      const htmlUrl = typeof content?.html_url === "string" ? content.html_url : `https://github.com/${owner}/${repo}/blob/${params.branch}/${path}`;
      if (!commitSha || !blobSha) {
        throw new GithubReadonlyError("GitHub PUT 응답에 commit.sha/blob.sha가 없습니다", 502);
      }
      return { commitSha, blobSha, htmlUrl };
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
