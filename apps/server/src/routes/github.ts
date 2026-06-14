import { randomUUID } from "node:crypto";
import {
  GithubNotConfiguredError,
  GithubReadonlyError,
  type GithubReadonlyClient,
} from "../integrations/githubReadonlyClient.js";
import {
  bodyPreviewOf,
  bodySha256,
  evaluateCommentWriteGate,
  parseRepoAllowlist,
} from "../integrations/githubCommentWriteGuards.js";
import {
  createGithubCommentWritePlanStore,
  getObservedFor,
  type GithubCommentWritePlanStore,
} from "../integrations/githubCommentWritePlanStore.js";
import {
  evaluateBranchCreateGate,
} from "../integrations/githubBranchWriteGuards.js";
import {
  getBranchObservedFor,
  type GithubBranchCreatePlanStore,
} from "../integrations/githubBranchCreatePlanStore.js";
import {
  contentSha256,
  evaluateFileChangeGate,
} from "../integrations/githubFileChangeWriteGuards.js";
import {
  getFileChangeObservedFor,
  type GithubFileChangePlanStore,
} from "../integrations/githubFileChangePlanStore.js";
import { generateUnifiedDiff } from "../integrations/githubFileDiff.js";
import { evaluatePrCreateGate } from "../integrations/githubPullRequestWriteGuards.js";
import {
  evaluatePrUpdateGate,
  sha256Hex as prUpdateSha256Hex,
} from "../integrations/githubPullRequestUpdateGuards.js";
import {
  runMultiFileCommitExecute,
  type GithubGitDataClient,
} from "../integrations/githubMultiFileCommit.js";
import {
  getPullRequestObservedFor,
  type GithubPullRequestCreatePlanStore,
} from "../integrations/githubPullRequestCreatePlanStore.js";
import {
  getPullRequestUpdateObservedFor,
  type GithubPullRequestUpdatePlanStore,
} from "../integrations/githubPullRequestUpdatePlanStore.js";
import {
  computeLabelDiff,
  evaluatePrLabelsUpdateGate,
  hashLabelSet,
} from "../integrations/githubPullRequestLabelsUpdateGuards.js";
import {
  getPullRequestLabelsObservedFor,
  type GithubPullRequestLabelsUpdatePlanStore,
} from "../integrations/githubPullRequestLabelsUpdatePlanStore.js";
import {
  githubBranchCreateExecuteRequestSchema,
  githubBranchCreatePlanRequestSchema,
  githubCommentWriteExecuteRequestSchema,
  githubCommentWritePlanRequestSchema,
  githubFileChangeExecuteRequestSchema,
  githubFileChangePlanRequestSchema,
  githubMultiFileCommitExecuteRequestSchema,
  githubPullRequestCreateExecuteRequestSchema,
  githubPullRequestCreatePlanRequestSchema,
  githubPullRequestUpdateExecuteRequestSchema,
  githubPullRequestUpdatePlanRequestSchema,
  githubPullRequestLabelsUpdateExecuteRequestSchema,
  githubPullRequestLabelsUpdatePlanRequestSchema,
  type GithubBranchCreateOutcome,
  type GithubBranchCreatePlan,
  type GithubCommentWriteOutcome,
  type GithubCommentWritePlan,
  type GithubFileChangeOperation,
  type GithubFileChangeOutcome,
  type GithubFileChangePlan,
  type GithubPullRequestCompareFile,
  type GithubPullRequestCreateOutcome,
  type GithubPullRequestCreatePlan,
  type GithubResourceOutcome,
} from "@ai-orchestrator/protocol";
import type { IncomingMessage } from "node:http";

/**
 * Read-only GitHub connector routes. Every route is GET; there is no write
 * surface. The token never crosses this boundary — only the connector status
 * (booleans) and read-only resources do.
 *
 * Outcomes are honest and distinct: only `observed` carries real HTTP-200 data;
 * `not_configured` / `permission_denied` (401·403) / `connection_failed`
 * (network) / `github_error` each name exactly why there is no data, so the UI
 * never shows an empty list that looks like "no PRs".
 *
 *   GET /integrations/github/status
 *   GET /integrations/github/repos/:owner/:repo/overview
 *   GET /integrations/github/repos/:owner/:repo/pulls
 *   GET /integrations/github/repos/:owner/:repo/pulls/:number
 *   GET /integrations/github/repos/:owner/:repo/issues
 */

export type GithubRouteDependencies = {
  pathname: string;
  method?: string;
  /** builds a client from the server-side token (env). Injected for testability. */
  createClient: () => GithubReadonlyClient;
  respondJson: (statusCode: number, payload: unknown) => void;
  /** ISO clock — injected for deterministic observedAt in tests */
  now?: () => string;
  /** raw request for POST body parsing (W1) — injected from index.ts */
  request?: IncomingMessage;
  readJsonBody?: (request: IncomingMessage) => Promise<unknown>;
  /** in-process plan store(W1) — 단일 인스턴스를 인덱스에서 만들어 주입. */
  planStore?: GithubCommentWritePlanStore;
  /** in-process branch create plan store(W2) — W1과 별도 인스턴스. */
  branchPlanStore?: GithubBranchCreatePlanStore;
  /** in-process file change plan store(W3a) — W1/W2와 별도 인스턴스. */
  fileChangePlanStore?: GithubFileChangePlanStore;
  /** in-process PR create plan store(W4a). */
  prPlanStore?: GithubPullRequestCreatePlanStore;
  /** in-process PR title/body update plan store(W5c). */
  prUpdatePlanStore?: GithubPullRequestUpdatePlanStore;
  /** in-process PR labels update plan store(W5d-Phase-1). */
  prLabelsUpdatePlanStore?: GithubPullRequestLabelsUpdatePlanStore;
  /** GITHUB_WRITE_REPO_ALLOWLIST 파싱 결과 — 없으면 write disabled. */
  writeRepoAllowlist?: ReadonlyArray<string>;
  /** GITHUB_PR_BASE_ALLOWLIST 파싱 결과 — 비어 있으면 기본 main/develop. */
  prBaseAllowlist?: ReadonlyArray<string>;
  /**
   * W1 approval-or-armed 검증. approval은 서버 측 store(approval 이벤트 소스)에서 verify되며,
   * armed는 클라이언트가 보낸 armedAt을 신뢰하되 plan TTL 내 + autoExecuteArmed===true일 때만
   * 통과시킨다(클라이언트만 표식). 둘 다 없거나 미일치면 blocked.
   */
  verifyApproval?: (approvalId: string) => Promise<boolean>;
  /** W5b — main/master 등 직접 commit 금지할 보호 브랜치(env GITHUB_PROTECTED_BRANCHES 기반, 기본 ['main','master']). */
  protectedBranches?: ReadonlyArray<string>;
};

const REPO_RESOURCE = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/(overview|pulls|issues)$/;
const PR_DETAIL = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/;
const FILE_RESOURCE = /^\/integrations\/github\/repos\/([^/]+)\/([^/]+)\/file$/;

const NOT_CONFIGURED_MESSAGE = "미설정 — 서버 GITHUB_TOKEN을 설정하면 조회됩니다.";

function parseState(pathname: string): "open" | "closed" | "all" {
  const match = /[?&]state=(open|closed|all)\b/.exec(pathname);
  return (match?.[1] as "open" | "closed" | "all" | undefined) ?? "open";
}

/** map a thrown error to an honest, distinct outcome the UI can render */
function outcomeForError(error: unknown): { outcome: GithubResourceOutcome; message: string } {
  if (error instanceof GithubNotConfiguredError) {
    return { outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE };
  }
  if (error instanceof GithubReadonlyError) {
    if (error.status === 401 || error.status === 403) {
      return { outcome: "permission_denied", message: "권한 부족 — 토큰 스코프 또는 저장소 접근 권한을 확인하세요." };
    }
    if (error.status === 0) {
      return { outcome: "connection_failed", message: "연결 실패 — GitHub에 도달하지 못했습니다." };
    }
    return { outcome: "github_error", message: error.message };
  }
  return { outcome: "github_error", message: error instanceof Error ? error.message : String(error) };
}

// W1 comment write 경로 — execute는 별도의 명시 게이트(armed-or-approval)를 통과해야 한다.
const COMMENT_PLAN_PATH = "/integrations/github/write/comment/plan";
const COMMENT_EXECUTE_PATH = "/integrations/github/write/comment/execute";

// W2 branch create 경로 — execute는 approval 전용(armed 없음).
const BRANCH_PLAN_PATH = "/integrations/github/write/branch/plan";
const BRANCH_EXECUTE_PATH = "/integrations/github/write/branch/execute";

// W3a file change plan 경로 — plan only. execute(W3b)는 별도 path.
const FILE_PLAN_PATH = "/integrations/github/write/file/plan";

// W3b file change execute — approval-only. armed 없음.
const FILE_EXECUTE_PATH = "/integrations/github/write/file/execute";
const MULTIFILE_COMMIT_EXECUTE_PATH = "/integrations/github/write/multifile/commit/execute";

// W4a PR create plan 경로 — plan only.
const PR_PLAN_PATH = "/integrations/github/write/pr/plan";

// W4b PR create execute 경로 — approval-only. MCP execute tool은 추가하지 않음(서버 단독).
const PR_EXECUTE_PATH = "/integrations/github/write/pr/execute";

// W5c PR title/body update 경로 — approval-only. draft/state/base/labels/assignees 전부 제외.
const PR_UPDATE_PLAN_PATH = "/integrations/github/write/pr/update/plan";
const PR_UPDATE_EXECUTE_PATH = "/integrations/github/write/pr/update/execute";

// W5d Phase 1 — PR labels add/remove. assignees는 Phase 2(별도 경로).
const PR_LABELS_PLAN_PATH = "/integrations/github/write/pr/labels/plan";
const PR_LABELS_EXECUTE_PATH = "/integrations/github/write/pr/labels/execute";

const PR_UPDATE_PLAN_TTL_MS = 10 * 60 * 1000;

/** compare summary의 파일 미리보기 캡 — 응답/트레이스 비대 방지. */
const PR_COMPARE_FILES_PREVIEW_MAX = 50;

/** comment write 결과 — readonly outcome enum과 호환(observed 외에 planned/approval_required/blocked 추가) */
function writeOutcomeForError(error: unknown): { outcome: GithubCommentWriteOutcome; message: string } {
  const mapped = outcomeForError(error);
  // GithubResourceOutcome → GithubCommentWriteOutcome 매핑(공통 항목 그대로).
  // W2/W3a와 동일하게 route-level token scrub 적용(defense-in-depth — client scrub 실패 시 보장).
  return { outcome: mapped.outcome as GithubCommentWriteOutcome, message: scrubServerToken(mapped.message) };
}

async function handleCommentWritePlan(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, planStore } = deps;
  if (!readJsonBody || !request || !planStore) {
    respondJson(500, { outcome: "github_error", message: "W1 dependencies not wired" });
    return true;
  }
  const status = createClient().status();
  // token 미설정이면 read와 동일하게 not_configured. plan을 만들지 않는다.
  if (!status.tokenPresent) {
    respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않아 write가 비활성화되어 있습니다" });
    return true;
  }
  let payload;
  try {
    payload = githubCommentWritePlanRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 plan 요청" });
    return true;
  }
  const allowlist = writeRepoAllowlist ?? [];
  const gate = evaluateCommentWriteGate({
    repoFullName: payload.repoFullName,
    body: payload.body,
    allowlist,
    tokenPresent: true,
  });
  const nowIso = deps.now?.() ?? new Date().toISOString();
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", message: gate.reason });
    return true;
  }
  // target 존재 확인 — read 경로를 그대로 사용해 GitHub로 GET. write 전 단계라 안전.
  const client = createClient();
  try {
    if (payload.targetKind === "pull_request") {
      await client.getPullRequest(payload.repoFullName.split("/")[0]!, payload.repoFullName.split("/")[1]!, payload.number);
    } else {
      // issue 존재 확인은 issues 목록을 가볍게 가져오는 대신 PR 조회처럼 단건 GET이 GitHub API에 없어
      // listIssues로 대체. 권한/연결 오류는 outcomeForError로 매핑.
      await client.listIssues(payload.repoFullName.split("/")[0]!, payload.repoFullName.split("/")[1]!, { perPage: 1 });
    }
  } catch (error) {
    const mapped = writeOutcomeForError(error);
    respondJson(200, mapped);
    return true;
  }
  const planId = `gcwp_${randomUUID()}`;
  const expiresAt = new Date(Date.parse(nowIso) + 10 * 60 * 1000).toISOString();
  const targetUrl = `https://github.com/${payload.repoFullName}/${payload.targetKind === "pull_request" ? "pull" : "issues"}/${payload.number}`;
  const plan: GithubCommentWritePlan = {
    id: planId,
    action: "comment_create",
    repoFullName: payload.repoFullName,
    number: payload.number,
    targetKind: payload.targetKind,
    bodyPreview: gate.preview,
    bodySha256: gate.sha,
    bodyLength: payload.body.length,
    targetUrl,
    status: "approval_required",
    truthStatus: "planned",
    createdAt: nowIso,
    expiresAt,
  };
  planStore.put({ plan, bodySha256: gate.sha, body: payload.body });
  respondJson(200, { outcome: "planned", plan });
  return true;
}

async function handleCommentWriteExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, planStore, writeRepoAllowlist, verifyApproval } = deps;
  if (!readJsonBody || !request || !planStore) {
    respondJson(500, { outcome: "github_error", message: "W1 dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubCommentWriteExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  const record = planStore.get(payload.planId);
  if (!record) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "plan을 찾을 수 없거나 만료됨" });
    return true;
  }
  // 멱등성 — 같은 plan이 이미 게시되었으면 기존 결과를 그대로 반환(중복 POST 금지).
  const observed = getObservedFor(payload.planId);
  if (observed) {
    respondJson(200, {
      outcome: "observed",
      planId: payload.planId,
      commentId: observed.commentId,
      htmlUrl: observed.htmlUrl,
      observedAt: observed.observedAt,
      truthStatus: "observed",
    });
    return true;
  }
  if (record.bodySha256 !== payload.bodySha256) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "bodySha256 불일치 — plan 본문이 변조되었거나 다른 본문입니다" });
    return true;
  }
  // 게이트 한 번 더(시간 경과 후 allowlist 환경 변경 가능성 대응).
  const status = createClient().status();
  const gate = evaluateCommentWriteGate({
    repoFullName: record.plan.repoFullName,
    body: record.body,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: gate.reason });
    return true;
  }
  // approval-or-armed: 둘 중 하나가 반드시 통과. 둘 다 없으면 blocked.
  let authorized = false;
  let authReason = "";
  if (payload.approvalId && verifyApproval) {
    authorized = await verifyApproval(payload.approvalId);
    authReason = authorized ? "approval_granted" : "approval_not_granted";
  }
  if (!authorized && payload.autoExecuteArmed === true && payload.armedAt) {
    // armed는 클라이언트 표식 — 서버가 독립적으로 freshness를 강제한다.
    // (1) armedAt이 과거여야 함(미래는 시계 왜곡/위조 가능성),
    // (2) "지금"으로부터 ARMED_TTL_MS 이내,
    // (3) plan 생성 시각 이전(같은 armed 표식이 만료 후 새 plan을 무한정 권한 부여 못 하게).
    const ARMED_TTL_MS = 30 * 60 * 1000;
    const armedMs = Date.parse(payload.armedAt);
    const nowMs = Date.parse(deps.now?.() ?? new Date().toISOString());
    const planCreatedMs = Date.parse(record.plan.createdAt);
    if (
      Number.isFinite(armedMs) &&
      Number.isFinite(nowMs) &&
      armedMs <= nowMs &&
      nowMs - armedMs <= ARMED_TTL_MS &&
      (!Number.isFinite(planCreatedMs) || armedMs <= planCreatedMs + ARMED_TTL_MS)
    ) {
      authorized = true;
      authReason = "auto_execute_armed";
    } else {
      authReason = "armed_expired";
    }
  }
  if (!authorized) {
    respondJson(200, {
      outcome: "blocked",
      planId: payload.planId,
      truthStatus: "planned",
      message: `자동실행이 armed되지 않았거나 approval이 없습니다(${authReason || "approval/armed missing"})`,
    });
    return true;
  }
  // 타겟 존재 재확인 — plan 이후 10분 사이 target이 삭제됐을 가능성을 닫는다.
  // 실패하면 plan 상태 유지(truthStatus=planned)로 정직 반환.
  const [preflightOwner, preflightRepo] = record.plan.repoFullName.split("/") as [string, string];
  try {
    const preflightClient = createClient();
    if (record.plan.targetKind === "pull_request") {
      await preflightClient.getPullRequest(preflightOwner, preflightRepo, record.plan.number);
    } else {
      await preflightClient.listIssues(preflightOwner, preflightRepo, { perPage: 1 });
    }
  } catch (error) {
    const mapped = writeOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
    return true;
  }
  // 동시 execute 경쟁 차단 — POST 직전 동기 점유. 같은 planId로 들어온 두 번째 호출은
  // claim에 실패해 즉시 blocked로 거절된다(중복 GitHub POST 방지). Node 단일 스레드 가정.
  if (!planStore.tryClaim(record.plan.id)) {
    respondJson(200, { outcome: "blocked", planId: record.plan.id, truthStatus: "planned", message: "동일 plan이 이미 실행 중입니다" });
    return true;
  }
  // 실제 게시 — body는 서버가 보유한 원본(record.body)을 사용. 클라이언트가 보낸 sha와 일치해야만 여기 도달.
  const [owner, repo] = record.plan.repoFullName.split("/") as [string, string];
  try {
    const observation = await createClient().postIssueComment(owner, repo, record.plan.number, record.body);
    const observedAt = deps.now?.() ?? new Date().toISOString();
    planStore.markCreated(record.plan.id, { commentId: observation.id, htmlUrl: observation.htmlUrl, observedAt });
    respondJson(200, {
      outcome: "observed",
      planId: record.plan.id,
      commentId: observation.id,
      htmlUrl: observation.htmlUrl,
      observedAt,
      truthStatus: "observed",
    });
  } catch (error) {
    // 일시적 GitHub 오류 후 재시도가 가능하도록 점유 해제(재시도시 동일 sha면 다시 claim 가능).
    planStore.release(record.plan.id);
    const mapped = writeOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W2 branch create handlers
// 안전선 요약(comment write와의 차이도 함께):
//   - branch name policy 통과(agent/* work/* 등) — 보호 브랜치 직접 생성 금지
//   - sourceRef preflight: GitHub GET으로 sha를 observed로 못 박는다
//   - target ref 존재 여부 preflight: 이미 있으면 already_exists로 정직 반환(POST 금지)
//   - approval **only**: comment의 armed 경로를 W2는 의도적으로 제공하지 않는다
//   - sourceSha integrity 3중 확인: plan 저장 sha == execute payload sha == execute 시점 재GET sha
//   - tryClaim 동기 점유 + observedCache 멱등(동일 plan 재실행 시 1회만 POST)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 방어선 — 호출자에게 보내는 message에서 process.env.GITHUB_TOKEN을 한 번 더 제거한다.
 * (readonlyClient는 자체 scrub을 갖지만 모든 throw 경로를 보장하지 않으므로 route 측에서도
 *  defense-in-depth 적용. write 표면 전반에 공통 적용 가능하도록 분리.)
 */
function scrubServerToken(message: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.length < 8) return message;
  return message.split(token).join("<redacted-token>");
}

function branchOutcomeForError(error: unknown): { outcome: GithubBranchCreateOutcome; message: string } {
  const mapped = outcomeForError(error);
  return {
    outcome: mapped.outcome as GithubBranchCreateOutcome,
    message: scrubServerToken(mapped.message),
  };
}

async function handleBranchCreatePlan(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, branchPlanStore } = deps;
  if (!readJsonBody || !request || !branchPlanStore) {
    respondJson(500, { outcome: "github_error", message: "W2 dependencies not wired" });
    return true;
  }
  const status = createClient().status();
  if (!status.tokenPresent) {
    respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않아 write가 비활성화되어 있습니다" });
    return true;
  }
  let payload;
  try {
    payload = githubBranchCreatePlanRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 plan 요청" });
    return true;
  }
  const allowlist = writeRepoAllowlist ?? [];
  const gate = evaluateBranchCreateGate({
    repoFullName: payload.repoFullName,
    sourceRef: payload.sourceRef,
    newBranchName: payload.newBranchName,
    allowlist,
    tokenPresent: true,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", message: gate.reason });
    return true;
  }
  const [owner, repo] = payload.repoFullName.split("/") as [string, string];
  // 1) source ref 존재 확인 + sha 확정. 없으면 정직하게 알려준다.
  let sourceSha: string;
  try {
    sourceSha = await createClient().getRefSha(owner, repo, gate.sourceRef);
  } catch (error) {
    const mapped = branchOutcomeForError(error);
    respondJson(200, mapped);
    return true;
  }
  // 2) target ref가 이미 있으면 overwrite 금지 — plan 단계에서 already_exists로 끝낸다.
  const newRefName = gate.ref.replace(/^refs\/heads\//, "");
  try {
    await createClient().getRefSha(owner, repo, newRefName);
    respondJson(200, {
      outcome: "already_exists",
      message: `${payload.repoFullName}#${newRefName} 브랜치가 이미 존재합니다(덮어쓰기 금지)`,
    });
    return true;
  } catch (error) {
    // 404는 정상(없어서 만들 수 있음). 그 외 오류는 정직 반환.
    if (error instanceof GithubReadonlyError && error.status === 404) {
      // good — 새로 만들 수 있다.
    } else {
      const mapped = branchOutcomeForError(error);
      respondJson(200, mapped);
      return true;
    }
  }
  const nowIso = deps.now?.() ?? new Date().toISOString();
  const planId = `gbcp_${randomUUID()}`;
  const expiresAt = new Date(Date.parse(nowIso) + 10 * 60 * 1000).toISOString();
  const plan: GithubBranchCreatePlan = {
    id: planId,
    repoFullName: payload.repoFullName,
    sourceRef: gate.sourceRef,
    sourceSha,
    newBranchName: newRefName,
    newRef: gate.ref,
    status: "approval_required",
    truthStatus: "planned",
    createdAt: nowIso,
    expiresAt,
  };
  branchPlanStore.put({ plan, sourceSha });
  respondJson(200, { outcome: "planned", plan });
  return true;
}

async function handleBranchCreateExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, branchPlanStore, writeRepoAllowlist, verifyApproval } = deps;
  if (!readJsonBody || !request || !branchPlanStore) {
    respondJson(500, { outcome: "github_error", message: "W2 dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubBranchCreateExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  const record = branchPlanStore.get(payload.planId);
  if (!record) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "plan을 찾을 수 없거나 만료됨" });
    return true;
  }
  // 멱등성 — 이미 created면 동일 결과 반환(중복 POST 금지).
  const observed = getBranchObservedFor(payload.planId);
  if (observed) {
    respondJson(200, {
      outcome: "observed",
      planId: payload.planId,
      ref: observed.ref,
      sha: observed.sha,
      htmlUrl: observed.htmlUrl,
      observedAt: observed.observedAt,
      truthStatus: "observed",
    });
    return true;
  }
  // sourceSha 무결성(1차) — plan과 client payload가 일치해야 함.
  if (record.sourceSha !== payload.sourceSha) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "sourceSha 불일치 — plan source가 변조되었거나 다른 sha입니다" });
    return true;
  }
  // 게이트 재평가 — 시간 경과 후 환경 변경(allowlist 등) 대응.
  const status = createClient().status();
  const gate = evaluateBranchCreateGate({
    repoFullName: record.plan.repoFullName,
    sourceRef: record.plan.sourceRef,
    newBranchName: record.plan.newBranchName,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: gate.reason });
    return true;
  }
  // W2는 approval **only** — armed 경로 없음. approvalId 없거나 verify 실패면 blocked.
  if (!payload.approvalId || !verifyApproval) {
    respondJson(200, { outcome: "approval_required", planId: payload.planId, truthStatus: "planned", message: "approval이 필요합니다" });
    return true;
  }
  const authorized = await verifyApproval(payload.approvalId);
  if (!authorized) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "approval이 승인되지 않았습니다" });
    return true;
  }
  const [owner, repo] = record.plan.repoFullName.split("/") as [string, string];
  // sourceSha 무결성(2차) — execute 시점 GitHub에서 다시 GET. plan 이후 force-push 등으로
  // sha가 바뀌었다면 "내가 plan한 그 sha"가 아니므로 정직하게 막는다.
  let freshSourceSha: string;
  try {
    freshSourceSha = await createClient().getRefSha(owner, repo, record.plan.sourceRef);
  } catch (error) {
    const mapped = branchOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
    return true;
  }
  if (freshSourceSha !== record.sourceSha) {
    respondJson(200, {
      outcome: "blocked",
      planId: record.plan.id,
      truthStatus: "planned",
      message: `sourceRef '${record.plan.sourceRef}'의 sha가 plan 시점 이후 변경되었습니다 — 다시 plan을 만드세요`,
    });
    return true;
  }
  // target ref 존재 재확인 — plan 이후 누군가가 같은 이름을 만들었다면 overwrite 금지.
  try {
    await createClient().getRefSha(owner, repo, record.plan.newBranchName);
    // 200 OK가 떨어졌다는 건 이미 존재한다는 뜻.
    respondJson(200, {
      outcome: "already_exists",
      planId: record.plan.id,
      truthStatus: "planned",
      message: `${record.plan.repoFullName}#${record.plan.newBranchName} 브랜치가 plan 이후 생성되었습니다`,
    });
    return true;
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      // good — 없으니 만들 수 있다.
    } else {
      const mapped = branchOutcomeForError(error);
      respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
      return true;
    }
  }
  // 동시 execute 경쟁 차단 — POST 직전 동기 점유.
  if (!branchPlanStore.tryClaim(record.plan.id)) {
    respondJson(200, { outcome: "blocked", planId: record.plan.id, truthStatus: "planned", message: "동일 plan이 이미 실행 중입니다" });
    return true;
  }
  try {
    const observation = await createClient().createBranchRef(owner, repo, record.plan.newRef, record.sourceSha);
    const observedAt = deps.now?.() ?? new Date().toISOString();
    branchPlanStore.markCreated(record.plan.id, {
      ref: observation.ref,
      sha: observation.sha,
      htmlUrl: observation.htmlUrl,
      observedAt,
    });
    respondJson(200, {
      outcome: "observed",
      planId: record.plan.id,
      ref: observation.ref,
      sha: observation.sha,
      htmlUrl: observation.htmlUrl,
      observedAt,
      truthStatus: "observed",
    });
  } catch (error) {
    branchPlanStore.release(record.plan.id);
    // GitHub 422는 일반적으로 "Reference already exists" — already_exists로 매핑.
    if (error instanceof GithubReadonlyError && error.status === 422) {
      respondJson(200, {
        outcome: "already_exists",
        planId: record.plan.id,
        truthStatus: "planned",
        message: "GitHub: 동일 이름의 ref가 이미 존재합니다",
      });
      return true;
    }
    const mapped = branchOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W3a file change plan handler — GitHub로 보내는 mutation은 절대 없다.
// 흐름:
//   1) token/payload 검증, 정적 게이트(allowlist/branch/path/length/binary/secret) 통과
//   2) GitHub로 branch ref read → ref 존재 + sha 관측
//   3) GitHub로 file GET → 있으면 operation=update + baseFileSha+baseContent 관측, 없으면 operation=create
//   4) base 콘텐츠 텍스트성/길이 가드(W3a는 텍스트 파일만)
//   5) no-op 검사(base == new면 차단)
//   6) baseFileSha 클라이언트 hint와 서버 관측 sha 비교(있는 경우 미일치 차단 — 낙관적 동시성)
//   7) unified diff 생성(bounded) + diffStat 계산
//   8) plan 저장, 응답
//
//   - GitHub PUT/DELETE/commit/PR/branch 생성 호출 없음
//   - newContent는 응답 plan에 포함하지 않는다(클라이언트가 이미 갖고 있는 본문이며,
//     서버는 sha로만 무결성 보장)
// ──────────────────────────────────────────────────────────────────────────────

function fileChangeOutcomeForError(error: unknown): { outcome: GithubFileChangeOutcome; message: string } {
  const mapped = outcomeForError(error);
  return {
    outcome: mapped.outcome as GithubFileChangeOutcome,
    message: scrubServerToken(mapped.message),
  };
}

async function handleFileChangePlan(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, fileChangePlanStore } = deps;
  if (!readJsonBody || !request || !fileChangePlanStore) {
    respondJson(500, { outcome: "github_error", message: "W3a dependencies not wired" });
    return true;
  }
  const status = createClient().status();
  if (!status.tokenPresent) {
    respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않아 write가 비활성화되어 있습니다" });
    return true;
  }
  let payload;
  try {
    payload = githubFileChangePlanRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 plan 요청" });
    return true;
  }
  const allowlist = writeRepoAllowlist ?? [];
  const gate = evaluateFileChangeGate({
    repoFullName: payload.repoFullName,
    branchName: payload.branchName,
    path: payload.path,
    newContent: payload.newContent,
    allowlist,
    tokenPresent: true,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", message: gate.reason });
    return true;
  }
  const [owner, repo] = gate.repoFullName.split("/") as [string, string];
  // 1) target branch 존재 + sha 관측. 없으면 정직하게 거절.
  try {
    await createClient().getRefSha(owner, repo, gate.branchName);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      respondJson(200, {
        outcome: "blocked",
        message: `target branch '${gate.branchName}'이(가) ${gate.repoFullName}에 없습니다 — W2로 먼저 만들고 다시 시도하세요`,
      });
      return true;
    }
    const mapped = fileChangeOutcomeForError(error);
    respondJson(200, mapped);
    return true;
  }
  // 2) 파일 GET. 있으면 update + base sha/content 관측, 없으면 create.
  let operation: GithubFileChangeOperation = "create";
  let baseFileSha: string | undefined = undefined;
  let baseContent = "";
  let baseContentSha256: string | undefined = undefined;
  try {
    const file = await createClient().getFileContent(owner, repo, gate.path, gate.branchName);
    if (file.truncated) {
      respondJson(200, {
        outcome: "blocked",
        message: `대상 파일 '${gate.path}'이(가) GitHub read에서 truncated로 반환됐습니다(너무 큼) — W3a에서 다루지 않습니다`,
      });
      return true;
    }
    // base 콘텐츠도 길이/binary 가드를 통과해야 안전하게 diff/compare 가능.
    // (NUL 포함 file은 GitHub Contents API에서도 비정상 — W3a는 텍스트만)
    if (file.content.includes("\0")) {
      respondJson(200, {
        outcome: "blocked",
        message: `대상 파일 '${gate.path}'이(가) binary로 판단됩니다 — W3a는 텍스트만 다룹니다`,
      });
      return true;
    }
    operation = "update";
    baseFileSha = file.sha;
    baseContent = file.content;
    baseContentSha256 = contentSha256(file.content);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      operation = "create";
      baseFileSha = undefined;
      baseContent = "";
      baseContentSha256 = undefined;
    } else {
      const mapped = fileChangeOutcomeForError(error);
      respondJson(200, mapped);
      return true;
    }
  }
  // 3) baseFileSha 힌트와 서버 관측 sha 비교 — 클라이언트가 다른 base를 봤다면 차단.
  if (payload.baseFileSha && operation === "update" && baseFileSha !== payload.baseFileSha) {
    respondJson(200, {
      outcome: "blocked",
      message: `baseFileSha 불일치 — 클라이언트가 본 base sha(${payload.baseFileSha})와 서버 관측 sha(${baseFileSha ?? "n/a"})가 다릅니다`,
    });
    return true;
  }
  if (payload.baseFileSha && operation === "create") {
    respondJson(200, {
      outcome: "blocked",
      message: `baseFileSha를 보냈지만 대상 파일이 ${gate.repoFullName}#${gate.branchName}:${gate.path}에 존재하지 않습니다 — create 요청과 모순`,
    });
    return true;
  }
  // 4) no-op 차단 — 승인 큐를 빈 변경으로 어지럽히지 않는다.
  if (baseContent === payload.newContent) {
    respondJson(200, {
      outcome: "blocked",
      message: "newContent가 base와 동일합니다(no-op) — 변경할 내용이 없습니다",
    });
    return true;
  }
  // 5) bounded unified diff 생성.
  const oldLabel = operation === "update" ? `a/${gate.path}` : `/dev/null`;
  const newLabel = `b/${gate.path}`;
  const { diff, truncated, additions, deletions } = generateUnifiedDiff(baseContent, payload.newContent, oldLabel, newLabel);
  // diff가 생성됐는데 additions+deletions가 0인 경우(전부 truncated)는 no-op 케이스에서 이미 걸렀어야 함.
  // 그래도 안전선 — diff 본문이 너무 큰 경우 truncated만 표시하고 진행.

  const nowIso = deps.now?.() ?? new Date().toISOString();
  const planId = `gfcp_${randomUUID()}`;
  const expiresAt = new Date(Date.parse(nowIso) + 10 * 60 * 1000).toISOString();
  const plan: GithubFileChangePlan = {
    id: planId,
    repoFullName: gate.repoFullName,
    branchName: gate.branchName,
    branchRef: gate.branchRef,
    path: gate.path,
    operation,
    baseFileSha,
    baseContentSha256,
    newContentSha256: gate.newContentSha256,
    newContentLength: gate.newContentBytes,
    diffPreview: diff,
    diffTruncated: truncated,
    diffStat: { additions, deletions },
    status: "approval_required",
    truthStatus: "planned",
    createdAt: nowIso,
    expiresAt,
  };
  fileChangePlanStore.put({ plan, newContent: payload.newContent, baseContent });
  respondJson(200, { outcome: "planned", plan });
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W3b file change execute — GitHub PUT contents single file create/update.
// 흐름:
//   1) payload zod parse, plan store에서 record 조회
//   2) observedCache 검사(멱등 — 이미 PUT 성공한 plan은 동일 결과 반환)
//   3) 1차 sha 무결성: client newContentSha256 == plan.newContentSha256
//                     (update 시) client baseFileSha == plan.baseFileSha
//   4) approval 검증(approvalId + verifyApproval)
//   5) plan 시점 gate 재평가(allowlist/branch/path/secret/binary — 환경 변경 대응)
//   6) GitHub로 branch ref 재GET — 사라졌으면 blocked
//   7) GitHub로 file GET — update면 sha가 plan.baseFileSha와 일치해야 함(plan 이후 누가 바꿨으면 차단)
//                          create면 404여야 함(그 사이 생겼으면 already_exists)
//   8) tryClaim(POST 직전 동기 점유)
//   9) putFileContents(서버 생성 commit message + content base64)
//   10) markCreated(commit/blob sha 저장), 응답
//
// 보호 정책:
//   - delete 없음(API 경로 자체 미구현 — 호출자가 newContent 없이 보낼 수 없음)
//   - multi-file 없음(plan은 단일 path 한정)
//   - binary 없음(plan 단계와 execute 시점 둘 다 NUL 가드)
//   - GitHub 409/422 → conflict/already_exists로 정직 매핑(github_error로 흘리지 않음)
// ──────────────────────────────────────────────────────────────────────────────

async function handleFileChangeExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, fileChangePlanStore, verifyApproval } = deps;
  if (!readJsonBody || !request || !fileChangePlanStore) {
    respondJson(500, { outcome: "github_error", message: "W3b dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubFileChangeExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  const record = fileChangePlanStore.get(payload.planId);
  if (!record) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "plan을 찾을 수 없거나 만료됨" });
    return true;
  }
  // 멱등성 — 이미 PUT 성공한 plan은 같은 결과 그대로 반환.
  const observed = getFileChangeObservedFor(payload.planId);
  if (observed) {
    respondJson(200, {
      outcome: "observed",
      planId: payload.planId,
      commitSha: observed.commitSha,
      blobSha: observed.blobSha,
      htmlUrl: observed.htmlUrl,
      observedAt: observed.observedAt,
      truthStatus: "observed",
    });
    return true;
  }
  // 1차 sha 무결성 — client payload가 plan과 같은 콘텐츠/base를 의도하는지.
  if (payload.newContentSha256 !== record.plan.newContentSha256) {
    respondJson(200, {
      outcome: "blocked",
      planId: payload.planId,
      truthStatus: "planned",
      message: "newContentSha256 불일치 — plan과 다른 콘텐츠를 PUT하려고 합니다",
    });
    return true;
  }
  if (record.plan.operation === "update") {
    if (!payload.baseFileSha || payload.baseFileSha !== record.plan.baseFileSha) {
      respondJson(200, {
        outcome: "blocked",
        planId: payload.planId,
        truthStatus: "planned",
        message: `baseFileSha 불일치 — plan(${record.plan.baseFileSha ?? "n/a"})과 다른 base를 가정합니다`,
      });
      return true;
    }
  }
  // approval 검증 — armed 없음, approvalId가 반드시 verifyApproval를 통과.
  if (!payload.approvalId || !verifyApproval) {
    respondJson(200, { outcome: "approval_required", planId: payload.planId, truthStatus: "planned", message: "approval이 필요합니다" });
    return true;
  }
  const authorized = await verifyApproval(payload.approvalId);
  if (!authorized) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "approval이 승인되지 않았습니다" });
    return true;
  }
  // 게이트 재평가 — 시간 경과 후 환경 변경(allowlist/secret 정책 변경 등) 대응.
  const status = createClient().status();
  const gate = evaluateFileChangeGate({
    repoFullName: record.plan.repoFullName,
    branchName: record.plan.branchName,
    path: record.plan.path,
    newContent: record.newContent,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: gate.reason });
    return true;
  }
  const [owner, repo] = record.plan.repoFullName.split("/") as [string, string];
  // branch ref 재GET — plan 이후 브랜치가 삭제됐을 가능성을 차단.
  try {
    await createClient().getRefSha(owner, repo, record.plan.branchName);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      respondJson(200, {
        outcome: "blocked",
        planId: payload.planId,
        truthStatus: "planned",
        message: `target branch '${record.plan.branchName}'이(가) plan 이후 사라졌습니다 — 다시 만들고 plan부터 다시 하세요`,
      });
      return true;
    }
    const mapped = fileChangeOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
    return true;
  }
  // 3중 sha 무결성의 마지막 단계 — 실제 GitHub에서 file을 재GET해 plan 시점과 같은지 확인.
  if (record.plan.operation === "update") {
    let currentSha: string;
    try {
      const file = await createClient().getFileContent(owner, repo, record.plan.path, record.plan.branchName);
      currentSha = file.sha;
    } catch (error) {
      if (error instanceof GithubReadonlyError && error.status === 404) {
        respondJson(200, {
          outcome: "blocked",
          planId: record.plan.id,
          truthStatus: "planned",
          message: `update plan이지만 ${record.plan.path}이(가) plan 이후 사라졌습니다 — 다시 plan부터`,
        });
        return true;
      }
      const mapped = fileChangeOutcomeForError(error);
      respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
      return true;
    }
    if (currentSha !== record.plan.baseFileSha) {
      respondJson(200, {
        outcome: "blocked",
        planId: record.plan.id,
        truthStatus: "planned",
        message: `${record.plan.path}의 file sha가 plan 시점 이후 변경됐습니다(plan ${record.plan.baseFileSha} → 현재 ${currentSha}) — 다시 plan부터`,
      });
      return true;
    }
  } else {
    // create — 그 사이 같은 path에 파일이 생겼으면 overwrite 금지.
    try {
      await createClient().getFileContent(owner, repo, record.plan.path, record.plan.branchName);
      // GET 성공 = 이미 존재
      respondJson(200, {
        outcome: "already_exists",
        planId: record.plan.id,
        truthStatus: "planned",
        message: `create plan이지만 ${record.plan.path}이(가) plan 이후 생겼습니다 — overwrite 금지`,
      });
      return true;
    } catch (error) {
      if (error instanceof GithubReadonlyError && error.status === 404) {
        // good — 없음 → 만들 수 있음.
      } else {
        const mapped = fileChangeOutcomeForError(error);
        respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
        return true;
      }
    }
  }
  // 동시 execute 차단 — POST 직전 동기 점유.
  if (!fileChangePlanStore.tryClaim(record.plan.id)) {
    respondJson(200, { outcome: "blocked", planId: record.plan.id, truthStatus: "planned", message: "동일 plan이 이미 실행 중입니다" });
    return true;
  }
  // commit message는 서버가 결정 — 사용자 자유 입력은 받지 않음(예측 가능성/감사 용이성).
  const commitMessage = record.plan.operation === "create"
    ? `Apply planned file change (create): ${record.plan.path}`
    : `Apply planned file change (update): ${record.plan.path}`;
  try {
    const result = await createClient().putFileContents(owner, repo, record.plan.path, {
      branch: record.plan.branchName,
      content: record.newContent,
      message: commitMessage,
      sha: record.plan.operation === "update" ? record.plan.baseFileSha : undefined,
    });
    const observedAt = deps.now?.() ?? new Date().toISOString();
    fileChangePlanStore.markCreated(record.plan.id, {
      commitSha: result.commitSha,
      blobSha: result.blobSha,
      htmlUrl: result.htmlUrl,
      observedAt,
    });
    respondJson(200, {
      outcome: "observed",
      planId: record.plan.id,
      commitSha: result.commitSha,
      blobSha: result.blobSha,
      htmlUrl: result.htmlUrl,
      observedAt,
      truthStatus: "observed",
    });
  } catch (error) {
    fileChangePlanStore.release(record.plan.id);
    // 409(conflict) / 422(sha mismatch 등)는 정직하게 매핑 — github_error로 흘리지 않는다.
    if (error instanceof GithubReadonlyError) {
      if (error.status === 409) {
        respondJson(200, {
          outcome: "blocked",
          planId: record.plan.id,
          truthStatus: "planned",
          message: "GitHub: 충돌(409) — base sha 또는 branch 상태가 plan과 달라졌습니다",
        });
        return true;
      }
      if (error.status === 422) {
        respondJson(200, {
          outcome: "blocked",
          planId: record.plan.id,
          truthStatus: "planned",
          message: "GitHub: 처리 불가(422) — sha/path/branch 조합이 유효하지 않습니다",
        });
        return true;
      }
    }
    const mapped = fileChangeOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W4a PR create plan handler — GitHub POST /pulls는 절대 호출하지 않는다.
// 흐름:
//   1) zod parse → 정적 게이트(allowlist/base/head/title/body/secret) 통과
//   2) head ref read → 존재 확인
//   3) base ref read → 존재 확인
//   4) compare base...head GET → aheadBy/changedFiles 관측
//   5) no-op 체크: aheadBy=0 또는 changedFiles=0 이면 blocked
//   6) plan 저장, 응답
//
//   - GitHub POST/PUT/DELETE는 절대 없음(read만)
//   - filesPreview는 PR_COMPARE_FILES_PREVIEW_MAX로 잘라 truncated 표식
// ──────────────────────────────────────────────────────────────────────────────

function prCreateOutcomeForError(error: unknown): { outcome: GithubPullRequestCreateOutcome; message: string } {
  const mapped = outcomeForError(error);
  return { outcome: mapped.outcome as GithubPullRequestCreateOutcome, message: scrubServerToken(mapped.message) };
}

async function handlePrCreatePlan(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, prBaseAllowlist, prPlanStore } = deps;
  if (!readJsonBody || !request || !prPlanStore) {
    respondJson(500, { outcome: "github_error", message: "W4a dependencies not wired" });
    return true;
  }
  const status = createClient().status();
  if (!status.tokenPresent) {
    respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않아 write가 비활성화되어 있습니다" });
    return true;
  }
  let payload;
  try {
    payload = githubPullRequestCreatePlanRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 plan 요청" });
    return true;
  }
  const gate = evaluatePrCreateGate({
    repoFullName: payload.repoFullName,
    baseBranch: payload.baseBranch,
    headBranch: payload.headBranch,
    title: payload.title,
    body: payload.body,
    allowlist: writeRepoAllowlist ?? [],
    baseAllowlist: prBaseAllowlist ?? [],
    tokenPresent: true,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", message: gate.reason });
    return true;
  }
  const [owner, repo] = gate.repoFullName.split("/") as [string, string];
  // head ref 존재 확인 + sha 관측 — W4b가 plan 이후 변경(force-push 등)을 감지하도록 저장.
  let headSha: string;
  try {
    headSha = await createClient().getRefSha(owner, repo, gate.headBranch);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      respondJson(200, {
        outcome: "blocked",
        message: `head branch '${gate.headBranch}'이(가) ${gate.repoFullName}에 없습니다 — W2로 먼저 만들고 다시 시도하세요`,
      });
      return true;
    }
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, mapped);
    return true;
  }
  // base ref 존재 확인 + sha 관측 — 같은 이유.
  let baseSha: string;
  try {
    baseSha = await createClient().getRefSha(owner, repo, gate.baseBranch);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      respondJson(200, { outcome: "blocked", message: `base branch '${gate.baseBranch}'이(가) ${gate.repoFullName}에 없습니다` });
      return true;
    }
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, mapped);
    return true;
  }
  // compare base...head — aheadBy/changedFiles/commits/files 관측.
  let compareRaw;
  try {
    compareRaw = await createClient().compareBranches(owner, repo, gate.baseBranch, gate.headBranch);
  } catch (error) {
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, mapped);
    return true;
  }
  if (compareRaw.aheadBy <= 0 || compareRaw.changedFiles <= 0) {
    respondJson(200, {
      outcome: "blocked",
      message: `head가 base 대비 변경이 없습니다(aheadBy=${compareRaw.aheadBy}, changedFiles=${compareRaw.changedFiles}) — no-op PR 차단`,
    });
    return true;
  }
  const trimmedFiles: GithubPullRequestCompareFile[] = compareRaw.files
    .slice(0, PR_COMPARE_FILES_PREVIEW_MAX)
    .map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    }));
  const truncated = compareRaw.files.length > PR_COMPARE_FILES_PREVIEW_MAX;

  const nowIso = deps.now?.() ?? new Date().toISOString();
  const planId = `gprp_${randomUUID()}`;
  const expiresAt = new Date(Date.parse(nowIso) + 10 * 60 * 1000).toISOString();
  const plan: GithubPullRequestCreatePlan = {
    id: planId,
    repoFullName: gate.repoFullName,
    baseBranch: gate.baseBranch,
    headBranch: gate.headBranch,
    baseSha,
    headSha,
    title: gate.title,
    bodyPreview: gate.bodyPreview,
    titleSha256: gate.titleSha256,
    bodySha256: gate.bodySha256,
    bodyLength: gate.bodyLength,
    compare: {
      aheadBy: compareRaw.aheadBy,
      behindBy: compareRaw.behindBy,
      changedFiles: compareRaw.changedFiles,
      commits: compareRaw.totalCommits,
      filesPreview: trimmedFiles,
      truncated,
    },
    status: "approval_required",
    truthStatus: "planned",
    createdAt: nowIso,
    expiresAt,
  };
  prPlanStore.put({ plan, title: gate.title, body: payload.body });
  respondJson(200, { outcome: "planned", plan });
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W4b PR create execute handler — GitHub POST /pulls를 호출하는 유일한 경로.
// 흐름:
//   1) zod parse → record 조회 → observedCache(멱등) 검사
//   2) 1차 무결성: client titleSha256/bodySha256 == plan
//   3) approval 검증
//   4) 게이트 재평가(allowlist/base/head/title/body/secret)
//   5) base/head ref 재GET → plan.baseSha/headSha와 비교(plan 이후 변경 차단)
//   6) compareBranches 재실행 → aheadBy>0 + changedFiles>0 유지 확인
//   7) tryClaim 동기 점유
//   8) createPullRequest 호출, 201만 observed
//   9) markCreated, 응답
//
//   - 422(이미 존재) → already_exists
//   - 403(권한) → permission_denied(W1/W2와 동일 매핑)
//   - same-repo only: head는 branch 이름 그대로 보냄(owner:branch fork 형태 미사용)
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// W5b: Multi-file atomic commit execute (Git Data API). 모든 가드는 runner가 재검증.
// 라우트 핸들러는 schema parse + client adapter만 만들고 runner에게 위임한다.
//
// 보호 정책(설계 컨트랙트):
//   - sequential Contents API PUT 절대 금지(runner가 강제).
//   - atomic blob → tree → commit → ref(force=false) 만 사용.
//   - 응답에 raw newContent 포함 X. trace/log에도 포함 X.
//   - merge/review/label/assignee/branch delete 절대 X.
// ──────────────────────────────────────────────────────────────────────────────

async function handleMultiFileCommitExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, verifyApproval, now, protectedBranches } = deps;
  if (!readJsonBody || !request) {
    respondJson(500, { outcome: "github_error", message: "W5b dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubMultiFileCommitExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", truthStatus: "planned", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  if (!verifyApproval) {
    respondJson(500, { outcome: "github_error", message: "approval 검증기가 주입되지 않았습니다" });
    return true;
  }
  // GithubReadonlyClient의 W5b 메서드 5개를 GithubGitDataClient interface로 어댑팅.
  const client = createClient();
  if (!client.getCommitTreeSha || !client.createBlob || !client.createTree || !client.createCommit || !client.updateRefSha) {
    respondJson(200, {
      outcome: "not_configured",
      truthStatus: "planned",
      message: "GitHub Git Data API 미지원(GITHUB_TOKEN 또는 client 구현 누락)",
    });
    return true;
  }
  const gitDataClient: GithubGitDataClient = {
    getRefSha: (o, r, b) => client.getRefSha(o, r, b),
    getCommitTreeSha: client.getCommitTreeSha.bind(client),
    createBlob: client.createBlob.bind(client),
    createTree: client.createTree.bind(client),
    createCommit: client.createCommit.bind(client),
    updateRefSha: client.updateRefSha.bind(client),
  };
  const response = await runMultiFileCommitExecute(payload, {
    client: gitDataClient,
    verifyApproval,
    writeRepoAllowlist: writeRepoAllowlist ?? [],
    protectedBranches: protectedBranches ?? ["main", "master"],
    now: now ?? (() => new Date().toISOString()),
  });
  respondJson(200, response);
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W5c — PR title/body update plan / execute.
//
// 좁은 범위:
//   - title/body만 PATCH한다.
//   - same-repo, open PR only(closed/merged면 plan에서 blocked).
//   - approval ONLY(armed 없음 — PR 본문은 외부 노출).
//   - 1차 무결성: client payload sha == plan-store(같은 base 의도 확인).
//   - 2차 무결성: execute 직전 PR re-read → current title/body sha가 plan 시점과 일치(TOCTOU).
//   - no-op(새 title==현재 + 새 body==현재) 차단.
//   - raw body 전체는 응답/트레이스에 흘리지 않는다 — sha/length/excerpt만.
// ──────────────────────────────────────────────────────────────────────────────

async function handlePrUpdatePlan(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, prUpdatePlanStore, now } = deps;
  if (!readJsonBody || !request || !prUpdatePlanStore) {
    respondJson(500, { outcome: "github_error", message: "W5c dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubPullRequestUpdatePlanRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 plan 요청" });
    return true;
  }
  const client = createClient();
  const status = client.status();
  if (!status.tokenPresent) {
    respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않았습니다 — write가 비활성화되어 있습니다" });
    return true;
  }
  const gate = evaluatePrUpdateGate({
    repoFullName: payload.repoFullName,
    pullNumber: payload.pullNumber,
    newTitle: payload.newTitle,
    newBody: payload.newBody,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", message: gate.message });
    return true;
  }
  const [owner, repo] = payload.repoFullName.split("/") as [string, string];
  let pr;
  try {
    pr = await client.getPullRequest(owner, repo, payload.pullNumber);
  } catch (error) {
    if (error instanceof GithubNotConfiguredError) {
      respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않았습니다" });
      return true;
    }
    if (error instanceof GithubReadonlyError) {
      if (error.status === 404) {
        respondJson(200, { outcome: "blocked", message: `PR #${payload.pullNumber}을(를) 찾을 수 없습니다` });
        return true;
      }
      if (error.status === 401 || error.status === 403) {
        respondJson(200, { outcome: "permission_denied", message: error.message });
        return true;
      }
      respondJson(200, { outcome: "github_error", message: error.message });
      return true;
    }
    respondJson(200, { outcome: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    return true;
  }
  if (pr.state !== "open" || pr.merged) {
    respondJson(200, {
      outcome: "blocked",
      message: `PR #${payload.pullNumber}은(는) ${pr.merged ? "merged" : pr.state} 상태입니다 — open PR만 update 가능`,
    });
    return true;
  }
  const currentTitle = pr.title;
  const currentBody = pr.body ?? "";
  const currentTitleSha256 = prUpdateSha256Hex(currentTitle);
  const currentBodySha256 = prUpdateSha256Hex(currentBody);
  const currentBodyLength = Buffer.byteLength(currentBody, "utf8");
  const titleChanged = gate.newTitle !== undefined && gate.newTitle !== currentTitle;
  const bodyChanged = gate.newBody !== undefined && gate.newBody !== currentBody;
  if (!titleChanged && !bodyChanged) {
    respondJson(200, {
      outcome: "no_op",
      message: "title/body가 현재 값과 동일합니다 — 변경할 게 없습니다",
    });
    return true;
  }
  const observedAt = now?.() ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(observedAt) + PR_UPDATE_PLAN_TTL_MS).toISOString();
  const planId = `pr-update-${randomUUID()}`;
  const plan = {
    id: planId,
    repoFullName: payload.repoFullName,
    pullNumber: payload.pullNumber,
    currentTitle,
    currentTitleSha256,
    currentBodySha256,
    currentBodyLength,
    newTitle: titleChanged ? gate.newTitle : undefined,
    newTitleSha256: titleChanged ? gate.newTitleSha256 : undefined,
    newBodyExcerpt: bodyChanged ? gate.newBodyExcerpt : undefined,
    newBodySha256: bodyChanged ? gate.newBodySha256 : undefined,
    newBodyLength: bodyChanged ? gate.newBodyLength : undefined,
    changeSummary: {
      titleChanged,
      bodyChanged,
      bodyDelta: bodyChanged && gate.newBodyLength !== undefined ? gate.newBodyLength - currentBodyLength : 0,
    },
    status: "approval_required" as const,
    truthStatus: "planned" as const,
    createdAt: observedAt,
    expiresAt,
  };
  prUpdatePlanStore.put({
    plan,
    newTitle: titleChanged ? gate.newTitle : undefined,
    newBody: bodyChanged ? gate.newBody : undefined,
  });
  respondJson(200, { outcome: "planned", plan });
  return true;
}

async function handlePrUpdateExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, prUpdatePlanStore, verifyApproval, now } = deps;
  if (!readJsonBody || !request || !prUpdatePlanStore) {
    respondJson(500, { outcome: "github_error", message: "W5c dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubPullRequestUpdateExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  const record = prUpdatePlanStore.get(payload.planId);
  if (!record) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "plan을 찾을 수 없거나 만료됨" });
    return true;
  }
  // 멱등성 — 이미 PATCH된 plan이면 같은 결과 반환.
  const observed = getPullRequestUpdateObservedFor(payload.planId);
  if (observed) {
    respondJson(200, {
      outcome: "observed",
      planId: payload.planId,
      pullNumber: observed.pullNumber,
      htmlUrl: observed.htmlUrl,
      title: observed.title,
      bodyLength: observed.bodyLength,
      bodySha256: observed.bodySha256,
      updatedAt: observed.updatedAt,
      observedAt: observed.observedAt,
      truthStatus: "observed",
    });
    return true;
  }
  // 1차 무결성 — plan과 동일 base + 동일 새 값 의도 확인.
  if (payload.expectedCurrentTitleSha256 !== record.plan.currentTitleSha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      reason: "toctou_title_mismatch",
      message: "expectedCurrentTitleSha256가 plan 기록과 다릅니다 — plan과 다른 base를 의도",
    });
    return true;
  }
  if (payload.expectedCurrentBodySha256 !== record.plan.currentBodySha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      reason: "toctou_body_mismatch",
      message: "expectedCurrentBodySha256가 plan 기록과 다릅니다 — plan과 다른 base를 의도",
    });
    return true;
  }
  if (record.plan.newTitleSha256 && payload.newTitleSha256 !== record.plan.newTitleSha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: "newTitleSha256가 plan과 다릅니다 — plan과 다른 새 title을 의도",
    });
    return true;
  }
  if (record.plan.newBodySha256 && payload.newBodySha256 !== record.plan.newBodySha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: "newBodySha256가 plan과 다릅니다 — plan과 다른 새 body를 의도",
    });
    return true;
  }
  // approval — armed 없음.
  if (!payload.approvalId || !verifyApproval) {
    respondJson(200, { outcome: "approval_required", planId: payload.planId, truthStatus: "planned", message: "approval이 필요합니다" });
    return true;
  }
  const authorized = await verifyApproval(payload.approvalId);
  if (!authorized) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "approval이 승인되지 않았습니다" });
    return true;
  }
  // 게이트 재평가 — env(allowlist) 변경 대응.
  const client = createClient();
  const status = client.status();
  const reGate = evaluatePrUpdateGate({
    repoFullName: record.plan.repoFullName,
    pullNumber: record.plan.pullNumber,
    newTitle: record.newTitle,
    newBody: record.newBody,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (reGate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: reGate.reason === "allowlist" ? "allowlist" : "secret_suspect", message: reGate.message });
    return true;
  }
  // 2차 무결성 — execute 시점 GitHub에서 PR re-read. title/body sha가 plan 시점과 일치해야 함.
  const [owner, repo] = record.plan.repoFullName.split("/") as [string, string];
  let pr;
  try {
    pr = await client.getPullRequest(owner, repo, record.plan.pullNumber);
  } catch (error) {
    if (error instanceof GithubReadonlyError) {
      if (error.status === 404) {
        respondJson(200, {
          outcome: "blocked", planId: payload.planId, truthStatus: "planned",
          reason: "pr_not_found",
          message: `PR #${record.plan.pullNumber}이(가) plan 이후 사라졌습니다`,
        });
        return true;
      }
      if (error.status === 401 || error.status === 403) {
        respondJson(200, { outcome: "permission_denied", planId: payload.planId, truthStatus: "planned", reason: "permission_denied", message: error.message });
        return true;
      }
      respondJson(200, { outcome: "github_error", planId: payload.planId, truthStatus: "planned", reason: "github_error", message: error.message });
      return true;
    }
    respondJson(200, { outcome: "connection_failed", planId: payload.planId, truthStatus: "planned", reason: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    return true;
  }
  if (pr.state !== "open" || pr.merged) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      reason: "pr_closed",
      message: `PR #${record.plan.pullNumber}이(가) plan 이후 ${pr.merged ? "merged" : pr.state} 상태로 바뀌었습니다`,
    });
    return true;
  }
  const freshCurrentTitleSha = prUpdateSha256Hex(pr.title);
  const freshCurrentBodySha = prUpdateSha256Hex(pr.body ?? "");
  if (freshCurrentTitleSha !== record.plan.currentTitleSha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      reason: "toctou_title_mismatch",
      message: "PR title이 plan 시점 이후 누군가 다른 값으로 바꿨습니다 — 다시 plan부터",
    });
    return true;
  }
  if (freshCurrentBodySha !== record.plan.currentBodySha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      reason: "toctou_body_mismatch",
      message: "PR body가 plan 시점 이후 누군가 다른 값으로 바꿨습니다 — 다시 plan부터",
    });
    return true;
  }
  // 동시 execute 차단 — PATCH 직전 동기 점유.
  if (!prUpdatePlanStore.tryClaim(record.plan.id)) {
    respondJson(200, { outcome: "blocked", planId: record.plan.id, truthStatus: "planned", message: "동일 plan이 이미 실행 중입니다" });
    return true;
  }
  if (!client.updatePullRequest) {
    prUpdatePlanStore.release(record.plan.id);
    respondJson(200, { outcome: "not_configured", planId: payload.planId, truthStatus: "planned", message: "GitHub client에 updatePullRequest 미구현(GITHUB_TOKEN 또는 client 누락)" });
    return true;
  }
  try {
    const result = await client.updatePullRequest(owner, repo, record.plan.pullNumber, {
      title: record.newTitle,
      body: record.newBody,
    });
    const observedAt = now?.() ?? new Date().toISOString();
    const bodySha = prUpdateSha256Hex(result.body);
    const bodyLength = Buffer.byteLength(result.body, "utf8");
    prUpdatePlanStore.markUpdated(record.plan.id, {
      pullNumber: result.pullNumber,
      htmlUrl: result.htmlUrl,
      title: result.title,
      bodyLength,
      bodySha256: bodySha,
      updatedAt: result.updatedAt,
      observedAt,
    });
    respondJson(200, {
      outcome: "observed",
      planId: record.plan.id,
      pullNumber: result.pullNumber,
      htmlUrl: result.htmlUrl,
      title: result.title,
      bodyLength,
      bodySha256: bodySha,
      updatedAt: result.updatedAt,
      observedAt,
      truthStatus: "observed",
    });
  } catch (error) {
    prUpdatePlanStore.release(record.plan.id);
    if (error instanceof GithubReadonlyError) {
      if (error.status === 404) {
        respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: "pr_not_found", message: error.message });
      } else if (error.status === 401 || error.status === 403) {
        respondJson(200, { outcome: "permission_denied", planId: payload.planId, truthStatus: "planned", reason: "permission_denied", message: error.message });
      } else {
        respondJson(200, { outcome: "github_error", planId: payload.planId, truthStatus: "planned", reason: "github_error", message: error.message });
      }
    } else {
      respondJson(200, { outcome: "connection_failed", planId: payload.planId, truthStatus: "planned", reason: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// W5d Phase 1 — PR labels add/remove plan / execute.
//
// 좁은 범위:
//   - labels add/remove만(assignees는 Phase 2).
//   - same-repo, open PR only(closed/merged면 plan에서 차단).
//   - approval ONLY(armed 없음).
//   - 1차 무결성: client expectedCurrentLabelsHash == plan-store.
//   - 2차 무결성: execute 직전 GitHub에서 labels 재조회 → plan 시점 hash와 일치.
//   - GitHub PUT /issues/:n/labels로 final desired set을 한 번에 적용(atomic).
//   - no-op(actuallyAdded.length==0 && actuallyRemoved.length==0) 차단.
// ──────────────────────────────────────────────────────────────────────────────

async function handlePrLabelsUpdatePlan(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, prLabelsUpdatePlanStore, now } = deps;
  if (!readJsonBody || !request || !prLabelsUpdatePlanStore) {
    respondJson(500, { outcome: "github_error", message: "W5d dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubPullRequestLabelsUpdatePlanRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 plan 요청" });
    return true;
  }
  const client = createClient();
  const status = client.status();
  if (!status.tokenPresent) {
    respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않았습니다 — write가 비활성화되어 있습니다" });
    return true;
  }
  const gate = evaluatePrLabelsUpdateGate({
    repoFullName: payload.repoFullName,
    pullNumber: payload.pullNumber,
    addLabels: payload.addLabels,
    removeLabels: payload.removeLabels,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", message: gate.message });
    return true;
  }
  const [owner, repo] = payload.repoFullName.split("/") as [string, string];
  // PR이 open인지 먼저 확인.
  let pr;
  try {
    pr = await client.getPullRequest(owner, repo, payload.pullNumber);
  } catch (error) {
    if (error instanceof GithubNotConfiguredError) {
      respondJson(200, { outcome: "not_configured", message: "GITHUB_TOKEN이 설정되지 않았습니다" });
      return true;
    }
    if (error instanceof GithubReadonlyError) {
      if (error.status === 404) {
        respondJson(200, { outcome: "blocked", message: `PR #${payload.pullNumber}을(를) 찾을 수 없습니다` });
        return true;
      }
      if (error.status === 401 || error.status === 403) {
        respondJson(200, { outcome: "permission_denied", message: error.message });
        return true;
      }
      respondJson(200, { outcome: "github_error", message: error.message });
      return true;
    }
    respondJson(200, { outcome: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    return true;
  }
  if (pr.state !== "open" || pr.merged) {
    respondJson(200, {
      outcome: "blocked",
      message: `PR #${payload.pullNumber}은(는) ${pr.merged ? "merged" : pr.state} 상태입니다 — open PR만 labels update 가능`,
    });
    return true;
  }
  if (!client.listIssueLabels) {
    respondJson(200, { outcome: "not_configured", message: "GitHub client에 listIssueLabels 미구현" });
    return true;
  }
  let currentLabels: string[];
  try {
    currentLabels = await client.listIssueLabels(owner, repo, payload.pullNumber);
  } catch (error) {
    if (error instanceof GithubReadonlyError) {
      respondJson(200, { outcome: "github_error", message: error.message });
      return true;
    }
    respondJson(200, { outcome: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    return true;
  }
  const diff = computeLabelDiff(currentLabels, gate.addLabels, gate.removeLabels);
  if (diff.actuallyAdded.length === 0 && diff.actuallyRemoved.length === 0) {
    respondJson(200, {
      outcome: "no_op",
      message: "이미 원하는 상태입니다 — add/remove 모두 noop입니다",
    });
    return true;
  }
  const observedAt = now?.() ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(observedAt) + PR_UPDATE_PLAN_TTL_MS).toISOString();
  const planId = `pr-labels-${randomUUID()}`;
  const currentSorted = [...currentLabels].sort();
  const plan = {
    id: planId,
    repoFullName: payload.repoFullName,
    pullNumber: payload.pullNumber,
    currentLabels: currentSorted,
    currentLabelsHash: hashLabelSet(currentSorted),
    finalLabels: diff.finalLabels,
    changeSummary: {
      actuallyAdded: diff.actuallyAdded,
      actuallyRemoved: diff.actuallyRemoved,
      noopAdd: diff.noopAdd,
      noopRemove: diff.noopRemove,
    },
    status: "approval_required" as const,
    truthStatus: "planned" as const,
    createdAt: observedAt,
    expiresAt,
  };
  prLabelsUpdatePlanStore.put({
    plan,
    addLabels: gate.addLabels,
    removeLabels: gate.removeLabels,
  });
  respondJson(200, { outcome: "planned", plan });
  return true;
}

async function handlePrLabelsUpdateExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, prLabelsUpdatePlanStore, verifyApproval, now } = deps;
  if (!readJsonBody || !request || !prLabelsUpdatePlanStore) {
    respondJson(500, { outcome: "github_error", message: "W5d dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubPullRequestLabelsUpdateExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  const record = prLabelsUpdatePlanStore.get(payload.planId);
  if (!record) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "plan을 찾을 수 없거나 만료됨" });
    return true;
  }
  // 멱등성 — 이미 적용된 plan이면 같은 결과.
  const observed = getPullRequestLabelsObservedFor(payload.planId);
  if (observed) {
    respondJson(200, {
      outcome: "observed",
      planId: payload.planId,
      pullNumber: observed.pullNumber,
      htmlUrl: observed.htmlUrl,
      appliedLabels: [...observed.appliedLabels],
      observedAt: observed.observedAt,
      truthStatus: "observed",
    });
    return true;
  }
  // 1차 무결성: 같은 base 의도인지(client expectedCurrentLabelsHash가 plan 저장 hash와 동일).
  if (payload.expectedCurrentLabelsHash !== record.plan.currentLabelsHash) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      reason: "toctou_labels_mismatch",
      message: "expectedCurrentLabelsHash가 plan 기록과 다릅니다 — plan과 다른 base 의도",
    });
    return true;
  }
  if (!payload.approvalId || !verifyApproval) {
    respondJson(200, { outcome: "approval_required", planId: payload.planId, truthStatus: "planned", message: "approval이 필요합니다" });
    return true;
  }
  const authorized = await verifyApproval(payload.approvalId);
  if (!authorized) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "approval이 승인되지 않았습니다" });
    return true;
  }
  const client = createClient();
  const status = client.status();
  // 게이트 재평가(allowlist 변경 대응).
  const reGate = evaluatePrLabelsUpdateGate({
    repoFullName: record.plan.repoFullName,
    pullNumber: record.plan.pullNumber,
    addLabels: record.addLabels,
    removeLabels: record.removeLabels,
    allowlist: writeRepoAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (reGate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: reGate.reason === "allowlist" ? "allowlist" : "secret_suspect", message: reGate.message });
    return true;
  }
  // 2차 TOCTOU — execute 시점 GitHub에서 labels 재조회.
  const [owner, repo] = record.plan.repoFullName.split("/") as [string, string];
  let pr;
  try {
    pr = await client.getPullRequest(owner, repo, record.plan.pullNumber);
  } catch (error) {
    if (error instanceof GithubReadonlyError) {
      if (error.status === 404) {
        respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: "pr_not_found", message: `PR #${record.plan.pullNumber}이(가) plan 이후 사라졌습니다` });
        return true;
      }
      if (error.status === 401 || error.status === 403) {
        respondJson(200, { outcome: "permission_denied", planId: payload.planId, truthStatus: "planned", reason: "permission_denied", message: error.message });
        return true;
      }
      respondJson(200, { outcome: "github_error", planId: payload.planId, truthStatus: "planned", reason: "github_error", message: error.message });
      return true;
    }
    respondJson(200, { outcome: "connection_failed", planId: payload.planId, truthStatus: "planned", reason: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    return true;
  }
  if (pr.state !== "open" || pr.merged) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: "pr_closed",
      message: `PR #${record.plan.pullNumber}이(가) plan 이후 ${pr.merged ? "merged" : pr.state} 상태로 바뀌었습니다`,
    });
    return true;
  }
  if (!client.listIssueLabels || !client.replaceIssueLabels) {
    respondJson(200, { outcome: "not_configured", planId: payload.planId, truthStatus: "planned", message: "GitHub client에 listIssueLabels/replaceIssueLabels 미구현" });
    return true;
  }
  let freshCurrent: string[];
  try {
    freshCurrent = await client.listIssueLabels(owner, repo, record.plan.pullNumber);
  } catch (error) {
    respondJson(200, { outcome: "github_error", planId: payload.planId, truthStatus: "planned", reason: "github_error", message: error instanceof Error ? error.message : "unknown" });
    return true;
  }
  const freshHash = hashLabelSet(freshCurrent);
  if (freshHash !== record.plan.currentLabelsHash) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: "toctou_labels_mismatch",
      message: "labels가 plan 시점 이후 누군가 다른 값으로 바꿨습니다 — 다시 plan부터",
    });
    return true;
  }
  if (!prLabelsUpdatePlanStore.tryClaim(record.plan.id)) {
    respondJson(200, { outcome: "blocked", planId: record.plan.id, truthStatus: "planned", message: "동일 plan이 이미 실행 중입니다" });
    return true;
  }
  try {
    const result = await client.replaceIssueLabels(owner, repo, record.plan.pullNumber, record.plan.finalLabels);
    const observedAt = now?.() ?? new Date().toISOString();
    const htmlUrl = pr.htmlUrl ?? `https://github.com/${owner}/${repo}/pull/${record.plan.pullNumber}`;
    const appliedSorted = [...result.labels].sort();
    prLabelsUpdatePlanStore.markUpdated(record.plan.id, {
      pullNumber: record.plan.pullNumber,
      htmlUrl,
      appliedLabels: appliedSorted,
      observedAt,
    });
    respondJson(200, {
      outcome: "observed",
      planId: record.plan.id,
      pullNumber: record.plan.pullNumber,
      htmlUrl,
      appliedLabels: appliedSorted,
      observedAt,
      truthStatus: "observed",
    });
  } catch (error) {
    prLabelsUpdatePlanStore.release(record.plan.id);
    if (error instanceof GithubReadonlyError) {
      if (error.status === 404) {
        respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", reason: "pr_not_found", message: error.message });
      } else if (error.status === 401 || error.status === 403) {
        respondJson(200, { outcome: "permission_denied", planId: payload.planId, truthStatus: "planned", reason: "permission_denied", message: error.message });
      } else {
        respondJson(200, { outcome: "github_error", planId: payload.planId, truthStatus: "planned", reason: "github_error", message: error.message });
      }
    } else {
      respondJson(200, { outcome: "connection_failed", planId: payload.planId, truthStatus: "planned", reason: "connection_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return true;
}

async function handlePrCreateExecute(deps: GithubRouteDependencies): Promise<boolean> {
  const { respondJson, createClient, readJsonBody, request, writeRepoAllowlist, prBaseAllowlist, prPlanStore, verifyApproval } = deps;
  if (!readJsonBody || !request || !prPlanStore) {
    respondJson(500, { outcome: "github_error", message: "W4b dependencies not wired" });
    return true;
  }
  let payload;
  try {
    payload = githubPullRequestCreateExecuteRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    respondJson(400, { outcome: "blocked", message: error instanceof Error ? error.message : "잘못된 execute 요청" });
    return true;
  }
  const record = prPlanStore.get(payload.planId);
  if (!record) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "plan을 찾을 수 없거나 만료됨" });
    return true;
  }
  // 멱등성 — 이미 PR이 생성된 plan이면 같은 결과 반환.
  const observed = getPullRequestObservedFor(payload.planId);
  if (observed) {
    respondJson(200, {
      outcome: "observed",
      planId: payload.planId,
      pullNumber: observed.pullNumber,
      htmlUrl: observed.htmlUrl,
      headSha: observed.headSha,
      observedAt: observed.observedAt,
      truthStatus: "observed",
    });
    return true;
  }
  // 1차 무결성: title/body sha가 plan과 일치해야 함.
  if (payload.titleSha256 !== record.plan.titleSha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: "titleSha256 불일치 — plan과 다른 title을 PR로 만들려고 합니다",
    });
    return true;
  }
  if (payload.bodySha256 !== record.plan.bodySha256) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: "bodySha256 불일치 — plan과 다른 body를 PR로 만들려고 합니다",
    });
    return true;
  }
  // approval — armed 없음.
  if (!payload.approvalId || !verifyApproval) {
    respondJson(200, { outcome: "approval_required", planId: payload.planId, truthStatus: "planned", message: "approval이 필요합니다" });
    return true;
  }
  const authorized = await verifyApproval(payload.approvalId);
  if (!authorized) {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: "approval이 승인되지 않았습니다" });
    return true;
  }
  // 게이트 재평가 — 시간 경과 후 env(allowlist) 변경 대응.
  const status = createClient().status();
  const gate = evaluatePrCreateGate({
    repoFullName: record.plan.repoFullName,
    baseBranch: record.plan.baseBranch,
    headBranch: record.plan.headBranch,
    title: record.title,
    body: record.body,
    allowlist: writeRepoAllowlist ?? [],
    baseAllowlist: prBaseAllowlist ?? [],
    tokenPresent: status.tokenPresent,
  });
  if (gate.kind === "blocked") {
    respondJson(200, { outcome: "blocked", planId: payload.planId, truthStatus: "planned", message: gate.reason });
    return true;
  }
  const [owner, repo] = record.plan.repoFullName.split("/") as [string, string];
  // 2차 무결성 — head ref 재GET, plan.headSha와 일치해야 함(force-push 감지).
  let freshHeadSha: string;
  try {
    freshHeadSha = await createClient().getRefSha(owner, repo, record.plan.headBranch);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      respondJson(200, {
        outcome: "blocked", planId: payload.planId, truthStatus: "planned",
        message: `head branch '${record.plan.headBranch}'이(가) plan 이후 사라졌습니다`,
      });
      return true;
    }
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
    return true;
  }
  if (freshHeadSha !== record.plan.headSha) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: `head branch '${record.plan.headBranch}'의 sha가 plan 시점 이후 변경됐습니다(plan ${record.plan.headSha} → 현재 ${freshHeadSha})`,
    });
    return true;
  }
  // base ref 재GET, plan.baseSha와 일치해야 함.
  let freshBaseSha: string;
  try {
    freshBaseSha = await createClient().getRefSha(owner, repo, record.plan.baseBranch);
  } catch (error) {
    if (error instanceof GithubReadonlyError && error.status === 404) {
      respondJson(200, {
        outcome: "blocked", planId: payload.planId, truthStatus: "planned",
        message: `base branch '${record.plan.baseBranch}'이(가) plan 이후 사라졌습니다`,
      });
      return true;
    }
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
    return true;
  }
  if (freshBaseSha !== record.plan.baseSha) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: `base branch '${record.plan.baseBranch}'의 sha가 plan 시점 이후 변경됐습니다(plan ${record.plan.baseSha} → 현재 ${freshBaseSha})`,
    });
    return true;
  }
  // 3차 무결성 — compare 재실행. aheadBy>0 + changedFiles>0 유지 확인.
  let freshCompare;
  try {
    freshCompare = await createClient().compareBranches(owner, repo, record.plan.baseBranch, record.plan.headBranch);
  } catch (error) {
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
    return true;
  }
  if (freshCompare.aheadBy <= 0 || freshCompare.changedFiles <= 0) {
    respondJson(200, {
      outcome: "blocked", planId: payload.planId, truthStatus: "planned",
      message: `execute 시점 compare가 no-op이 됐습니다(aheadBy=${freshCompare.aheadBy}, changedFiles=${freshCompare.changedFiles}) — 다시 plan부터`,
    });
    return true;
  }
  // 동시 execute 차단 — POST 직전 동기 점유.
  if (!prPlanStore.tryClaim(record.plan.id)) {
    respondJson(200, { outcome: "blocked", planId: record.plan.id, truthStatus: "planned", message: "동일 plan이 이미 실행 중입니다" });
    return true;
  }
  try {
    const result = await createClient().createPullRequest(owner, repo, {
      title: record.title,
      body: record.body,
      base: record.plan.baseBranch,
      head: record.plan.headBranch, // same-repo: owner:branch 형태 아님.
    });
    const observedAt = deps.now?.() ?? new Date().toISOString();
    prPlanStore.markCreated(record.plan.id, {
      pullNumber: result.pullNumber,
      htmlUrl: result.htmlUrl,
      headSha: result.headSha,
      observedAt,
    });
    respondJson(200, {
      outcome: "observed",
      planId: record.plan.id,
      pullNumber: result.pullNumber,
      htmlUrl: result.htmlUrl,
      headSha: result.headSha,
      observedAt,
      truthStatus: "observed",
    });
  } catch (error) {
    prPlanStore.release(record.plan.id);
    if (error instanceof GithubReadonlyError) {
      // 422: 보통 "A pull request already exists for ..." 같은 케이스.
      if (error.status === 422) {
        respondJson(200, {
          outcome: "already_exists",
          planId: record.plan.id,
          truthStatus: "planned",
          message: "GitHub: 이미 같은 head로 열린 PR이 있거나 처리 불가(422)",
        });
        return true;
      }
      // 403: outcomeForError가 permission_denied로 매핑 — 그대로 사용.
    }
    const mapped = prCreateOutcomeForError(error);
    respondJson(200, { ...mapped, planId: record.plan.id, truthStatus: "planned" });
  }
  return true;
}

export async function handleGithubRoute({
  pathname,
  method,
  createClient,
  respondJson,
  now = () => new Date().toISOString(),
  request,
  readJsonBody,
  planStore,
  branchPlanStore,
  fileChangePlanStore,
  prPlanStore,
  prUpdatePlanStore,
  prLabelsUpdatePlanStore,
  writeRepoAllowlist,
  prBaseAllowlist,
  verifyApproval,
  protectedBranches,
}: GithubRouteDependencies): Promise<boolean> {
  if (!pathname.startsWith("/integrations/github/")) return false;
  const pathPrefixOnly = pathname.split("?")[0] ?? pathname;
  const commonDeps = { pathname, method, createClient, respondJson, now, request, readJsonBody, planStore, branchPlanStore, fileChangePlanStore, prPlanStore, prUpdatePlanStore, prLabelsUpdatePlanStore, writeRepoAllowlist, prBaseAllowlist, verifyApproval, protectedBranches };
  // W1 comment write — 메서드 인지(POST). 다른 readonly 경로는 그대로 GET만.
  if (pathPrefixOnly === COMMENT_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "comment plan은 POST만 허용됩니다" });
      return true;
    }
    return handleCommentWritePlan(commonDeps);
  }
  if (pathPrefixOnly === COMMENT_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "comment execute는 POST만 허용됩니다" });
      return true;
    }
    return handleCommentWriteExecute(commonDeps);
  }
  // W2 branch create — POST only.
  if (pathPrefixOnly === BRANCH_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "branch plan은 POST만 허용됩니다" });
      return true;
    }
    return handleBranchCreatePlan(commonDeps);
  }
  if (pathPrefixOnly === BRANCH_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "branch execute는 POST만 허용됩니다" });
      return true;
    }
    return handleBranchCreateExecute(commonDeps);
  }
  // W3a file change plan — POST only.
  if (pathPrefixOnly === FILE_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "file change plan은 POST만 허용됩니다" });
      return true;
    }
    return handleFileChangePlan(commonDeps);
  }
  // W3b file change execute — POST only. MCP execute tool은 추가하지 않음(서버 단독).
  if (pathPrefixOnly === FILE_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "file change execute는 POST만 허용됩니다" });
      return true;
    }
    return handleFileChangeExecute(commonDeps);
  }
  // W5b multi-file atomic commit execute — POST only.
  if (pathPrefixOnly === MULTIFILE_COMMIT_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "multi-file commit execute는 POST만 허용됩니다" });
      return true;
    }
    return handleMultiFileCommitExecute(commonDeps);
  }
  // W4a PR create plan — POST only.
  if (pathPrefixOnly === PR_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "PR create plan은 POST만 허용됩니다" });
      return true;
    }
    return handlePrCreatePlan(commonDeps);
  }
  // W4b PR create execute — POST only. MCP execute tool은 의도적으로 추가하지 않음.
  if (pathPrefixOnly === PR_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "PR create execute는 POST만 허용됩니다" });
      return true;
    }
    return handlePrCreateExecute(commonDeps);
  }
  // W5c PR title/body update plan — POST only.
  if (pathPrefixOnly === PR_UPDATE_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "PR update plan은 POST만 허용됩니다" });
      return true;
    }
    return handlePrUpdatePlan(commonDeps);
  }
  // W5c PR title/body update execute — POST only.
  if (pathPrefixOnly === PR_UPDATE_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "PR update execute는 POST만 허용됩니다" });
      return true;
    }
    return handlePrUpdateExecute(commonDeps);
  }
  // W5d Phase 1 — PR labels update plan — POST only.
  if (pathPrefixOnly === PR_LABELS_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "PR labels plan은 POST만 허용됩니다" });
      return true;
    }
    return handlePrLabelsUpdatePlan(commonDeps);
  }
  // W5d Phase 1 — PR labels update execute — POST only.
  if (pathPrefixOnly === PR_LABELS_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "PR labels execute는 POST만 허용됩니다" });
      return true;
    }
    return handlePrLabelsUpdateExecute(commonDeps);
  }
  if ((method ?? "GET") !== "GET") {
    // 그 외 read-only 경로는 비-GET 거절(기존 동작 유지).
    respondJson(405, { error: "method_not_allowed", message: "GitHub 커넥터는 읽기 전용입니다" });
    return true;
  }

  const pathOnly = pathname.split("?")[0] ?? pathname;

  if (pathOnly === "/integrations/github/status") {
    respondJson(200, { status: createClient().status() });
    return true;
  }

  const detailMatch = PR_DETAIL.exec(pathOnly);
  if (detailMatch) {
    const owner = decodeURIComponent(detailMatch[1]!);
    const repo = decodeURIComponent(detailMatch[2]!);
    const pullNumber = Number(detailMatch[3]!);
    const client = createClient();
    const status = client.status();
    const repoLabel = `${owner}/${repo}`;
    if (!status.configured) {
      respondJson(200, { status, repo: repoLabel, outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE });
      return true;
    }
    try {
      const pullRequest = await client.getPullRequest(owner, repo, pullNumber);
      respondJson(200, { status, repo: repoLabel, outcome: "observed", observedAt: now(), pullRequest });
    } catch (error) {
      const mapped = outcomeForError(error);
      respondJson(200, { status, repo: repoLabel, ...mapped });
    }
    return true;
  }

  const fileMatch = FILE_RESOURCE.exec(pathOnly);
  if (fileMatch) {
    const owner = decodeURIComponent(fileMatch[1]!);
    const repo = decodeURIComponent(fileMatch[2]!);
    const query = new URLSearchParams(pathname.includes("?") ? pathname.slice(pathname.indexOf("?") + 1) : "");
    const filePath = (query.get("path") ?? "").trim();
    const ref = query.get("ref")?.trim() || undefined;
    const client = createClient();
    const status = client.status();
    const repoLabel = `${owner}/${repo}`;
    if (!status.configured) {
      respondJson(200, { status, repo: repoLabel, outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE });
      return true;
    }
    if (!filePath) {
      respondJson(200, { status, repo: repoLabel, outcome: "github_error", message: "path 쿼리 파라미터가 필요합니다" });
      return true;
    }
    try {
      const file = await client.getFileContent(owner, repo, filePath, ref);
      respondJson(200, { status, repo: repoLabel, outcome: "observed", observedAt: now(), file });
    } catch (error) {
      const mapped = outcomeForError(error);
      respondJson(200, { status, repo: repoLabel, ...mapped });
    }
    return true;
  }

  const repoMatch = REPO_RESOURCE.exec(pathOnly);
  if (repoMatch) {
    const owner = decodeURIComponent(repoMatch[1]!);
    const repo = decodeURIComponent(repoMatch[2]!);
    const resource = repoMatch[3]!;
    const client = createClient();
    const status = client.status();
    const repoLabel = `${owner}/${repo}`;
    if (!status.configured) {
      respondJson(200, { status, repo: repoLabel, outcome: "not_configured", message: NOT_CONFIGURED_MESSAGE });
      return true;
    }
    try {
      const observedAt = now();
      if (resource === "overview") {
        respondJson(200, { status, repo: repoLabel, outcome: "observed", observedAt, overview: await client.getRepoOverview(owner, repo) });
      } else if (resource === "pulls") {
        respondJson(200, {
          status,
          repo: repoLabel,
          outcome: "observed",
          observedAt,
          pullRequests: await client.listPullRequests(owner, repo, { state: parseState(pathname) }),
        });
      } else {
        respondJson(200, {
          status,
          repo: repoLabel,
          outcome: "observed",
          observedAt,
          issues: await client.listIssues(owner, repo, { state: parseState(pathname) }),
        });
      }
    } catch (error) {
      const mapped = outcomeForError(error);
      respondJson(200, { status, repo: repoLabel, ...mapped });
    }
    return true;
  }

  respondJson(404, { error: "github_route_not_found", pathname: pathOnly });
  return true;
}
