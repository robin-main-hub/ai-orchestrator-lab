import { describe, expect, it } from "vitest";
import {
  GITHUB_MULTIFILE_COMMIT_MAX_FILES,
  GITHUB_MULTIFILE_COMMIT_PER_FILE_BYTES_MAX,
  GITHUB_MULTIFILE_COMMIT_TOTAL_BYTES_MAX,
  GITHUB_PR_LABELS_MAX_CHANGE,
  GITHUB_PR_LABEL_NAME_MAX,
  GITHUB_PR_UPDATE_BODY_EXCERPT_MAX,
  GITHUB_PR_UPDATE_BODY_MAX,
  GITHUB_PR_UPDATE_TITLE_MAX,
  githubBranchCreateExecuteRequestSchema,
  githubBranchCreateExecuteResponseSchema,
  githubBranchCreateOutcomeSchema,
  githubBranchCreatePlanRequestSchema,
  githubBranchCreatePlanResponseSchema,
  githubBranchCreatePlanSchema,
  githubCommentWriteActionSchema,
  githubCommentWriteExecuteRequestSchema,
  githubCommentWriteExecuteResponseSchema,
  githubCommentWriteOutcomeSchema,
  githubCommentWritePlanRequestSchema,
  githubCommentWritePlanSchema,
  githubCommentWritePlanResponseSchema,
  githubConnectorModeSchema,
  githubConnectorStatusSchema,
  githubConnectorStatusResponseSchema,
  githubContextAttachmentSchema,
  githubContextSourceKindSchema,
  githubFileContentSchema,
  githubFileChangeExecuteRequestSchema,
  githubFileChangeExecuteResponseSchema,
  githubFileChangeOperationSchema,
  githubFileChangeOutcomeSchema,
  githubFileChangePlanRequestSchema,
  githubFileChangePlanSchema,
  githubMultiFileCommitExecuteRequestSchema,
  githubMultiFileCommitExecuteResponseSchema,
  githubMultiFileCommitOutcomeSchema,
  githubPullRequestCompareSummarySchema,
  githubPullRequestCreateExecuteRequestSchema,
  githubPullRequestCreateExecuteResponseSchema,
  githubPullRequestCreateOutcomeSchema,
  githubPullRequestCreatePlanRequestSchema,
  githubPullRequestCreatePlanSchema,
  githubPullRequestLabelsUpdateExecuteRequestSchema,
  githubPullRequestLabelsUpdateExecuteResponseSchema,
  githubPullRequestLabelsUpdateOutcomeSchema,
  githubPullRequestLabelsUpdatePlanRequestSchema,
  githubPullRequestUpdateExecuteRequestSchema,
  githubPullRequestUpdateExecuteResponseSchema,
  githubPullRequestUpdateOutcomeSchema,
  githubPullRequestUpdatePlanRequestSchema,
  githubPullRequestUpdatePlanResponseSchema,
  githubPullRequestUpdatePlanSchema,
  githubReadonlyResourceResponseSchema,
  githubResourceOutcomeSchema,
  githubPullRequestDetailSchema,
  githubRepoSummarySchema,
  githubPullRequestSummarySchema,
  githubIssueSummarySchema,
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

// The two suites above pin the READ surface and the W1/W2 comment/branch write
// contract. The highest-blast-radius mutation surface — W5b multi-file ATOMIC
// commit (Git Data API: blob→tree→commit→ref update with force=false) — is still
// unpinned, and it carries the strongest least-privilege / anti-fabrication
// guards in the module:
//   - first-version HARD limits (10 files, 256KiB/file, 512KiB total) are exported
//     constants, and the request bounds the batch to 1..MAX_FILES;
//   - expectedHeadSha is a lowercase 40-hex sha (optimistic-concurrency integrity
//     key) — a ref that moved out from under the plan fails as head_mismatch, never
//     a silent force-overwrite;
//   - the outcome is an EXECUTE-ONLY surface: it carries head_mismatch but has no
//     "planned" (there is no preview stage), the mirror image of the single-file
//     change outcome which has "planned" but no head_mismatch;
//   - the blocked `reason` is a CLOSED machine vocabulary — every guard has a named
//     reason, so a block is never laundered through a generic github_error;
//   - it is approval-ONLY (mandatory approvalId, no armed channel to smuggle).
// Expected values are read off the schemas/constants (self-consistent), never magic.
describe("githubConnector — W5b multi-file atomic commit is bounded, optimistic-concurrent, and machine-honest", () => {
  const HEX40 = "a".repeat(40);
  const mkFiles = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `f${i}.txt`, newContent: "x" }));
  const validReq = {
    repoFullName: "owner/repo",
    branchName: "agent/x",
    expectedHeadSha: HEX40,
    message: "atomic commit",
    files: [{ path: "src/a.ts", newContent: "x" }],
    approvalId: "appr_1",
  };

  it("exports the first-version hard limits and bounds the file batch to 1..MAX_FILES", () => {
    expect(GITHUB_MULTIFILE_COMMIT_MAX_FILES).toBe(10);
    expect(GITHUB_MULTIFILE_COMMIT_PER_FILE_BYTES_MAX).toBe(256 * 1024);
    expect(GITHUB_MULTIFILE_COMMIT_TOTAL_BYTES_MAX).toBe(512 * 1024);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, files: mkFiles(0) }).success).toBe(false); // min 1
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, files: mkFiles(GITHUB_MULTIFILE_COMMIT_MAX_FILES) }).success).toBe(true);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, files: mkFiles(GITHUB_MULTIFILE_COMMIT_MAX_FILES + 1) }).success).toBe(false);
  });

  it("requires expectedHeadSha to be a lowercase 40-hex sha (optimistic-concurrency integrity key)", () => {
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse(validReq).success).toBe(true);
    for (const bad of ["a".repeat(39), "a".repeat(41), "A".repeat(40), "g".repeat(40), ""]) {
      expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, expectedHeadSha: bad }).success).toBe(false);
    }
  });

  it("bounds message 1..2000, file path 1..512, branch 1..120 and the owner/repo shape", () => {
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, message: "" }).success).toBe(false);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, message: "x".repeat(2001) }).success).toBe(false);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, message: "x".repeat(2000) }).success).toBe(true);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, files: [{ path: "", newContent: "x" }] }).success).toBe(false);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, files: [{ path: "x".repeat(513), newContent: "x" }] }).success).toBe(false);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, branchName: "x".repeat(121) }).success).toBe(false);
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse({ ...validReq, repoFullName: "noslash" }).success).toBe(false);
  });

  it("is approval-ONLY: approvalId is mandatory and there is no armed channel to smuggle", () => {
    const { approvalId: _drop, ...withoutApproval } = validReq;
    expect(githubMultiFileCommitExecuteRequestSchema.safeParse(withoutApproval).success).toBe(false);
    const parsed = githubMultiFileCommitExecuteRequestSchema.parse({ ...validReq, autoExecuteArmed: true } as Record<string, unknown>);
    expect("autoExecuteArmed" in parsed).toBe(false);
  });

  it("the outcome is an execute-only atomic surface: it carries head_mismatch but no 'planned' (mirror of single-file change)", () => {
    expect(githubMultiFileCommitOutcomeSchema.options).toEqual([
      "observed",
      "approval_required",
      "blocked",
      "head_mismatch",
      "failed",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
    // head_mismatch (force=false optimistic concurrency) is unique to the atomic commit…
    expect(githubMultiFileCommitOutcomeSchema.options).toContain("head_mismatch");
    expect(githubFileChangeOutcomeSchema.options).not.toContain("head_mismatch");
    // …and conversely the atomic surface has NO "planned" because it is execute-only (no preview stage)
    expect(githubMultiFileCommitOutcomeSchema.options).not.toContain("planned");
    expect(githubFileChangeOutcomeSchema.options).toContain("planned");
  });

  it("the blocked 'reason' is a closed machine vocabulary — every guard is named, no silent github_error catch-all", () => {
    const reasons = githubMultiFileCommitExecuteResponseSchema.shape.reason.unwrap().options;
    expect(reasons).toEqual([
      "head_mismatch",
      "unsafe_path",
      "binary",
      "too_large",
      "secret_suspect",
      "duplicate_path",
      "allowlist",
      "branch_protection",
      "permission_denied",
      "github_error",
      "connection_failed",
    ]);
  });
});

// The suites above cover READ, W1/W2 comment+branch, and W5b multi-file commit.
// The narrowest write surface — W5d PR-labels add/remove — stays unpinned, and it
// encodes the same authority/honesty spirit in its own shape:
//   - an honest `no_op` outcome the fire-and-forget comment surface never has —
//     the system admits "nothing changed" rather than claiming a mutation;
//   - a TOCTOU integrity key (expectedCurrentLabelsHash): execute re-reads the
//     live label set and refuses if it drifted from the plan;
//   - label names are control-character-safe (a regex rejecting C0/DEL) and bounded
//     1..50, so a newline/tab/NUL can't ride into a label;
//   - each of add/remove is capped at 20 and DEFAULTS to [] (omission is a valid
//     empty change set, never an implicit "touch everything");
//   - approval-ONLY (mandatory approvalId, no armed channel);
//   - the execute `reason` is a closed machine vocabulary including the named
//     toctou_labels_mismatch.
// Expected values are read off the schemas/constants (self-consistent), never magic.
describe("githubConnector — W5d PR labels: honest no_op, TOCTOU integrity, control-char-safe bounded names", () => {
  it("exports the label caps and defaults add/remove to [] (omitting them is a valid empty change set)", () => {
    expect(GITHUB_PR_LABELS_MAX_CHANGE).toBe(20);
    expect(GITHUB_PR_LABEL_NAME_MAX).toBe(50);
    const parsed = githubPullRequestLabelsUpdatePlanRequestSchema.parse({ repoFullName: "owner/repo", pullNumber: 1 });
    expect(parsed.addLabels).toEqual([]);
    expect(parsed.removeLabels).toEqual([]);
  });

  it("caps each of add/remove at 20 labels (21 rejected)", () => {
    const labels = (n: number) => Array.from({ length: n }, (_, i) => `label-${i}`);
    const base = { repoFullName: "owner/repo", pullNumber: 1 };
    expect(githubPullRequestLabelsUpdatePlanRequestSchema.safeParse({ ...base, addLabels: labels(GITHUB_PR_LABELS_MAX_CHANGE) }).success).toBe(true);
    expect(githubPullRequestLabelsUpdatePlanRequestSchema.safeParse({ ...base, addLabels: labels(GITHUB_PR_LABELS_MAX_CHANGE + 1) }).success).toBe(false);
    expect(githubPullRequestLabelsUpdatePlanRequestSchema.safeParse({ ...base, removeLabels: labels(GITHUB_PR_LABELS_MAX_CHANGE + 1) }).success).toBe(false);
  });

  it("each label name is 1..50 chars and rejects embedded control characters", () => {
    const base = { repoFullName: "owner/repo", pullNumber: 1 };
    const ok = (name: string) => githubPullRequestLabelsUpdatePlanRequestSchema.safeParse({ ...base, addLabels: [name] }).success;
    expect(ok("bug")).toBe(true);
    expect(ok("needs-review")).toBe(true);
    expect(ok("x".repeat(GITHUB_PR_LABEL_NAME_MAX))).toBe(true); // 50 ok
    expect(ok("x".repeat(GITHUB_PR_LABEL_NAME_MAX + 1))).toBe(false); // 51 too long
    expect(ok("")).toBe(false); // min 1
    expect(ok("a\nb")).toBe(false); // newline (C0 control)
    expect(ok("a\tb")).toBe(false); // tab (C0 control)
  });

  it("execute is approval-ONLY and carries the TOCTOU integrity key (expectedCurrentLabelsHash); no armed channel", () => {
    const valid = { planId: "p1", expectedCurrentLabelsHash: "hash_abc", approvalId: "appr_1" };
    expect(githubPullRequestLabelsUpdateExecuteRequestSchema.safeParse(valid).success).toBe(true);
    expect(githubPullRequestLabelsUpdateExecuteRequestSchema.safeParse({ planId: "p1", approvalId: "appr_1" }).success).toBe(false); // hash missing
    expect(githubPullRequestLabelsUpdateExecuteRequestSchema.safeParse({ planId: "p1", expectedCurrentLabelsHash: "h" }).success).toBe(false); // approvalId missing
    const parsed = githubPullRequestLabelsUpdateExecuteRequestSchema.parse({ ...valid, autoExecuteArmed: true } as Record<string, unknown>);
    expect("autoExecuteArmed" in parsed).toBe(false);
  });

  it("the outcome carries an honest 'no_op' state the fire-and-forget comment outcome lacks", () => {
    expect(githubPullRequestLabelsUpdateOutcomeSchema.options).toEqual([
      "observed",
      "planned",
      "approval_required",
      "blocked",
      "no_op",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
    expect(githubPullRequestLabelsUpdateOutcomeSchema.options).toContain("no_op");
    expect(githubCommentWriteOutcomeSchema.options).not.toContain("no_op");
  });

  it("the execute 'reason' is a closed machine vocabulary including the named TOCTOU mismatch", () => {
    const reasons = githubPullRequestLabelsUpdateExecuteResponseSchema.shape.reason.unwrap().options;
    expect(reasons).toEqual([
      "no_op",
      "labels_too_many",
      "label_too_long",
      "secret_suspect",
      "pr_closed",
      "pr_not_found",
      "toctou_labels_mismatch",
      "allowlist",
      "permission_denied",
      "github_error",
      "connection_failed",
    ]);
    expect(reasons).toContain("toctou_labels_mismatch");
  });
});

// Sibling TOCTOU write surface — W5c PR title/body update — stays unpinned. It is
// distinct from W5d labels in three authority-relevant ways:
//   - PARTIAL update by least privilege: newTitle and newBody are BOTH optional, so
//     an unstated field is left untouched (no implicit overwrite of the other);
//   - an asymmetry that mirrors GitHub's own rule — a title can't be blanked
//     (newTitle min 1) but a body CAN be cleared (newBody allows "");
//   - DUAL TOCTOU integrity keys: execute must carry BOTH the current-title and
//     current-body sha, and the reason vocabulary names title and body mismatches
//     SEPARATELY (toctou_title_mismatch / toctou_body_mismatch).
// Plus the shared honesty contract: an honest `no_op` outcome and approval-ONLY
// execute. Expected values are read off the schemas/constants (self-consistent).
describe("githubConnector — W5c PR title/body update: partial least-privilege, dual TOCTOU, honest no_op", () => {
  it("exports the title/body caps and treats newTitle/newBody as optional partial-update fields (omitting both is valid)", () => {
    expect(GITHUB_PR_UPDATE_TITLE_MAX).toBe(160);
    expect(GITHUB_PR_UPDATE_BODY_MAX).toBe(16_000);
    expect(GITHUB_PR_UPDATE_BODY_EXCERPT_MAX).toBe(240);
    const parsed = githubPullRequestUpdatePlanRequestSchema.parse({ repoFullName: "owner/repo", pullNumber: 1 });
    expect(parsed.newTitle).toBeUndefined(); // unstated ⇒ that field is left untouched
    expect(parsed.newBody).toBeUndefined();
  });

  it("newTitle is 1..160 (a title can't be blanked) but newBody allows '' (clearing the body) up to 16000", () => {
    const base = { repoFullName: "owner/repo", pullNumber: 1 };
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ ...base, newTitle: "" }).success).toBe(false); // min 1
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ ...base, newTitle: "x".repeat(GITHUB_PR_UPDATE_TITLE_MAX) }).success).toBe(true);
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ ...base, newTitle: "x".repeat(GITHUB_PR_UPDATE_TITLE_MAX + 1) }).success).toBe(false);
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ ...base, newBody: "" }).success).toBe(true); // empty body = clear, allowed
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ ...base, newBody: "x".repeat(GITHUB_PR_UPDATE_BODY_MAX) }).success).toBe(true);
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ ...base, newBody: "x".repeat(GITHUB_PR_UPDATE_BODY_MAX + 1) }).success).toBe(false);
  });

  it("requires a positive integer pullNumber and the owner/repo shape", () => {
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ repoFullName: "owner/repo", pullNumber: 0 }).success).toBe(false);
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ repoFullName: "owner/repo", pullNumber: 1.5 }).success).toBe(false);
    expect(githubPullRequestUpdatePlanRequestSchema.safeParse({ repoFullName: "noslash", pullNumber: 1 }).success).toBe(false);
  });

  it("execute requires BOTH current title+body TOCTOU keys and is approval-ONLY (no armed channel)", () => {
    const valid = { planId: "p1", expectedCurrentTitleSha256: "ts", expectedCurrentBodySha256: "bs", approvalId: "appr_1" };
    expect(githubPullRequestUpdateExecuteRequestSchema.safeParse(valid).success).toBe(true);
    expect(githubPullRequestUpdateExecuteRequestSchema.safeParse({ planId: "p1", expectedCurrentBodySha256: "bs", approvalId: "a" }).success).toBe(false); // title key missing
    expect(githubPullRequestUpdateExecuteRequestSchema.safeParse({ planId: "p1", expectedCurrentTitleSha256: "ts", approvalId: "a" }).success).toBe(false); // body key missing
    expect(githubPullRequestUpdateExecuteRequestSchema.safeParse({ planId: "p1", expectedCurrentTitleSha256: "ts", expectedCurrentBodySha256: "bs" }).success).toBe(false); // approvalId missing
    const parsed = githubPullRequestUpdateExecuteRequestSchema.parse({ ...valid, autoExecuteArmed: true } as Record<string, unknown>);
    expect("autoExecuteArmed" in parsed).toBe(false);
  });

  it("the outcome carries an honest 'no_op' state (a same-title/same-body update isn't faked as a change)", () => {
    expect(githubPullRequestUpdateOutcomeSchema.options).toEqual([
      "observed",
      "planned",
      "approval_required",
      "blocked",
      "no_op",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
    expect(githubPullRequestUpdateOutcomeSchema.options).toContain("no_op");
  });

  it("the execute 'reason' is a closed machine vocabulary with SEPARATE title/body TOCTOU mismatch reasons", () => {
    const reasons = githubPullRequestUpdateExecuteResponseSchema.shape.reason.unwrap().options;
    expect(reasons).toEqual([
      "no_op",
      "title_too_long",
      "body_too_long",
      "secret_suspect",
      "pr_closed",
      "pr_not_found",
      "toctou_title_mismatch",
      "toctou_body_mismatch",
      "allowlist",
      "permission_denied",
      "github_error",
      "connection_failed",
    ]);
    expect(reasons).toContain("toctou_title_mismatch");
    expect(reasons).toContain("toctou_body_mismatch");
  });
});

// W3b — single-file create/update execute — is the one write surface above that
// touches repository CONTENTS (PUT /contents), so its plan→execute contract is the
// strictest of the family and is still entirely unpinned (the W3b schemas are only
// referenced incidentally to contrast the multi-file outcome). The authority
// invariants here:
//   - operation is locked to exactly {create, update} (no delete verb exists);
//   - "observed" is the ONLY success outcome — there is no "created"/"success"
//     literal the server could self-assert (the comment plan *status* has "created"
//     but the file-change OUTCOME deliberately does not);
//   - the new content is carried as a sha256 replay-guard (newContentSha256) on BOTH
//     the plan output and the execute input — the 3-way integrity key surfaces in
//     the wire contract, not just server memory;
//   - on a create, baseFileSha / baseContentSha256 stay undefined — a base blob sha
//     is never fabricated for a file that did not exist;
//   - execute is APPROVAL-ONLY: approvalId is REQUIRED and there is NO armed field,
//     strictly stricter than the W1 comment execute (which accepts approval-OR-armed
//     autoExecuteArmed) — a smuggled autoExecuteArmed is dropped by z.object;
//   - success blob/commit shas are never fabricated when absent.
// Expected values are read off the schemas (self-consistent), never magic.
describe("githubConnector — W3b single-file change: locked verbs, 3-way sha integrity, approval-ONLY execute", () => {
  const planRequest = { repoFullName: "o/r", branchName: "agent/x", path: "src/a.ts", newContent: "hello" };

  it("operation is exactly {create, update} and the outcome has no bare-success literal (observed only)", () => {
    expect(githubFileChangeOperationSchema.options).toEqual(["create", "update"]);
    expect(githubFileChangeOutcomeSchema.options).toEqual([
      "observed",
      "planned",
      "approval_required",
      "blocked",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
    // no self-assertable success word — the only success is evidence-named "observed"
    for (const forged of ["success", "created", "done", "ok", "written"]) {
      expect(githubFileChangeOutcomeSchema.options).not.toContain(forged);
    }
  });

  it("plan request is owner/repo-shaped, path/branch bounded, baseFileSha optional, unknown keys stripped", () => {
    expect(githubFileChangePlanRequestSchema.safeParse(planRequest).success).toBe(true);
    expect(githubFileChangePlanRequestSchema.safeParse({ ...planRequest, repoFullName: "single" }).success).toBe(false);
    expect(githubFileChangePlanRequestSchema.safeParse({ ...planRequest, path: "" }).success).toBe(false);
    expect(githubFileChangePlanRequestSchema.safeParse({ ...planRequest, path: "x".repeat(513) }).success).toBe(false);
    expect(githubFileChangePlanRequestSchema.safeParse({ ...planRequest, branchName: "x".repeat(121) }).success).toBe(false);
    const parsed = githubFileChangePlanRequestSchema.parse({ ...planRequest, sourceSha: "deadbeef" } as Record<string, unknown>);
    expect(parsed.baseFileSha).toBeUndefined(); // optional, not fabricated when omitted
    expect("sourceSha" in parsed).toBe(false); // unknown key dropped
  });

  it("a create plan leaves baseFileSha / baseContentSha256 undefined (no fabricated base) and requires newContentSha256", () => {
    const base = {
      id: "fc1",
      repoFullName: "o/r",
      branchName: "agent/x",
      branchRef: "refs/heads/agent/x",
      path: "src/a.ts",
      operation: "create" as const,
      newContentSha256: "abc123",
      newContentLength: 5,
      diffPreview: "+hello",
      diffTruncated: false,
      diffStat: { additions: 1, deletions: 0 },
      status: "planned" as const,
      truthStatus: "planned" as const,
      createdAt: "2026-06-21T00:00:00.000Z",
      expiresAt: "2026-06-21T00:05:00.000Z",
    };
    const plan = githubFileChangePlanSchema.parse(base);
    expect(plan.baseFileSha).toBeUndefined();
    expect(plan.baseContentSha256).toBeUndefined();
    // newContentSha256 is the replay-guard key — it cannot be omitted
    const { newContentSha256: _drop, ...withoutSha } = base;
    expect(githubFileChangePlanSchema.safeParse(withoutSha).success).toBe(false);
    // diffStat counts are nonnegative ints
    expect(githubFileChangePlanSchema.safeParse({ ...base, diffStat: { additions: -1, deletions: 0 } }).success).toBe(false);
    // status / truthStatus are closed honesty enums
    expect(githubFileChangePlanSchema.safeParse({ ...base, status: "created" }).success).toBe(false);
    expect(githubFileChangePlanSchema.safeParse({ ...base, truthStatus: "verified" }).success).toBe(false);
  });

  it("the newContentSha256 integrity key appears on BOTH the plan output and the execute input (3-way)", () => {
    // execute carries the same replay-guard key the plan produced + the planId
    const exec = githubFileChangeExecuteRequestSchema.parse({ planId: "fc1", newContentSha256: "abc123", approvalId: "ap1" });
    expect(exec.newContentSha256).toBe("abc123");
    const { newContentSha256: _drop, ...withoutSha } = exec;
    expect(githubFileChangeExecuteRequestSchema.safeParse({ ...withoutSha, planId: "fc1", approvalId: "ap1" }).success).toBe(false);
  });

  it("execute is APPROVAL-ONLY — approvalId required, no armed field (stricter than comment execute, which keeps armed)", () => {
    // comment execute (W1) accepts an armed self-auth flag…
    const comment = githubCommentWriteExecuteRequestSchema.parse({ planId: "c1", bodySha256: "s", autoExecuteArmed: true });
    expect(comment.autoExecuteArmed).toBe(true);
    // …but the file-change execute has NO armed field — a smuggled autoExecuteArmed is dropped…
    const file = githubFileChangeExecuteRequestSchema.parse({
      planId: "fc1",
      newContentSha256: "abc123",
      approvalId: "ap1",
      autoExecuteArmed: true,
      armedAt: "2026-06-21T00:00:00.000Z",
    } as Record<string, unknown>);
    expect("autoExecuteArmed" in file).toBe(false);
    expect("armedAt" in file).toBe(false);
    // …and approvalId is mandatory (no approval-or-armed fallback)
    expect(githubFileChangeExecuteRequestSchema.safeParse({ planId: "fc1", newContentSha256: "abc123" }).success).toBe(false);
  });

  it("execute response never fabricates commit/blob shas when absent; truthStatus is the closed 3-value enum", () => {
    const minimal = githubFileChangeExecuteResponseSchema.parse({ outcome: "blocked", planId: "fc1", truthStatus: "planned" });
    expect(minimal.commitSha).toBeUndefined();
    expect(minimal.blobSha).toBeUndefined();
    expect(minimal.htmlUrl).toBeUndefined();
    expect(minimal.observedAt).toBeUndefined();
    expect(githubFileChangeExecuteResponseSchema.safeParse({ outcome: "observed", planId: "fc1", truthStatus: "real" }).success).toBe(false);
    const observed = githubFileChangeExecuteResponseSchema.parse({
      outcome: "observed",
      planId: "fc1",
      commitSha: "c0ffee",
      blobSha: "b10b",
      truthStatus: "observed",
    });
    expect(observed.commitSha).toBe("c0ffee"); // present only because we supplied real evidence
  });
});

// W4 PR-create plan/execute is the final unpinned write surface — the most
// externally-visible action (POST /pulls). Its authority invariants:
//   - "observed" is the ONLY success outcome — no "created"/"opened"/"merged"
//     literal the server could self-assert;
//   - the plan request lets the body be blank ("") but never the title (1..160) —
//     a PR must be titled;
//   - the compare summary counts are NONNEGATIVE (the schema PERMITS aheadBy=0 /
//     changedFiles=0) — the no-op-PR guard is a RUNTIME `blocked` status, NOT a
//     schema rejection, so this test pins the honest fact that a 0/0 compare still
//     PARSES and the block travels via the status enum + blockedReason channel;
//   - the plan exposes only a bodyPreview + bodySha256 + bodyLength, never echoing
//     the full body back (least-information-leak — a smuggled full `body` is
//     dropped);
//   - execute is APPROVAL-ONLY with DUAL sha integrity (titleSha256 + bodySha256
//     both required, approvalId required, NO armed field) — a smuggled
//     autoExecuteArmed is dropped;
//   - a success pullNumber is a positive int, never fabricated when absent.
// Expected values are read off the schemas (self-consistent), never magic.
describe("githubConnector — W4 PR-create: observed-only, titled, runtime no-op block, dual-sha approval-ONLY execute", () => {
  const planRequest = { repoFullName: "o/r", baseBranch: "main", headBranch: "agent/x", title: "t", body: "" };
  const compare = { aheadBy: 2, behindBy: 0, changedFiles: 3, commits: 2, filesPreview: [], truncated: false };
  const planBase = {
    id: "pr1",
    repoFullName: "o/r",
    baseBranch: "main",
    headBranch: "agent/x",
    baseSha: "base0",
    headSha: "head0",
    title: "t",
    bodyPreview: "hi",
    titleSha256: "ts",
    bodySha256: "bs",
    bodyLength: 2,
    compare,
    status: "planned" as const,
    truthStatus: "planned" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
    expiresAt: "2026-06-21T00:05:00.000Z",
  };

  it("outcome enum is observed-only success (no created/opened/merged self-assertion)", () => {
    expect(githubPullRequestCreateOutcomeSchema.options).toEqual([
      "observed",
      "planned",
      "approval_required",
      "blocked",
      "not_configured",
      "permission_denied",
      "connection_failed",
      "github_error",
    ]);
    for (const forged of ["created", "opened", "merged", "success", "done"]) {
      expect(githubPullRequestCreateOutcomeSchema.options).not.toContain(forged);
    }
  });

  it("plan request allows a blank body but never a blank title (a PR must be titled)", () => {
    expect(githubPullRequestCreatePlanRequestSchema.safeParse(planRequest).success).toBe(true); // body "" ok
    expect(githubPullRequestCreatePlanRequestSchema.safeParse({ ...planRequest, title: "" }).success).toBe(false);
    expect(githubPullRequestCreatePlanRequestSchema.safeParse({ ...planRequest, title: "x".repeat(161) }).success).toBe(false);
    expect(githubPullRequestCreatePlanRequestSchema.safeParse({ ...planRequest, body: "x".repeat(16_001) }).success).toBe(false);
    expect(githubPullRequestCreatePlanRequestSchema.safeParse({ ...planRequest, repoFullName: "single" }).success).toBe(false);
    expect(githubPullRequestCreatePlanRequestSchema.safeParse({ ...planRequest, headBranch: "x".repeat(121) }).success).toBe(false);
  });

  it("a 0-ahead / 0-changed compare PARSES — the no-op guard is a runtime status, not a schema rejection", () => {
    const noop = { aheadBy: 0, behindBy: 5, changedFiles: 0, commits: 0, filesPreview: [], truncated: false };
    expect(githubPullRequestCompareSummarySchema.safeParse(noop).success).toBe(true); // schema permits 0/0
    // negatives / fractionals are still rejected (nonnegative ints)
    expect(githubPullRequestCompareSummarySchema.safeParse({ ...compare, aheadBy: -1 }).success).toBe(false);
    expect(githubPullRequestCompareSummarySchema.safeParse({ ...compare, changedFiles: 1.5 }).success).toBe(false);
    // the runtime no-op block travels via the plan status enum + blockedReason, not a parse failure
    const blocked = githubPullRequestCreatePlanSchema.parse({ ...planBase, compare: noop, status: "blocked", blockedReason: "no_op" });
    expect(blocked.status).toBe("blocked");
    expect(blocked.compare.aheadBy).toBe(0);
  });

  it("the plan exposes bodyPreview + bodySha256 + bodyLength but never echoes the full body", () => {
    const plan = githubPullRequestCreatePlanSchema.parse({ ...planBase, body: "the full secret body text" } as Record<string, unknown>);
    expect("body" in plan).toBe(false); // full body dropped — only the preview/sha/length survive
    expect(plan.bodyPreview).toBe("hi");
    expect(plan.bodySha256).toBe("bs");
    expect(plan.bodyLength).toBe(2);
    expect(githubPullRequestCreatePlanSchema.safeParse({ ...planBase, status: "opened" }).success).toBe(false); // closed status enum
  });

  it("execute is APPROVAL-ONLY with DUAL sha integrity — no armed field (contrast the comment execute, which keeps armed)", () => {
    const ok = githubPullRequestCreateExecuteRequestSchema.parse({ planId: "pr1", titleSha256: "ts", bodySha256: "bs", approvalId: "ap1" });
    expect(ok.approvalId).toBe("ap1");
    // both sha keys are required (dual integrity)
    expect(githubPullRequestCreateExecuteRequestSchema.safeParse({ planId: "pr1", titleSha256: "ts", approvalId: "ap1" }).success).toBe(false);
    expect(githubPullRequestCreateExecuteRequestSchema.safeParse({ planId: "pr1", bodySha256: "bs", approvalId: "ap1" }).success).toBe(false);
    // approval is mandatory (no approval-or-armed fallback)
    expect(githubPullRequestCreateExecuteRequestSchema.safeParse({ planId: "pr1", titleSha256: "ts", bodySha256: "bs" }).success).toBe(false);
    // a smuggled armed flag is dropped (the comment execute, by contrast, keeps it)
    const file = githubPullRequestCreateExecuteRequestSchema.parse({
      planId: "pr1",
      titleSha256: "ts",
      bodySha256: "bs",
      approvalId: "ap1",
      autoExecuteArmed: true,
    } as Record<string, unknown>);
    expect("autoExecuteArmed" in file).toBe(false);
    const comment = githubCommentWriteExecuteRequestSchema.parse({ planId: "c1", bodySha256: "s", autoExecuteArmed: true });
    expect(comment.autoExecuteArmed).toBe(true);
  });

  it("execute response: pullNumber is a positive int, never fabricated when absent; observed-only; truthStatus closed", () => {
    const minimal = githubPullRequestCreateExecuteResponseSchema.parse({ outcome: "blocked", planId: "pr1", truthStatus: "planned" });
    expect(minimal.pullNumber).toBeUndefined();
    expect(minimal.htmlUrl).toBeUndefined();
    expect(minimal.headSha).toBeUndefined();
    expect(githubPullRequestCreateExecuteResponseSchema.safeParse({ outcome: "observed", planId: "pr1", pullNumber: 0, truthStatus: "observed" }).success).toBe(false);
    expect(githubPullRequestCreateExecuteResponseSchema.safeParse({ outcome: "observed", planId: "pr1", pullNumber: -1, truthStatus: "observed" }).success).toBe(false);
    expect(githubPullRequestCreateExecuteResponseSchema.safeParse({ outcome: "observed", planId: "pr1", truthStatus: "real" }).success).toBe(false);
    const observed = githubPullRequestCreateExecuteResponseSchema.parse({ outcome: "observed", planId: "pr1", pullNumber: 42, truthStatus: "observed" });
    expect(observed.pullNumber).toBe(42);
  });
});

// The write surface (plan→execute outcomes, truthStatus) is well pinned above,
// but the READ-ONLY context-attachment surface is untouched: the closed kind
// vocabulary, and — critically — the two literal anti-fabrication locks. An
// attachment's `truthStatus` is the literal "observed" and its `source` is the
// literal "github_api": a context excerpt can NEVER claim to be model-generated
// truth or to come from anywhere but the GitHub API. Likewise file content is
// always literal utf8 with an honest `truncated` marker. Nothing pins that a
// fabricated truthStatus/source, or an item inventing a number/path it doesn't
// have, is rejected. Pin the read-only provenance contract, self-consistent.
describe("githubConnector — read-only context attachment is an observed-only, github-sourced provenance contract", () => {
  const attachment = {
    id: "att_pr_1",
    kind: "pull_request" as const,
    repoFullName: "owner/repo",
    title: "Fix the parser",
    url: "https://github.com/owner/repo/pull/1",
    observedAt: "2026-06-21T00:00:00.000Z",
    truthStatus: "observed" as const,
    observedExcerpt: "diff --git a/x b/x",
    truncated: false,
    summarySource: "github_observed" as const,
    source: "github_api" as const,
  };

  it("pins the 4 context-source kinds and locks truthStatus/source to their single literals", () => {
    expect(githubContextSourceKindSchema.options).toEqual(["pull_request", "issue", "file", "code_search_result"]);
    expect(githubContextSourceKindSchema.safeParse("commit").success).toBe(false);
    expect(githubContextAttachmentSchema.safeParse(attachment).success).toBe(true);
    // truthStatus is the literal "observed" — an attachment can never claim model-generated truth
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, truthStatus: "planned" }).success).toBe(false);
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, truthStatus: "real" }).success).toBe(false);
    // source is the literal "github_api" — provenance can't be forged to another origin
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, source: "model_api" }).success).toBe(false);
    // summarySource is a closed 3-set; the excerpt's origin is explicit, not free-form
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, summarySource: "github_observed" }).success).toBe(true);
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, summarySource: "model_generated" }).success).toBe(true);
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, summarySource: "user_edited" }).success).toBe(true);
    expect(githubContextAttachmentSchema.safeParse({ ...attachment, summarySource: "hand_waved" }).success).toBe(false);
  });

  it("an attachment needs its provenance spine and never fabricates the number/path it doesn't carry", () => {
    const parsed = githubContextAttachmentSchema.parse(attachment);
    // a PR attachment carries no path; a file attachment carries no number — neither is invented
    expect(parsed.number).toBeUndefined();
    expect(parsed.path).toBeUndefined();
    for (const key of ["id", "kind", "repoFullName", "title", "url", "observedAt", "truthStatus", "observedExcerpt", "truncated", "summarySource", "source"]) {
      const { [key]: _omit, ...partial } = attachment as Record<string, unknown>;
      expect(githubContextAttachmentSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("read-only file content is always literal utf8 with an honest truncation marker and a complete spine", () => {
    const file = {
      path: "src/index.ts",
      size: 2048,
      sha: "abc123",
      htmlUrl: "https://github.com/owner/repo/blob/main/src/index.ts",
      content: "export const x = 1;",
      truncated: true,
      encoding: "utf8" as const,
    };
    expect(githubFileContentSchema.safeParse(file).success).toBe(true);
    // encoding is the literal "utf8" — the connector decodes to one canonical form, never raw base64 passthrough
    expect(githubFileContentSchema.safeParse({ ...file, encoding: "base64" }).success).toBe(false);
    // the whole spine is mandatory — content can't ship without its sha/size/truncation honesty
    for (const key of ["path", "size", "sha", "htmlUrl", "content", "truncated", "encoding"]) {
      const { [key]: _omit, ...partial } = file as Record<string, unknown>;
      expect(githubFileContentSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });
});

// The connector STATUS gate — the read-model that says whether the connector is
// even usable — is unpinned. Its authority story is twofold: (1) the mode is the
// literal "read_only", so the status can never advertise a write mode at the type
// level; (2) the token lives only on the server, so the status carries booleans
// (configured/tokenPresent) about a token but NEVER the token value. Nothing pins
// that mode is locked, that the id is the literal "github", or that a smuggled
// token key is stripped rather than retained. Pin the connector-status gate.
describe("githubConnector — status gate: read_only mode lock, github identity literal, token-presence booleans never the token", () => {
  const status = {
    id: "github" as const,
    name: "GitHub",
    mode: "read_only" as const,
    configured: false,
    tokenPresent: false,
    scopesNeeded: ["repo"],
    note: "Set GITHUB_TOKEN on the server to enable read-only access.",
  };

  it("locks mode to the literal 'read_only' and the id to the literal 'github'", () => {
    expect(githubConnectorModeSchema.safeParse("read_only").success).toBe(true);
    // a write mode can't be claimed at the type level
    expect(githubConnectorModeSchema.safeParse("read_write").success).toBe(false);
    expect(githubConnectorModeSchema.safeParse("write").success).toBe(false);
    expect(githubConnectorStatusSchema.safeParse(status).success).toBe(true);
    expect(githubConnectorStatusSchema.safeParse({ ...status, mode: "read_write" }).success).toBe(false);
    expect(githubConnectorStatusSchema.safeParse({ ...status, id: "gitlab" }).success).toBe(false);
  });

  it("carries token-presence as booleans and STRIPS any smuggled token value — the status never holds the secret", () => {
    // the status reports only whether a token is present, never its value
    const fakeToken = "ghp_" + "x".repeat(36); // assembled at runtime so secret-scan sees no literal credential
    const parsed = githubConnectorStatusSchema.parse({ ...status, token: fakeToken, accessToken: fakeToken } as Record<string, unknown>);
    expect("token" in parsed).toBe(false); // plain object strips the unknown key — the secret can't ride along
    expect("accessToken" in parsed).toBe(false);
    expect(parsed.tokenPresent).toBe(false);
    expect(parsed.configured).toBe(false);
    // the gate spine is mandatory — none of the configure/scope/note signals may be dropped
    for (const key of ["id", "name", "mode", "configured", "tokenPresent", "scopesNeeded", "note"]) {
      const { [key]: _omit, ...partial } = status as Record<string, unknown>;
      expect(githubConnectorStatusSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("the status response simply envelopes a full status object", () => {
    expect(githubConnectorStatusResponseSchema.safeParse({ status }).success).toBe(true);
    // the envelope requires the status — it can't report an empty gate
    expect(githubConnectorStatusResponseSchema.safeParse({}).success).toBe(false);
    const armed = githubConnectorStatusResponseSchema.parse({
      status: { ...status, configured: true, tokenPresent: true, note: "Live read-only access enabled." },
    });
    expect(armed.status.configured).toBe(true);
    expect(armed.status.mode).toBe("read_only"); // still read_only even when fully configured
  });
});

// The comment-write PLAN — the side-effect-free preview computed before any
// execute — is unpinned (only its request/execute halves and the outcome enum
// are tested). The plan is where the anti-fabrication contract lives: the action
// is locked to "comment_create", the body is integrity-bound by a bodySha256
// the later execute must match, the lifecycle status / truthStatus are closed
// honesty enums, and number/bodyLength are bounded. Pin the plan + its response
// envelope (a blocked outcome carries no plan). Self-consistent.
describe("githubConnector — comment-write plan is a side-effect-free, integrity-bound, honest-lifecycle preview", () => {
  const plan = {
    id: "plan_1",
    action: "comment_create" as const,
    repoFullName: "owner/repo",
    number: 1,
    targetKind: "pull_request" as const,
    bodyPreview: "LGTM",
    bodySha256: "a".repeat(64),
    bodyLength: 4,
    targetUrl: "https://github.com/owner/repo/pull/1",
    status: "planned" as const,
    truthStatus: "planned" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
    expiresAt: "2026-06-21T00:10:00.000Z",
  };

  it("pins the closed plan lifecycle, the 3-value truthStatus, and the issue/pull_request target kinds", () => {
    expect(githubCommentWritePlanSchema.safeParse(plan).success).toBe(true);
    for (const status of ["planned", "approval_required", "blocked", "auto_execute_armed", "executing", "created", "failed"]) {
      expect(githubCommentWritePlanSchema.safeParse({ ...plan, status }).success, `${status} is a valid lifecycle state`).toBe(true);
    }
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, status: "published" }).success).toBe(false);
    for (const truthStatus of ["planned", "observed", "configured"]) {
      expect(githubCommentWritePlanSchema.safeParse({ ...plan, truthStatus }).success).toBe(true);
    }
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, truthStatus: "real" }).success).toBe(false);
    // a plan can only target an issue or a pull request
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, targetKind: "issue" }).success).toBe(true);
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, targetKind: "discussion" }).success).toBe(false);
  });

  it("locks the action, integrity-binds the body, bounds the counters, and never fabricates approvalId/blockedReason", () => {
    const parsed = githubCommentWritePlanSchema.parse(plan);
    expect(parsed.approvalId).toBeUndefined();
    expect(parsed.blockedReason).toBeUndefined();
    // action is the single literal — a plan can't smuggle a different write verb
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, action: "comment_delete" }).success).toBe(false);
    // number is a positive int (a real issue/PR number), bodyLength a nonnegative int
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, number: 0 }).success).toBe(false);
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, number: -1 }).success).toBe(false);
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, number: 1.5 }).success).toBe(false);
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, bodyLength: 0 }).success).toBe(true); // empty body length is allowed
    expect(githubCommentWritePlanSchema.safeParse({ ...plan, bodyLength: -1 }).success).toBe(false);
    // the integrity/identity spine is mandatory — bodySha256 (the replay binding) can't be dropped
    for (const key of ["id", "action", "repoFullName", "number", "targetKind", "bodyPreview", "bodySha256", "bodyLength", "targetUrl", "status", "truthStatus", "createdAt", "expiresAt"]) {
      const { [key]: _omit, ...partial } = plan as Record<string, unknown>;
      expect(githubCommentWritePlanSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("the plan response requires an outcome and leaves plan/message optional — a blocked outcome carries no plan", () => {
    // outcome alone (no plan, no message) is valid — e.g. not_configured before any plan is computed
    expect(githubCommentWritePlanResponseSchema.safeParse({ outcome: "not_configured" }).success).toBe(true);
    expect(githubCommentWritePlanResponseSchema.safeParse({}).success).toBe(false); // outcome is mandatory
    expect(githubCommentWritePlanResponseSchema.safeParse({ outcome: "fabricated" }).success).toBe(false); // closed outcome set
    const withPlan = githubCommentWritePlanResponseSchema.parse({ outcome: "planned", plan, message: "ready to execute" });
    expect(withPlan.plan?.bodySha256).toBe("a".repeat(64));
    expect(withPlan.message).toBe("ready to execute");
  });
});

// The PR DETAIL schema's nullable diff-stats are pinned (line ~58), but the three
// base read-only summaries (repo/PR/issue) the connector returns are untouched.
// Their authority story is the nullable-vs-required honesty distinction: a repo's
// `description` is z.string().nullable() — the connector must explicitly report
// null when a repo has no description; it can't silently OMIT the field (nullable
// is not optional). Everything else in a summary is a required field with no
// default — a read-model can't ship a half-populated row. Pin the three summary
// spines + the null/omit distinction, self-consistent (derived from the shapes).
describe("githubConnector — read-only summaries: required spines, nullable-is-not-optional honesty, PR≠issue shape", () => {
  it("repo summary: description is nullable but the key is REQUIRED — the connector must say null, not omit it", () => {
    const repo = {
      fullName: "owner/repo",
      description: "a generic repo",
      defaultBranch: "main",
      openIssues: 3,
      stars: 0,
      private: false,
      htmlUrl: "https://github.com/owner/repo",
    };
    expect(githubRepoSummarySchema.safeParse(repo).success).toBe(true);
    // an honestly description-less repo reports null — not "" and not an absent key
    expect(githubRepoSummarySchema.safeParse({ ...repo, description: null }).success).toBe(true);
    const { description: _omit, ...withoutDescription } = repo;
    expect(githubRepoSummarySchema.safeParse(withoutDescription).success).toBe(false); // nullable ≠ optional
    // the rest of the spine is mandatory
    for (const key of ["fullName", "defaultBranch", "openIssues", "stars", "private", "htmlUrl"]) {
      const { [key]: _drop, ...partial } = repo as Record<string, unknown>;
      expect(githubRepoSummarySchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("PR summary: every field is required with no default — a read-model row is never half-populated", () => {
    const pr = {
      number: 7,
      title: "Fix the parser",
      state: "open",
      author: "octocat",
      draft: false,
      htmlUrl: "https://github.com/owner/repo/pull/7",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:05:00.000Z",
    };
    expect(githubPullRequestSummarySchema.safeParse(pr).success).toBe(true);
    for (const key of ["number", "title", "state", "author", "draft", "htmlUrl", "createdAt", "updatedAt"]) {
      const { [key]: _omit, ...partial } = pr as Record<string, unknown>;
      expect(githubPullRequestSummarySchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("issue summary carries `comments` where the PR summary carries `draft` — the two read-models are not interchangeable", () => {
    const issue = {
      number: 11,
      title: "Crash on empty input",
      state: "open",
      author: "octocat",
      comments: 2,
      htmlUrl: "https://github.com/owner/repo/issues/11",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:05:00.000Z",
    };
    expect(githubIssueSummarySchema.safeParse(issue).success).toBe(true);
    for (const key of ["number", "title", "state", "author", "comments", "htmlUrl", "createdAt", "updatedAt"]) {
      const { [key]: _omit, ...partial } = issue as Record<string, unknown>;
      expect(githubIssueSummarySchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // structural distinction: a PR summary lacks `comments`, an issue summary lacks `draft`
    const { comments: _c, ...issueWithoutComments } = issue;
    expect(githubIssueSummarySchema.safeParse(issueWithoutComments).success).toBe(false);
    const prShaped = { ...issueWithoutComments, draft: false };
    expect(githubPullRequestSummarySchema.safeParse(prShaped).success).toBe(true); // same row minus comments + draft = a valid PR
  });
});

// The W2 branch-create REQUEST side and the 9-value outcome enum are pinned above,
// but the RESULT side — the plan RECORD, the execute RESPONSE, and the plan-response
// envelope — is not. The record/result surface carries the W2 authority spirit in a
// mirror image of the request:
//   - the plan RECORD threads the sourceSha optimistic-concurrency integrity key
//     forward (plan→execute), and its newRef is the always-"refs/heads/<name>" spine;
//     approvalId/blockedReason are the ONLY optionals — everything else is required,
//     so a plan is never half-built;
//   - status is a closed 6-state lifecycle and truthStatus a closed 3-state honesty
//     enum — neither can invent a fourth member;
//   - the execute RESULT is honest about the not-yet-observed: ref/sha/htmlUrl/
//     observedAt are all optional and stay undefined until GitHub confirms, while
//     outcome/planId/truthStatus are the required spine;
//   - the plan-response envelope carries `plan` OPTIONALLY (a blocked/not_configured
//     outcome legitimately has no plan) and never fabricates a `message`.
// Expected values are read off the schema's own declared shape (self-consistent).
describe("githubConnector — W2 branch result surface: sourceSha carried forward, closed lifecycles, honest-until-observed", () => {
  const validPlan = {
    id: "plan_1",
    repoFullName: "owner/repo",
    sourceRef: "main",
    sourceSha: "a".repeat(40),
    newBranchName: "agent/x",
    newRef: "refs/heads/agent/x",
    status: "planned" as const,
    truthStatus: "planned" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
    expiresAt: "2026-06-21T01:00:00.000Z",
  };

  it("the plan record requires the sourceSha integrity key and newRef spine; approvalId/blockedReason are the only optionals", () => {
    const parsed = githubBranchCreatePlanSchema.parse(validPlan);
    // the two optionals are never fabricated when absent
    expect(parsed.approvalId).toBeUndefined();
    expect(parsed.blockedReason).toBeUndefined();
    // every non-optional field is mandatory — omitting any of them fails
    for (const key of [
      "id",
      "repoFullName",
      "sourceRef",
      "sourceSha",
      "newBranchName",
      "newRef",
      "status",
      "truthStatus",
      "createdAt",
      "expiresAt",
    ]) {
      const { [key]: _omit, ...partial } = validPlan as Record<string, unknown>;
      expect(githubBranchCreatePlanSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("branch plan status is a closed 6-state lifecycle and truthStatus a closed 3-state honesty enum", () => {
    expect(githubBranchCreatePlanSchema.shape.status.options).toEqual([
      "planned",
      "approval_required",
      "blocked",
      "executing",
      "created",
      "failed",
    ]);
    expect(githubBranchCreatePlanSchema.shape.truthStatus.options).toEqual(["planned", "observed", "configured"]);
    expect(githubBranchCreatePlanSchema.safeParse({ ...validPlan, status: "merged" }).success).toBe(false);
    expect(githubBranchCreatePlanSchema.safeParse({ ...validPlan, truthStatus: "fabricated" }).success).toBe(false);
  });

  it("the execute result is honest about the not-yet-observed: ref/sha/htmlUrl/observedAt are optional, only outcome/planId/truthStatus are required", () => {
    const minimal = { outcome: "approval_required" as const, planId: "plan_1", truthStatus: "planned" as const };
    const parsed = githubBranchCreateExecuteResponseSchema.parse(minimal);
    expect(parsed.ref).toBeUndefined();
    expect(parsed.sha).toBeUndefined();
    expect(parsed.htmlUrl).toBeUndefined();
    expect(parsed.observedAt).toBeUndefined();
    for (const key of ["outcome", "planId", "truthStatus"]) {
      const { [key]: _omit, ...partial } = minimal as Record<string, unknown>;
      expect(githubBranchCreateExecuteResponseSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // truthStatus shares the same closed 3-state honesty enum as the plan record
    expect(githubBranchCreateExecuteResponseSchema.safeParse({ ...minimal, truthStatus: "fabricated" }).success).toBe(false);
  });

  it("the plan-response envelope carries plan optionally (a blocked outcome has no plan) and never fabricates a message", () => {
    const blocked = githubBranchCreatePlanResponseSchema.parse({ outcome: "blocked" });
    expect(blocked.plan).toBeUndefined();
    expect(blocked.message).toBeUndefined();
    const withPlan = githubBranchCreatePlanResponseSchema.parse({ outcome: "planned", plan: validPlan });
    expect(withPlan.plan?.id).toBe("plan_1");
    // outcome is the one required field — an envelope with no outcome is rejected
    expect(githubBranchCreatePlanResponseSchema.safeParse({ plan: validPlan }).success).toBe(false);
  });
});

// The W6 PR-update REQUEST side (plan request bounds, execute request dual-sha
// integrity keys, outcome enum, execute reason vocab) is pinned above, but the
// plan RECORD and plan-response envelope are not. The record carries the W6
// authority/privacy spirit:
//   - DUAL optimistic-concurrency integrity: it observes currentTitleSha256 AND
//     currentBodySha256 at plan time, so an execute fails if EITHER drifted;
//   - the body is NEVER carried raw — the record exposes only a sha256 + a bounded
//     excerpt + a length, both for the current and the proposed body, so a full PR
//     body can't leak through the plan;
//   - the new* fields are all optional per change-intent — a title-only change leaves
//     every body-side new field undefined (and vice-versa), never fabricated;
//   - changeSummary is a required {titleChanged, bodyChanged, bodyDelta} triple;
//   - status is a closed 5-state lifecycle (with the honest no_op) and truthStatus a
//     closed 3-state honesty enum;
//   - the plan-response envelope carries plan optionally and never fabricates message.
// Expected values are read off the schema's own declared shape (self-consistent).
describe("githubConnector — W6 PR-update plan record: dual-sha integrity, body-never-raw, change-intent optionals", () => {
  const validPlan = {
    id: "plan_1",
    repoFullName: "owner/repo",
    pullNumber: 1,
    currentTitle: "old title",
    currentTitleSha256: "t".repeat(64),
    currentBodySha256: "b".repeat(64),
    currentBodyLength: 120,
    changeSummary: { titleChanged: false, bodyChanged: false, bodyDelta: 0 },
    status: "no_op" as const,
    truthStatus: "planned" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
    expiresAt: "2026-06-21T01:00:00.000Z",
  };

  it("requires the dual-sha + changeSummary spine; every new*/approval/blocked field is an optional never fabricated when absent", () => {
    const parsed = githubPullRequestUpdatePlanSchema.parse(validPlan);
    for (const opt of [
      "newTitle",
      "newTitleSha256",
      "newBodyExcerpt",
      "newBodySha256",
      "newBodyLength",
      "approvalId",
      "blockedReason",
    ] as const) {
      expect(parsed[opt], `${opt} stays undefined`).toBeUndefined();
    }
    for (const key of [
      "id",
      "repoFullName",
      "pullNumber",
      "currentTitle",
      "currentTitleSha256",
      "currentBodySha256",
      "currentBodyLength",
      "changeSummary",
      "status",
      "truthStatus",
      "createdAt",
      "expiresAt",
    ]) {
      const { [key]: _omit, ...partial } = validPlan as Record<string, unknown>;
      expect(githubPullRequestUpdatePlanSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("the body is never carried raw: the record shape exposes sha256/excerpt/length digests only, no currentBody/newBody field", () => {
    const keys = Object.keys(githubPullRequestUpdatePlanSchema.shape);
    // the digest forms exist…
    expect(keys).toContain("currentBodySha256");
    expect(keys).toContain("newBodySha256");
    expect(keys).toContain("newBodyExcerpt");
    expect(keys).toContain("currentBodyLength");
    // …but no raw body field can ride along
    expect(keys).not.toContain("currentBody");
    expect(keys).not.toContain("newBody");
  });

  it("status is a closed 5-state lifecycle (with honest no_op) and truthStatus a closed 3-state enum; changeSummary requires the full triple", () => {
    expect(githubPullRequestUpdatePlanSchema.shape.status.options).toEqual([
      "planned",
      "approval_required",
      "blocked",
      "no_op",
      "failed",
    ]);
    expect(githubPullRequestUpdatePlanSchema.shape.truthStatus.options).toEqual(["planned", "observed", "configured"]);
    expect(githubPullRequestUpdatePlanSchema.safeParse({ ...validPlan, status: "merged" }).success).toBe(false);
    // changeSummary is a required triple — dropping any member fails
    for (const member of ["titleChanged", "bodyChanged", "bodyDelta"]) {
      const { [member]: _omit, ...partialSummary } = validPlan.changeSummary as Record<string, unknown>;
      expect(
        githubPullRequestUpdatePlanSchema.safeParse({ ...validPlan, changeSummary: partialSummary }).success,
        `changeSummary.${member} must be mandatory`,
      ).toBe(false);
    }
  });

  it("the plan-response envelope carries plan optionally (a no_op/blocked outcome may have none) and never fabricates a message", () => {
    const bare = githubPullRequestUpdatePlanResponseSchema.parse({ outcome: "no_op" });
    expect(bare.plan).toBeUndefined();
    expect(bare.message).toBeUndefined();
    const withPlan = githubPullRequestUpdatePlanResponseSchema.parse({ outcome: "planned", plan: validPlan });
    expect(withPlan.plan?.id).toBe("plan_1");
    expect(githubPullRequestUpdatePlanResponseSchema.safeParse({ plan: validPlan }).success).toBe(false); // outcome required
  });
});
