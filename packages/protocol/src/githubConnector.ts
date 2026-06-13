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

/** read-only file content — bounded text, never the raw whole file unbounded */
export const githubFileContentSchema = z.object({
  path: z.string(),
  size: z.number(),
  sha: z.string(),
  htmlUrl: z.string(),
  /** decoded UTF-8 text, capped — `truncated` marks when the original was longer */
  content: z.string(),
  truncated: z.boolean(),
  encoding: z.literal("utf8"),
});
export type GithubFileContent = z.infer<typeof githubFileContentSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// W1: GitHub comment write (PR/Issue comment create — only write surface)
// 사용자 수정 조건: MCP execute 포함, GITHUB_TOKEN 단일, comment-execute는 1회 armed 후 가능.
// 양보 불가 안전선:
//   - repo allowlist 통과
//   - body length 캡 + bodySha256 무결성
//   - secret 스캔(API 키·토큰 패턴 발견 시 차단)
//   - approval-or-armed (둘 중 하나는 반드시)
//   - kind는 comment_create만
//   - token scope 미추정(GitHub 403 → permission_denied)
// ──────────────────────────────────────────────────────────────────────────────

/** plan/execute에서 표현 가능한 결과 — observed는 GitHub HTTP 200/201 실응답만. */
export const githubCommentWriteOutcomeSchema = z.enum([
  "observed",
  "planned",
  "approval_required",
  "blocked",
  "not_configured",
  "permission_denied",
  "connection_failed",
  "github_error",
]);
export type GithubCommentWriteOutcome = z.infer<typeof githubCommentWriteOutcomeSchema>;

/** comment write에서 단 하나 허용되는 action(다른 write 액션 절대 추가 금지). */
export const githubCommentWriteActionSchema = z.literal("comment_create");
export type GithubCommentWriteAction = z.infer<typeof githubCommentWriteActionSchema>;

/** plan 요청(서버는 GITHUB_TOKEN으로 target 존재만 확인 — 실제 게시 없음). */
export const githubCommentWritePlanRequestSchema = z.object({
  action: githubCommentWriteActionSchema.default("comment_create"),
  repoFullName: z
    .string()
    .min(3)
    .max(140)
    // 안전선: 단순 정규식 — 실제 검증은 서버가 allowlist까지 본다.
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "owner/repo 형식이 필요합니다"),
  number: z.number().int().positive(),
  /** "issue" | "pull_request" — GitHub API는 둘 다 동일 endpoint(issues/:n/comments)를 쓴다. */
  targetKind: z.enum(["issue", "pull_request"]),
  body: z.string().min(1).max(16_000),
});
export type GithubCommentWritePlanRequest = z.infer<typeof githubCommentWritePlanRequestSchema>;

/** plan 자체는 외부 GitHub에 흔적을 남기지 않는다. status는 plan 라이프사이클을 표현. */
export const githubCommentWritePlanSchema = z.object({
  id: z.string(),
  action: githubCommentWriteActionSchema,
  repoFullName: z.string(),
  number: z.number().int().positive(),
  targetKind: z.enum(["issue", "pull_request"]),
  bodyPreview: z.string(),
  bodySha256: z.string(),
  bodyLength: z.number().int().nonnegative(),
  targetUrl: z.string(),
  /** plan 라이프사이클 — created/blocked는 실제 게시 단계가 아니라 execute에서만 갈 수 있음 */
  status: z.enum([
    "planned",
    "approval_required",
    "blocked",
    "auto_execute_armed",
    "executing",
    "created",
    "failed",
  ]),
  /** plan 단계는 항상 planned(외부 흔적 없음) — observed는 execute 성공일 때만. */
  truthStatus: z.enum(["planned", "observed", "configured"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  approvalId: z.string().optional(),
  /** 막혔다면 그 이유(allowlist/secret/길이/미설정 등). */
  blockedReason: z.string().optional(),
});
export type GithubCommentWritePlan = z.infer<typeof githubCommentWritePlanSchema>;

export const githubCommentWritePlanResponseSchema = z.object({
  outcome: githubCommentWriteOutcomeSchema,
  plan: githubCommentWritePlanSchema.optional(),
  /** outcome이 not_configured/permission_denied/connection_failed/blocked일 때의 안내 */
  message: z.string().optional(),
});
export type GithubCommentWritePlanResponse = z.infer<typeof githubCommentWritePlanResponseSchema>;

/** execute 요청 — planId + 서버가 가진 sha와 일치해야 함(replay payload 변조 방지). */
export const githubCommentWriteExecuteRequestSchema = z.object({
  planId: z.string(),
  bodySha256: z.string(),
  /** approval-or-armed: 둘 중 하나가 반드시 통과 — 둘 다 없으면 blocked. */
  approvalId: z.string().optional(),
  /** 사용자가 명시 armed한 자동실행 세션이면 true(서버는 armedAt까지 추가 검증). */
  autoExecuteArmed: z.boolean().optional(),
  armedAt: z.string().optional(),
});
export type GithubCommentWriteExecuteRequest = z.infer<typeof githubCommentWriteExecuteRequestSchema>;

export const githubCommentWriteExecuteResponseSchema = z.object({
  outcome: githubCommentWriteOutcomeSchema,
  planId: z.string(),
  commentId: z.number().optional(),
  htmlUrl: z.string().optional(),
  observedAt: z.string().optional(),
  message: z.string().optional(),
  truthStatus: z.enum(["planned", "observed", "configured"]),
});
export type GithubCommentWriteExecuteResponse = z.infer<typeof githubCommentWriteExecuteResponseSchema>;

/** GET /integrations/github/repos/:owner/:repo/pulls|pulls/:n|issues|overview|file */
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
  file: githubFileContentSchema.optional(),
});
export type GithubReadonlyResourceResponse = z.infer<typeof githubReadonlyResourceResponseSchema>;
