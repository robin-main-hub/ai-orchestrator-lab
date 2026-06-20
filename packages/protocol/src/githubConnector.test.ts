import { describe, expect, it } from "vitest";
import {
  githubBranchCreateExecuteRequestSchema,
  githubBranchCreateOutcomeSchema,
  githubBranchCreatePlanRequestSchema,
  githubCommentWriteActionSchema,
  githubCommentWriteExecuteRequestSchema,
  githubCommentWriteExecuteResponseSchema,
  githubCommentWriteOutcomeSchema,
  githubCommentWritePlanRequestSchema,
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

// The single existing suite pins the READ surface (resource outcome enum, PR
// detail nullable diff-stat, outcome-required response). The module's larger and
// more authority-sensitive half — the W1/W2 *write* surface (PR/Issue comment
// create, branch create) modelled as a two-phase plan→execute contract — stays
// unpinned. These schemas encode the least-privilege / anti-fabrication boundary:
//   - the comment write action is locked to a SINGLE literal (no other write verb
//     may ever be smuggled in), defaulting to it;
//   - "observed" is the ONLY success outcome and it is evidence-named (a real
//     GitHub 200/201) — there is no bare "success"/"done" the server could claim;
//   - truthStatus is a closed 3-value honesty enum (a result can't invent a 4th);
//   - execute requires an integrity key (bodySha256 / sourceSha) so a replayed
//     payload can't be mutated, and branch-execute is APPROVAL-ONLY (mandatory
//     approvalId, NO armed field) — stricter than comment-execute's approval-OR-armed;
//   - the branch outcome adds an `already_exists` overwrite-guard the comment lacks.
// Expected values are read off the schemas (self-consistent), never magic.
describe("githubConnector — W1/W2 write surface is a least-privilege, anti-fabrication plan→execute contract", () => {
  it("locks the comment write action to the single literal 'comment_create' and defaults to it", () => {
    const parsed = githubCommentWritePlanRequestSchema.parse({
      repoFullName: "owner/repo",
      number: 1,
      targetKind: "issue",
      body: "hello",
    });
    expect(parsed.action).toBe("comment_create"); // defaulted, never client-chosen
    expect(githubCommentWriteActionSchema.safeParse("comment_create").success).toBe(true);
    for (const forged of ["comment_delete", "comment_update", "issue_close", "merge"]) {
      expect(githubCommentWriteActionSchema.safeParse(forged).success).toBe(false);
    }
  });

  it("'observed' is the only success outcome; the enum has honest failure states and no bare 'success'", () => {
    expect(githubCommentWriteOutcomeSchema.options).toEqual([
      "observed",
      "planned",
      "approval_required",
      "blocked",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
    for (const fabricated of ["success", "done", "created", "ok"]) {
      expect(githubCommentWriteOutcomeSchema.safeParse(fabricated).success).toBe(false);
    }
  });

  it("the branch outcome adds an 'already_exists' overwrite-guard the comment outcome lacks (branch ⊇ comment)", () => {
    expect(githubBranchCreateOutcomeSchema.options).toContain("already_exists");
    expect(githubCommentWriteOutcomeSchema.options).not.toContain("already_exists");
    for (const o of githubCommentWriteOutcomeSchema.options) {
      expect(githubBranchCreateOutcomeSchema.options).toContain(o); // every comment outcome is also a branch outcome
    }
  });

  it("truthStatus is a closed 3-value honesty enum on the execute response — a result can't invent a fourth", () => {
    const base = { outcome: "observed" as const, planId: "p1" };
    for (const ts of ["planned", "observed", "configured"]) {
      expect(githubCommentWriteExecuteResponseSchema.safeParse({ ...base, truthStatus: ts }).success).toBe(true);
    }
    expect(githubCommentWriteExecuteResponseSchema.safeParse({ ...base, truthStatus: "fabricated" }).success).toBe(false);
  });

  it("comment execute needs the bodySha256 integrity key; approval/armed are the optional approval-OR-armed pair", () => {
    expect(githubCommentWriteExecuteRequestSchema.safeParse({ planId: "p1" }).success).toBe(false); // integrity key missing
    expect(githubCommentWriteExecuteRequestSchema.safeParse({ planId: "p1", bodySha256: "abc" }).success).toBe(true);
    const armed = githubCommentWriteExecuteRequestSchema.parse({
      planId: "p1",
      bodySha256: "abc",
      autoExecuteArmed: true,
      armedAt: "2026-06-21T00:00:00.000Z",
    });
    expect(armed.autoExecuteArmed).toBe(true); // the comment surface DOES carry the armed channel
  });

  it("branch execute is approval-ONLY: approvalId is mandatory and there is NO armed channel to smuggle", () => {
    expect(githubBranchCreateExecuteRequestSchema.safeParse({ planId: "p1", sourceSha: "s1" }).success).toBe(false); // approvalId missing, no armed fallback
    const parsed = githubBranchCreateExecuteRequestSchema.parse({
      planId: "p1",
      sourceSha: "s1",
      approvalId: "appr_1",
      autoExecuteArmed: true, // not part of the branch shape — z.object strips it (no armed escape)
    } as Record<string, unknown>);
    expect("autoExecuteArmed" in parsed).toBe(false);
    expect(parsed.approvalId).toBe("appr_1");
  });

  it("bounds the wire inputs: owner/repo shape, comment body 1..16000, branch name 1..120", () => {
    const okReq = { repoFullName: "owner/repo", number: 1, targetKind: "issue" as const, body: "x" };
    expect(githubCommentWritePlanRequestSchema.safeParse(okReq).success).toBe(true);
    expect(githubCommentWritePlanRequestSchema.safeParse({ ...okReq, repoFullName: "owner" }).success).toBe(false); // no slash
    expect(githubCommentWritePlanRequestSchema.safeParse({ ...okReq, body: "" }).success).toBe(false); // min 1
    expect(githubCommentWritePlanRequestSchema.safeParse({ ...okReq, body: "x".repeat(16_001) }).success).toBe(false); // max
    expect(githubCommentWritePlanRequestSchema.safeParse({ ...okReq, body: "x".repeat(16_000) }).success).toBe(true);
    const okBranch = { repoFullName: "owner/repo", sourceRef: "main", newBranchName: "agent/x" };
    expect(githubBranchCreatePlanRequestSchema.safeParse(okBranch).success).toBe(true);
    expect(githubBranchCreatePlanRequestSchema.safeParse({ ...okBranch, newBranchName: "x".repeat(121) }).success).toBe(false);
  });
});
