import { describe, expect, it } from "vitest";
import {
  GITHUB_MULTIFILE_COMMIT_MAX_FILES,
  GITHUB_MULTIFILE_COMMIT_PER_FILE_BYTES_MAX,
  GITHUB_MULTIFILE_COMMIT_TOTAL_BYTES_MAX,
  GITHUB_PR_LABELS_MAX_CHANGE,
  GITHUB_PR_LABEL_NAME_MAX,
  githubBranchCreateExecuteRequestSchema,
  githubBranchCreateOutcomeSchema,
  githubBranchCreatePlanRequestSchema,
  githubCommentWriteActionSchema,
  githubCommentWriteExecuteRequestSchema,
  githubCommentWriteExecuteResponseSchema,
  githubCommentWriteOutcomeSchema,
  githubCommentWritePlanRequestSchema,
  githubFileChangeOutcomeSchema,
  githubMultiFileCommitExecuteRequestSchema,
  githubMultiFileCommitExecuteResponseSchema,
  githubMultiFileCommitOutcomeSchema,
  githubPullRequestLabelsUpdateExecuteRequestSchema,
  githubPullRequestLabelsUpdateExecuteResponseSchema,
  githubPullRequestLabelsUpdateOutcomeSchema,
  githubPullRequestLabelsUpdatePlanRequestSchema,
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
