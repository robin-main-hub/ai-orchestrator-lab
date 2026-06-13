import { z } from "zod";

/**
 * Read-only GitHub connector contract. The connector is intentionally
 * read-only: it exposes repo metadata, pull requests, and issues, and has no
 * write surface. The token lives ONLY on the server (env), so these types never
 * carry the token itself — only `tokenPresent`/`configured` booleans.
 */

export const githubConnectorModeSchema = z.literal("read_only");
export type GithubConnectorMode = z.infer<typeof githubConnectorModeSchema>;

export const githubConnectorStatusSchema = z.object({
  id: z.literal("github"),
  name: z.string(),
  mode: githubConnectorModeSchema,
  /** true only when a token is present AND the connector can be used */
  configured: z.boolean(),
  /** whether a server-side token is present (never the token value) */
  tokenPresent: z.boolean(),
  /** scopes the operator must grant on the token for read-only use */
  scopesNeeded: z.array(z.string()),
  /** honest human note — e.g. how to configure, or that it is live-disabled */
  note: z.string(),
});
export type GithubConnectorStatus = z.infer<typeof githubConnectorStatusSchema>;

export const githubRepoSummarySchema = z.object({
  fullName: z.string(),
  description: z.string().nullable(),
  defaultBranch: z.string(),
  openIssues: z.number(),
  stars: z.number(),
  private: z.boolean(),
  htmlUrl: z.string(),
});
export type GithubRepoSummary = z.infer<typeof githubRepoSummarySchema>;

export const githubPullRequestSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  author: z.string(),
  draft: z.boolean(),
  htmlUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GithubPullRequestSummary = z.infer<typeof githubPullRequestSummarySchema>;

export const githubIssueSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  author: z.string(),
  comments: z.number(),
  htmlUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GithubIssueSummary = z.infer<typeof githubIssueSummarySchema>;

export const githubPullRequestDetailSchema = githubPullRequestSummarySchema.extend({
  /** PR description body (may be empty) */
  body: z.string(),
  baseRef: z.string(),
  headRef: z.string(),
  merged: z.boolean(),
  additions: z.number().nullable(),
  deletions: z.number().nullable(),
  changedFiles: z.number().nullable(),
  commits: z.number().nullable(),
});
export type GithubPullRequestDetail = z.infer<typeof githubPullRequestDetailSchema>;

/**
 * Honest outcome of a read-only resource fetch. Only `observed` means the data
 * came from a real GitHub HTTP 200 — it must never be assigned to cached,
 * missing, or failed data (TruthStatus "가짜 observed 금지"). The rest name the
 * exact reason there is no data, so the UI can show 미설정 / 권한 부족 / 연결 실패
 * distinctly instead of an empty list that looks like "no PRs".
 */
export const githubResourceOutcomeSchema = z.enum([
  "observed",
  "not_configured",
  "permission_denied",
  "connection_failed",
  "github_error",
]);
export type GithubResourceOutcome = z.infer<typeof githubResourceOutcomeSchema>;

/**
 * A user-selected, read-only GitHub item attached to a coding/mission context.
 * Attachments are NEVER auto-created — the user explicitly attaches one. The
 * body is a bounded, deterministic excerpt of the real GitHub response (no LLM
 * summary), so `truthStatus` is always "observed" and `summarySource` records
 * exactly where the text came from (github_observed for D2; model_generated /
 * user_edited reserved for later).
 */
export const githubContextSourceKindSchema = z.enum(["pull_request", "issue", "file", "code_search_result"]);
export type GithubContextSourceKind = z.infer<typeof githubContextSourceKindSchema>;

export const githubContextAttachmentSchema = z.object({
  /** stable dedup key — same repo+kind+number/path never attaches twice */
  id: z.string(),
  kind: githubContextSourceKindSchema,
  repoFullName: z.string(),
  number: z.number().optional(),
  path: z.string().optional(),
  title: z.string(),
  url: z.string(),
  /** when the underlying GitHub data was actually observed (server re-read) */
  observedAt: z.string(),
  truthStatus: z.literal("observed"),
  /** bounded excerpt straight from the GitHub response — no model rewriting */
  observedExcerpt: z.string(),
  /** true when the excerpt was cut to fit the budget */
  truncated: z.boolean(),
  summarySource: z.enum(["github_observed", "model_generated", "user_edited"]),
  source: z.literal("github_api"),
});
export type GithubContextAttachment = z.infer<typeof githubContextAttachmentSchema>;

/** GET /integrations/github/status */
export const githubConnectorStatusResponseSchema = z.object({
  status: githubConnectorStatusSchema,
});
export type GithubConnectorStatusResponse = z.infer<typeof githubConnectorStatusResponseSchema>;

/** GET /integrations/github/repos/:owner/:repo/pulls|pulls/:n|issues|overview */
export const githubReadonlyResourceResponseSchema = z.object({
  status: githubConnectorStatusSchema,
  repo: z.string(),
  /** honest fetch outcome — only "observed" carries real data */
  outcome: githubResourceOutcomeSchema,
  /** ISO timestamp when the data was actually observed (present only when outcome="observed") */
  observedAt: z.string().optional(),
  /** human note for non-observed outcomes (미설정 / 권한 부족 / 연결 실패) */
  message: z.string().optional(),
  overview: githubRepoSummarySchema.optional(),
  pullRequests: z.array(githubPullRequestSummarySchema).optional(),
  pullRequest: githubPullRequestDetailSchema.optional(),
  issues: z.array(githubIssueSummarySchema).optional(),
});
export type GithubReadonlyResourceResponse = z.infer<typeof githubReadonlyResourceResponseSchema>;
