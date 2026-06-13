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

/** GET /integrations/github/status */
export const githubConnectorStatusResponseSchema = z.object({
  status: githubConnectorStatusSchema,
});
export type GithubConnectorStatusResponse = z.infer<typeof githubConnectorStatusResponseSchema>;

/** GET /integrations/github/repos/:owner/:repo/pulls|issues|overview */
export const githubReadonlyResourceResponseSchema = z.object({
  status: githubConnectorStatusSchema,
  repo: z.string(),
  overview: githubRepoSummarySchema.optional(),
  pullRequests: z.array(githubPullRequestSummarySchema).optional(),
  issues: z.array(githubIssueSummarySchema).optional(),
});
export type GithubReadonlyResourceResponse = z.infer<typeof githubReadonlyResourceResponseSchema>;
