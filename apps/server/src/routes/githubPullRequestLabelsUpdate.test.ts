import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import {
  createGithubPullRequestLabelsUpdatePlanStore,
  clearPullRequestLabelsObservedCache,
} from "../integrations/githubPullRequestLabelsUpdatePlanStore";

/**
 * W5d-Phase-1 PR labels update — 적대적 체크리스트(좁은 범위):
 *
 *   범위: labels add/remove만. assignees/milestone/project/draft/state/base/title/body는
 *   스키마에 없음 — UI든 PATCH든 절대 들어가지 못한다.
 *
 *   plan:
 *     - GitHub mutation 0(replaceIssueLabels 0)
 *     - token 미설정 → not_configured
 *     - repo not allowed → blocked
 *     - PR closed → blocked
 *     - empty change(add=[], remove=[]) → blocked
 *     - 정상: planned + currentLabelsHash + finalLabels + changeSummary
 *     - no-op(이미 다 붙어있음 + 이미 없는 것만 remove) → no_op
 *
 *   execute:
 *     - approval 없음 → approval_required
 *     - expectedCurrentLabelsHash mismatch → blocked(toctou)
 *     - PR closed since plan → blocked(pr_closed)
 *     - labels changed since plan(hash mismatch) → blocked(toctou)
 *     - 정상: PUT 1회, applied labels 반환
 *     - 멱등성: 같은 plan으로 두 번 execute → PUT 1회만
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w5d_test_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;

function hashLabels(labels: string[]): string {
  const sorted = [...labels].sort();
  return createHash("sha256").update(sorted.join("\0"), "utf8").digest("hex");
}

function clientStub(
  over: Partial<GithubReadonlyClient> & {
    token?: string;
    prState?: "open" | "closed";
    prMerged?: boolean;
    currentLabels?: string[];
  } = {},
): GithubReadonlyClient {
  const token = over.token;
  const prState = over.prState ?? "open";
  const prMerged = over.prMerged ?? false;
  const currentLabels = over.currentLabels ?? ["bug", "needs-review"];
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview:
      over.getRepoOverview ??
      (async () => ({ fullName: REPO, description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    getPullRequest:
      over.getPullRequest ??
      (async () => ({
        number: 42, title: "t", state: prState, author: "robin", draft: false,
        htmlUrl: "https://github.com/robin/lab/pull/42", createdAt: "c", updatedAt: "u",
        body: "", baseRef: "main", headRef: "agent/x", merged: prMerged,
        additions: 1, deletions: 1, changedFiles: 1, commits: 1,
      })),
    getFileContent: over.getFileContent ?? (async () => { throw new GithubReadonlyError("not found", 404); }),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "u" })),
    getRefSha: over.getRefSha ?? (async () => "stub-sha"),
    createBranchRef: over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "u" })),
    putFileContents: over.putFileContents ?? (async () => ({ commitSha: "x", blobSha: "x", htmlUrl: "x" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [] })),
    createPullRequest:
      over.createPullRequest ??
      (async () => ({ pullNumber: 1, htmlUrl: "u", headSha: "stub-head" })),
    listIssueLabels: over.listIssueLabels ?? (async () => [...currentLabels]),
    replaceIssueLabels: over.replaceIssueLabels,
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

type ReplaceLabelsFn = NonNullable<GithubReadonlyClient["replaceIssueLabels"]>;

async function planRequest(
  body: any,
  over: {
    token?: string | null;
    prState?: "open" | "closed";
    prMerged?: boolean;
    currentLabels?: string[];
    allow?: ReadonlyArray<string>;
    replaceIssueLabels?: ReplaceLabelsFn;
  } = {},
) {
  clearPullRequestLabelsObservedCache();
  const prLabelsUpdatePlanStore = createGithubPullRequestLabelsUpdatePlanStore({
    nowMs: () => Date.parse(NOW_REF),
  });
  const { respondJson, calls } = capture();
  const replaceIssueLabels = over.replaceIssueLabels;
  const resolvedToken = over.token === null ? undefined : over.token ?? TOKEN;
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/labels/plan",
    method: "POST",
    createClient: () => clientStub({
      token: resolvedToken,
      prState: over.prState,
      prMerged: over.prMerged,
      currentLabels: over.currentLabels,
      replaceIssueLabels,
    }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => body,
    prLabelsUpdatePlanStore,
    writeRepoAllowlist: over.allow ?? ALLOW,
    verifyApproval: async () => true,
  });
  return { calls, prLabelsUpdatePlanStore, replaceIssueLabels };
}

async function executeRequest(
  prLabelsUpdatePlanStore: ReturnType<typeof createGithubPullRequestLabelsUpdatePlanStore>,
  body: any,
  over: {
    verifyApproval?: (approvalId: string) => Promise<boolean>;
    replaceIssueLabels?: ReplaceLabelsFn;
    currentLabels?: string[];
    prState?: "open" | "closed";
    prMerged?: boolean;
  } = {},
) {
  const { respondJson, calls } = capture();
  const replaceIssueLabels = over.replaceIssueLabels ?? (async (_o: string, _r: string, _n: number, labels: ReadonlyArray<string>) => ({
    labels: [...labels].sort(),
  }));
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/labels/execute",
    method: "POST",
    createClient: () => clientStub({
      token: TOKEN,
      currentLabels: over.currentLabels,
      prState: over.prState,
      prMerged: over.prMerged,
      replaceIssueLabels,
    }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => body,
    prLabelsUpdatePlanStore,
    writeRepoAllowlist: ALLOW,
    verifyApproval: over.verifyApproval ?? (async () => true),
  });
  return { calls, replaceIssueLabels };
}

describe("W5d PR labels update — Phase 1 (labels only)", () => {
  it("(#1) plan은 replaceIssueLabels 등 어떤 mutation도 호출하지 않는다", async () => {
    const replaceIssueLabels = vi.fn(async (_o: string, _r: string, _n: number, labels: ReadonlyArray<string>) => ({
      labels: [...labels].sort(),
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
      { replaceIssueLabels },
    );
    expect(calls[0]!.payload.outcome).toBe("planned");
    expect(replaceIssueLabels).not.toHaveBeenCalled();
  });

  it("(#2) token 미설정 → not_configured", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
      { token: null },
    );
    expect(calls[0]!.payload.outcome).toBe("not_configured");
  });

  it("(#3) repo not in allowlist → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: "evil/repo", pullNumber: 42, addLabels: ["x"], removeLabels: [] },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#4) PR closed → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["x"], removeLabels: [] },
      { prState: "closed" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("open");
  });

  it("(#5) 빈 변경(add=[], remove=[]) → blocked", async () => {
    const { calls } = await planRequest({ repoFullName: REPO, pullNumber: 42, addLabels: [], removeLabels: [] });
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#6) no_op(이미 다 붙어있고, 없는 것만 remove) → no_op", async () => {
    // 현재 ['bug', 'needs-review'] — 'bug'를 add(이미 있음) + 'nonexistent' remove(없음).
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["bug"], removeLabels: ["nonexistent"] },
    );
    expect(calls[0]!.payload.outcome).toBe("no_op");
  });

  it("(#7) 정상 plan: currentLabels + finalLabels + changeSummary(actuallyAdded/removed/noop)", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement", "bug"], removeLabels: ["needs-review", "ghost"] },
    );
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    expect(plan.currentLabels).toEqual(["bug", "needs-review"]);
    expect(plan.currentLabelsHash).toBe(hashLabels(["bug", "needs-review"]));
    // 'enhancement'는 새로 추가, 'bug'는 이미 있음(noop), 'needs-review'는 실제 제거,
    // 'ghost'는 원래 없음(noop).
    expect(plan.changeSummary.actuallyAdded).toEqual(["enhancement"]);
    expect(plan.changeSummary.actuallyRemoved).toEqual(["needs-review"]);
    expect(plan.changeSummary.noopAdd).toEqual(["bug"]);
    expect(plan.changeSummary.noopRemove).toEqual(["ghost"]);
    // final = (current - removed) + added → ['bug', 'enhancement'] (정렬됨)
    expect(plan.finalLabels).toEqual(["bug", "enhancement"]);
    expect(plan.status).toBe("approval_required");
  });

  it("(#8) execute approval 없음 → approval_required", async () => {
    const { prLabelsUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
    );
    const plan = planCalls[0]!.payload.plan;
    const { calls } = await executeRequest(prLabelsUpdatePlanStore, {
      planId: plan.id,
      expectedCurrentLabelsHash: plan.currentLabelsHash,
      approvalId: "",
    });
    expect(calls[0]!.payload.outcome).toBe("approval_required");
  });

  it("(#9) execute expectedCurrentLabelsHash 불일치 → blocked(toctou_labels_mismatch)", async () => {
    const { prLabelsUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
    );
    const plan = planCalls[0]!.payload.plan;
    const { calls } = await executeRequest(prLabelsUpdatePlanStore, {
      planId: plan.id,
      expectedCurrentLabelsHash: hashLabels(["totally-different"]),
      approvalId: "appr-1",
    });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.reason).toBe("toctou_labels_mismatch");
  });

  it("(#10) execute 시점에 GitHub labels가 바뀜 → blocked(toctou_labels_mismatch)", async () => {
    const { prLabelsUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
    );
    const plan = planCalls[0]!.payload.plan;
    // execute 시점에 누군가 labels를 ['something-else']로 바꿔놓음.
    const { calls } = await executeRequest(
      prLabelsUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentLabelsHash: plan.currentLabelsHash,
        approvalId: "appr-1",
      },
      { currentLabels: ["something-else"] },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.reason).toBe("toctou_labels_mismatch");
  });

  it("(#11) execute 시점에 PR이 closed가 됐으면 → blocked(pr_closed)", async () => {
    const { prLabelsUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
    );
    const plan = planCalls[0]!.payload.plan;
    const { calls } = await executeRequest(
      prLabelsUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentLabelsHash: plan.currentLabelsHash,
        approvalId: "appr-1",
      },
      { prState: "closed" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.reason).toBe("pr_closed");
  });

  it("(#12) 정상 execute: PUT 1회 + appliedLabels 반환 + raw labels외 다른 키 노출 X", async () => {
    const { prLabelsUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: ["needs-review"] },
    );
    const plan = planCalls[0]!.payload.plan;
    const replaceIssueLabels = vi.fn(async (_o: string, _r: string, _n: number, labels: ReadonlyArray<string>) => ({
      labels: [...labels].sort(),
    }));
    const { calls } = await executeRequest(
      prLabelsUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentLabelsHash: plan.currentLabelsHash,
        approvalId: "appr-1",
      },
      { replaceIssueLabels },
    );
    expect(replaceIssueLabels).toHaveBeenCalledTimes(1);
    // PUT 본문은 finalLabels(=['bug', 'enhancement']).
    expect(replaceIssueLabels).toHaveBeenCalledWith("robin", "lab", 42, ["bug", "enhancement"]);
    const payload = calls[0]!.payload;
    expect(payload.outcome).toBe("observed");
    expect(payload.appliedLabels).toEqual(["bug", "enhancement"]);
    expect(payload.pullNumber).toBe(42);
    expect(payload.htmlUrl).toContain("github.com/robin/lab/pull/42");
    // response에 milestone/assignees/draft/state 같은 키가 들어가지 않는다 — 인터페이스가 막아둠.
    const fullPayload = JSON.stringify(payload);
    expect(fullPayload).not.toContain("\"milestone\"");
    expect(fullPayload).not.toContain("\"assignees\"");
    expect(fullPayload).not.toContain("\"draft\"");
    expect(fullPayload).not.toContain("\"state\"");
  });

  it("(#13) 멱등성: 같은 plan으로 두 번 execute → PUT 1회만", async () => {
    const { prLabelsUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, addLabels: ["enhancement"], removeLabels: [] },
    );
    const plan = planCalls[0]!.payload.plan;
    const replaceIssueLabels = vi.fn(async (_o: string, _r: string, _n: number, labels: ReadonlyArray<string>) => ({
      labels: [...labels].sort(),
    }));
    const body = {
      planId: plan.id,
      expectedCurrentLabelsHash: plan.currentLabelsHash,
      approvalId: "appr-1",
    };
    const first = await executeRequest(prLabelsUpdatePlanStore, body, { replaceIssueLabels });
    const second = await executeRequest(prLabelsUpdatePlanStore, body, { replaceIssueLabels });
    expect(replaceIssueLabels).toHaveBeenCalledTimes(1);
    expect(first.calls[0]!.payload.outcome).toBe("observed");
    expect(second.calls[0]!.payload.outcome).toBe("observed");
  });

  it("(#14 회귀) 스키마 자체가 milestone/assignees/draft/state 같은 키를 받지 않는다", async () => {
    // 잘못된 키가 들어와도 zod parse에서 통과되는 게 아니라(passthrough 안 함) plan은 정상 처리되고 무관 키는 무시된다.
    const { calls } = await planRequest({
      repoFullName: REPO,
      pullNumber: 42,
      addLabels: ["enhancement"],
      removeLabels: [],
      // 아래 키들은 무시되어야 한다.
      assignees: ["alice"],
      milestone: 3,
      draft: true,
      state: "closed",
    });
    expect(calls[0]!.payload.outcome).toBe("planned");
    // 응답에 그 키들이 그대로 echo되지는 않는다.
    const plan = calls[0]!.payload.plan;
    expect("assignees" in plan).toBe(false);
    expect("milestone" in plan).toBe(false);
    expect("draft" in plan).toBe(false);
    expect("state" in plan).toBe(false);
  });
});
