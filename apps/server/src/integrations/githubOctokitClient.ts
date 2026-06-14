import { request as octokitRequest } from "@octokit/request";
import type {
  GithubPullRequestDetail,
} from "@ai-orchestrator/protocol";
import {
  GithubNotConfiguredError,
  GithubReadonlyError,
  type GithubReadonlyClient,
} from "./githubReadonlyClient";

/**
 * OSS-H2 — Octokit adapter for W5c PR read/update only.
 *
 *   - HTTP fetch 구현만 Octokit으로 교체. guard / approval / trace / protocol /
 *     route contract 전부 그대로.
 *   - 다른 메서드(getRepoOverview, listPullRequests, createBranchRef, …)는
 *     기존 fetch client에 위임한다 — 한 경로만 교체하는 것이 목표.
 *   - token redaction: @octokit/request의 RequestError는 url을 노출하지만
 *     authorization 헤더는 포함하지 않는다. 그래도 본문 에러를 throw 하기 전에
 *     token 문자열을 한 번 더 scrub한다.
 *
 * Upstream: https://github.com/octokit/request.js (MIT)
 *   adopted at: OSS-H2 (commit following 5b0445f)
 */

const GITHUB_API_BASE = "https://api.github.com";

export type OctokitPullRequestAdapterOptions = {
  token?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

function scrub(text: string, token?: string): string {
  if (!token) return text;
  return text.split(token).join("‹redacted-token›");
}

type OctokitRequestFn = typeof octokitRequest;

/** Build an octokit request fn with our default headers + custom fetch. */
function buildRequester(opts: OctokitPullRequestAdapterOptions): OctokitRequestFn {
  const baseUrl = (opts.baseUrl ?? GITHUB_API_BASE).replace(/\/$/, "");
  return octokitRequest.defaults({
    baseUrl,
    headers: {
      authorization: opts.token ? `Bearer ${opts.token}` : "",
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "ai-orchestrator-lab-octokit-pr-adapter",
    },
    // @octokit/request reads fetch from the request hook — overriding it makes
    // every call go through our injected fetch (so tests can mock it the same
    // way the existing fetch client supports).
    request: opts.fetchImpl ? { fetch: opts.fetchImpl } : undefined,
  });
}

/** Read-only subset implemented by the Octokit adapter. */
export type OctokitPullRequestAdapter = Pick<
  GithubReadonlyClient,
  "getPullRequest" | "updatePullRequest"
>;

export function createOctokitPullRequestAdapter(
  opts: OctokitPullRequestAdapterOptions,
): OctokitPullRequestAdapter {
  const token = opts.token?.trim() || undefined;
  const requester = buildRequester({ ...opts, token });

  function rethrowAsReadonlyError(error: unknown): never {
    // @octokit/request throws RequestError with a `.status` and `.message`.
    // Other errors (network, fetch impl crashes) become status=0.
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 0;
    const message = error instanceof Error ? error.message : String(error);
    throw new GithubReadonlyError(scrub(message, token), status);
  }

  async function getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GithubPullRequestDetail> {
    if (!token) throw new GithubNotConfiguredError();
    let response: { data: Record<string, unknown> };
    try {
      response = (await requester("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: pullNumber,
      })) as { data: Record<string, unknown> };
    } catch (error) {
      rethrowAsReadonlyError(error);
    }
    const pr = response.data;
    const numberOrNull = (value: unknown): number | null =>
      typeof value === "number" ? value : null;
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
  }

  async function updatePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    params: { title?: string; body?: string },
  ): Promise<{
    pullNumber: number;
    htmlUrl: string;
    title: string;
    body: string;
    updatedAt: string;
  }> {
    if (!token) throw new GithubNotConfiguredError();
    // 받은 키만 PATCH 본문에 싣는다 — fetch client와 동일한 정책.
    const patchBody: Record<string, string> = {};
    if (params.title !== undefined) patchBody.title = params.title;
    if (params.body !== undefined) patchBody.body = params.body;
    let response: { data: Record<string, unknown> };
    try {
      response = (await requester("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: pullNumber,
        ...patchBody,
      })) as { data: Record<string, unknown> };
    } catch (error) {
      rethrowAsReadonlyError(error);
    }
    const raw = response.data;
    const num = typeof raw.number === "number" ? raw.number : pullNumber;
    const htmlUrl =
      typeof raw.html_url === "string"
        ? raw.html_url
        : `https://github.com/${owner}/${repo}/pull/${num}`;
    const title = typeof raw.title === "string" ? raw.title : "";
    const bodyText = typeof raw.body === "string" ? raw.body : "";
    const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : "";
    return { pullNumber: num, htmlUrl, title, body: bodyText, updatedAt };
  }

  return { getPullRequest, updatePullRequest };
}

/**
 * Compose a full GithubReadonlyClient: PR read/update via Octokit adapter,
 * everything else via the existing fetch-based base client. This keeps the
 * Octokit swap surgical — one route's worth of behavior changes, every other
 * caller is byte-identical.
 */
export function composeGithubClientWithOctokitPRs(
  base: GithubReadonlyClient,
  opts: OctokitPullRequestAdapterOptions,
): GithubReadonlyClient {
  const adapter = createOctokitPullRequestAdapter(opts);
  return {
    ...base,
    getPullRequest: adapter.getPullRequest,
    updatePullRequest: adapter.updatePullRequest,
  };
}
