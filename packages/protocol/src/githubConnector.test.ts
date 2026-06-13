import { describe, expect, it } from "vitest";
import {
  githubReadonlyResourceResponseSchema,
  githubResourceOutcomeSchema,
  githubPullRequestDetailSchema,
} from "./githubConnector.js";

describe("githubConnector schemas", () => {
  it("outcome enum은 정직한 5개 상태", () => {
    expect(githubResourceOutcomeSchema.options).toEqual([
      "observed",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
  });

  it("PR 상세는 diff stat을 null 허용으로 둔다", () => {
    const parsed = githubPullRequestDetailSchema.parse({
      number: 1,
      title: "t",
      state: "open",
      author: "a",
      draft: false,
      htmlUrl: "u",
      createdAt: "c",
      updatedAt: "u",
      body: "",
      baseRef: "main",
      headRef: "x",
      merged: false,
      additions: null,
      deletions: null,
      changedFiles: null,
      commits: null,
    });
    expect(parsed.additions).toBeNull();
  });

  it("리소스 응답은 outcome 필수, observed면 observedAt 동반 가능", () => {
    const ok = githubReadonlyResourceResponseSchema.parse({
      status: { id: "github", name: "GitHub", mode: "read_only", configured: true, tokenPresent: true, scopesNeeded: [], note: "" },
      repo: "o/r",
      outcome: "observed",
      observedAt: "2026-06-13T00:00:00.000Z",
      pullRequests: [],
    });
    expect(ok.outcome).toBe("observed");
    expect(() =>
      githubReadonlyResourceResponseSchema.parse({
        status: { id: "github", name: "GitHub", mode: "read_only", configured: false, tokenPresent: false, scopesNeeded: [], note: "" },
        repo: "o/r",
        // outcome 누락 → 실패해야 함
      }),
    ).toThrow();
  });
});
