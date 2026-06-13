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
  githubCommentWriteExecuteRequestSchema,
  githubCommentWritePlanRequestSchema,
  type GithubCommentWriteOutcome,
  type GithubCommentWritePlan,
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
  /** GITHUB_WRITE_REPO_ALLOWLIST 파싱 결과 — 없으면 write disabled. */
  writeRepoAllowlist?: ReadonlyArray<string>;
  /**
   * W1 approval-or-armed 검증. approval은 서버 측 store(approval 이벤트 소스)에서 verify되며,
   * armed는 클라이언트가 보낸 armedAt을 신뢰하되 plan TTL 내 + autoExecuteArmed===true일 때만
   * 통과시킨다(클라이언트만 표식). 둘 다 없거나 미일치면 blocked.
   */
  verifyApproval?: (approvalId: string) => Promise<boolean>;
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

/** comment write 결과 — readonly outcome enum과 호환(observed 외에 planned/approval_required/blocked 추가) */
function writeOutcomeForError(error: unknown): { outcome: GithubCommentWriteOutcome; message: string } {
  const mapped = outcomeForError(error);
  // GithubResourceOutcome → GithubCommentWriteOutcome 매핑(공통 항목 그대로).
  return { outcome: mapped.outcome as GithubCommentWriteOutcome, message: mapped.message };
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
    // armed는 클라이언트 표식이라 plan TTL 내에서만 신뢰한다(이후 시간 경과면 거절).
    const armedMs = Date.parse(payload.armedAt);
    const planExpiresMs = Date.parse(record.plan.expiresAt);
    if (Number.isFinite(armedMs) && armedMs <= planExpiresMs) {
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

export async function handleGithubRoute({
  pathname,
  method,
  createClient,
  respondJson,
  now = () => new Date().toISOString(),
  request,
  readJsonBody,
  planStore,
  writeRepoAllowlist,
  verifyApproval,
}: GithubRouteDependencies): Promise<boolean> {
  if (!pathname.startsWith("/integrations/github/")) return false;
  const pathPrefixOnly = pathname.split("?")[0] ?? pathname;
  // W1 comment write — 메서드 인지(POST). 다른 readonly 경로는 그대로 GET만.
  if (pathPrefixOnly === COMMENT_PLAN_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "comment plan은 POST만 허용됩니다" });
      return true;
    }
    return handleCommentWritePlan({ pathname, method, createClient, respondJson, now, request, readJsonBody, planStore, writeRepoAllowlist, verifyApproval });
  }
  if (pathPrefixOnly === COMMENT_EXECUTE_PATH) {
    if ((method ?? "GET") !== "POST") {
      respondJson(405, { error: "method_not_allowed", message: "comment execute는 POST만 허용됩니다" });
      return true;
    }
    return handleCommentWriteExecute({ pathname, method, createClient, respondJson, now, request, readJsonBody, planStore, writeRepoAllowlist, verifyApproval });
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
