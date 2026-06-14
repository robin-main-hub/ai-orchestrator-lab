import { useCallback, useMemo, useState } from "react";
import { ChevronRight, GitBranch, GitPullRequest, FileEdit, RefreshCw, ExternalLink } from "lucide-react";
import type {
  GithubBranchCreatePlan,
  GithubFileChangePlan,
  GithubPullRequestCreatePlan,
} from "@ai-orchestrator/protocol";
import {
  postGithubBranchExecute,
  postGithubBranchPlan,
  postGithubFileChangeExecute,
  postGithubFileChangePlan,
  postGithubPullRequestExecute,
  postGithubPullRequestPlan,
  sha256Hex,
} from "../../lib/githubConnector";

/**
 * GitHub Publish Panel — W1~W4 write 표면을 한 화면에서 안전하게 진행한다.
 *
 * 정직성(러시아 심판 기준):
 *   - planned/observed/blocked/failed 상태를 모두 honest하게 표시(숨기지 않음).
 *   - GitHub URL/sha/diff preview/commit sha는 observed로만 표시(가짜 observed 금지).
 *   - 토큰은 서버 env에만 — 브라우저로 오지 않는다.
 *   - 자동 단계 진행은 절대 없음(사용자 명시 클릭만).
 *   - approval 없이 execute 절대 없음 — 각 step의 approvalId 입력이 필요.
 *   - merge / review submit / labels / assignees / branch delete / file delete UI는 의도적으로
 *     존재하지 않는다(여기서 보이지 않으면 사용자가 실수로 누를 수 없음).
 *
 * 데이터 흐름:
 *   - plan 응답은 컴포넌트 state에 저장(서버 plan store에는 이미 있지만 read 엔드포인트가 없어
 *     클라이언트 캐시 — TTL 만료가 오면 다시 plan).
 *   - execute는 클라이언트가 plan 응답을 그대로 echo(서버가 sha들을 재검증).
 *   - 모든 단계마다 onContextEvent로 trace를 emit해서 부모(코딩 워크벤치)가 EventStorage에 기록.
 */

export type GithubPublishStepStatus =
  | "idle"
  | "planning"
  | "planned"
  | "approval_required"
  | "executing"
  | "observed"
  | "blocked"
  | "already_exists"
  | "failed";

type StepView<P, O> = {
  status: GithubPublishStepStatus;
  plan?: P;
  observed?: O;
  message?: string;
};

type BranchView = StepView<
  GithubBranchCreatePlan,
  { ref: string; sha: string; htmlUrl: string }
>;
type FileView = StepView<
  GithubFileChangePlan,
  { commitSha: string; blobSha: string; htmlUrl: string }
>;
type PrView = StepView<
  GithubPullRequestCreatePlan,
  { pullNumber: number; htmlUrl: string; headSha: string }
>;

type TraceEvent = {
  ts: string;
  step: "branch" | "file" | "pr";
  event:
    | "planned"
    | "blocked"
    | "approval_required"
    | "observed"
    | "already_exists"
    | "failed";
  /** 짧은 사람용 텍스트 — 토큰/헤더/긴 본문은 절대 들어오지 않게 호출부에서 가공한다. */
  summary: string;
};

export type GithubPublishPanelProps = {
  serverBaseUrl?: string | string[];
  defaultRepoFullName?: string;
  defaultSourceRef?: string;
  /** 부모(코딩 워크벤치)에서 trace를 EventStorage에 적재할 수 있게 emit한다. */
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
  /** 테스트에서 fetch를 주입하기 위한 hook. 기본은 window.fetch. */
  fetchImpl?: typeof fetch;
};

function statusTone(status: GithubPublishStepStatus): "muted" | "info" | "ok" | "warn" | "danger" {
  switch (status) {
    case "idle":
      return "muted";
    case "planning":
    case "executing":
    case "approval_required":
      return "info";
    case "planned":
      return "info";
    case "observed":
      return "ok";
    case "already_exists":
      return "warn";
    case "blocked":
    case "failed":
      return "danger";
  }
}

function statusLabel(status: GithubPublishStepStatus): string {
  switch (status) {
    case "idle":
      return "대기";
    case "planning":
      return "계획 중…";
    case "planned":
      return "계획됨";
    case "approval_required":
      return "승인 필요";
    case "executing":
      return "실행 중…";
    case "observed":
      return "관측됨";
    case "already_exists":
      return "이미 존재";
    case "blocked":
      return "차단";
    case "failed":
      return "실패";
  }
}

/** plan/execute 응답의 outcome을 통일된 단계 상태로 매핑. */
export function mapOutcomeToStatus(outcome: string): GithubPublishStepStatus {
  switch (outcome) {
    case "planned":
    case "approval_required":
      return outcome === "approval_required" ? "approval_required" : "planned";
    case "observed":
      return "observed";
    case "already_exists":
      return "already_exists";
    case "blocked":
    case "not_configured":
    case "permission_denied":
      return "blocked";
    case "connection_failed":
    case "github_error":
    default:
      return "failed";
  }
}

function isoNow(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

function StatusBadge({ status }: { status: GithubPublishStepStatus }) {
  const tone = statusTone(status);
  const className =
    tone === "ok"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : tone === "danger"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
        : tone === "warn"
          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
          : tone === "info"
            ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
            : "border-white/10 bg-white/5 text-zinc-300";
  return (
    <span
      data-testid="publish-step-status"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function GithubPublishPanel({
  serverBaseUrl,
  defaultRepoFullName = "",
  defaultSourceRef = "main",
  onContextEvent,
  fetchImpl,
}: GithubPublishPanelProps) {
  const fetcher = useMemo(() => fetchImpl ?? fetch, [fetchImpl]);
  const [repoFullName, setRepoFullName] = useState(defaultRepoFullName);
  // ── Step 1: Branch ────────────────────────────────────────────────────────
  const [sourceRef, setSourceRef] = useState(defaultSourceRef);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchApprovalId, setBranchApprovalId] = useState("");
  const [branch, setBranch] = useState<BranchView>({ status: "idle" });
  // ── Step 2: File change ───────────────────────────────────────────────────
  const [filePath, setFilePath] = useState("");
  const [fileNewContent, setFileNewContent] = useState("");
  const [fileApprovalId, setFileApprovalId] = useState("");
  const [file, setFile] = useState<FileView>({ status: "idle" });
  // ── Step 3: PR ────────────────────────────────────────────────────────────
  const [prBase, setPrBase] = useState("main");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prApprovalId, setPrApprovalId] = useState("");
  const [pr, setPr] = useState<PrView>({ status: "idle" });
  // ── Step 4: Trace ─────────────────────────────────────────────────────────
  const [trace, setTrace] = useState<TraceEvent[]>([]);

  const emit = useCallback(
    (event: TraceEvent) => {
      setTrace((prev) => [...prev, event]);
      onContextEvent?.(`github.publish.${event.step}.${event.event}`, {
        step: event.step,
        status: event.event,
        summary: event.summary,
        ts: event.ts,
      });
    },
    [onContextEvent],
  );

  const branchIsObserved = branch.status === "observed";

  // ── Branch plan/execute ───────────────────────────────────────────────────
  const onBranchPlan = useCallback(async () => {
    if (!repoFullName.trim() || !sourceRef.trim() || !newBranchName.trim()) {
      setBranch({ status: "blocked", message: "repo / source / 새 branch 이름이 모두 필요합니다" });
      return;
    }
    setBranch({ status: "planning" });
    try {
      const res = await postGithubBranchPlan(
        serverBaseUrl,
        { repoFullName: repoFullName.trim(), sourceRef: sourceRef.trim(), newBranchName: newBranchName.trim() },
        fetcher,
      );
      const status = mapOutcomeToStatus(res.outcome);
      if (res.plan) {
        setBranch({ status, plan: res.plan, message: res.message });
      } else {
        setBranch({ status, message: res.message });
      }
      emit({
        ts: isoNow(),
        step: "branch",
        event: status === "planned" || status === "approval_required" ? "planned" : status === "already_exists" ? "already_exists" : status === "blocked" ? "blocked" : "failed",
        summary: res.plan ? `${res.plan.repoFullName}#${res.plan.newBranchName} ← ${res.plan.sourceRef}@${res.plan.sourceSha.slice(0, 7)}` : (res.message ?? res.outcome),
      });
    } catch (error) {
      const message = error instanceof Error ? error.name : "unknown_error";
      setBranch({ status: "failed", message });
      emit({ ts: isoNow(), step: "branch", event: "failed", summary: message });
    }
  }, [emit, fetcher, newBranchName, repoFullName, serverBaseUrl, sourceRef]);

  const onBranchExecute = useCallback(async () => {
    if (!branch.plan) return;
    if (!branchApprovalId.trim()) {
      setBranch((prev) => ({ ...prev, message: "approval ID가 필요합니다(다른 화면에서 승인 후 ID를 붙여넣으세요)" }));
      return;
    }
    setBranch((prev) => ({ ...prev, status: "executing" }));
    try {
      const res = await postGithubBranchExecute(
        serverBaseUrl,
        { planId: branch.plan.id, sourceSha: branch.plan.sourceSha, approvalId: branchApprovalId.trim() },
        fetcher,
      );
      const status = mapOutcomeToStatus(res.outcome);
      if (res.outcome === "observed" && res.ref && res.sha) {
        setBranch((prev) => ({
          ...prev,
          status,
          observed: { ref: res.ref!, sha: res.sha!, htmlUrl: res.htmlUrl ?? "" },
          message: undefined,
        }));
        emit({ ts: isoNow(), step: "branch", event: "observed", summary: `${res.ref}@${res.sha.slice(0, 7)}` });
      } else {
        setBranch((prev) => ({ ...prev, status, message: res.message }));
        emit({ ts: isoNow(), step: "branch", event: status === "already_exists" ? "already_exists" : status === "blocked" ? "blocked" : "failed", summary: res.message ?? res.outcome });
      }
    } catch (error) {
      const message = error instanceof Error ? error.name : "unknown_error";
      setBranch((prev) => ({ ...prev, status: "failed", message }));
      emit({ ts: isoNow(), step: "branch", event: "failed", summary: message });
    }
  }, [branch.plan, branchApprovalId, emit, fetcher, serverBaseUrl]);

  // ── File plan/execute ─────────────────────────────────────────────────────
  const fileBranchName = branch.plan?.newBranchName ?? branch.observed?.ref.replace(/^refs\/heads\//, "");
  const onFilePlan = useCallback(async () => {
    if (!repoFullName.trim() || !fileBranchName || !filePath.trim() || fileNewContent.length === 0) {
      setFile({ status: "blocked", message: "branch 생성 후 path / newContent가 모두 필요합니다" });
      return;
    }
    setFile({ status: "planning" });
    try {
      const res = await postGithubFileChangePlan(
        serverBaseUrl,
        {
          repoFullName: repoFullName.trim(),
          branchName: fileBranchName,
          path: filePath.trim(),
          newContent: fileNewContent,
        },
        fetcher,
      );
      const status = mapOutcomeToStatus(res.outcome);
      if (res.plan) {
        setFile({ status, plan: res.plan, message: res.message });
      } else {
        setFile({ status, message: res.message });
      }
      emit({
        ts: isoNow(),
        step: "file",
        event: status === "planned" || status === "approval_required" ? "planned" : status === "already_exists" ? "already_exists" : status === "blocked" ? "blocked" : "failed",
        summary: res.plan ? `${res.plan.operation} ${res.plan.path} (+${res.plan.diffStat.additions}/-${res.plan.diffStat.deletions})` : (res.message ?? res.outcome),
      });
    } catch (error) {
      const message = error instanceof Error ? error.name : "unknown_error";
      setFile({ status: "failed", message });
      emit({ ts: isoNow(), step: "file", event: "failed", summary: message });
    }
  }, [emit, fetcher, fileBranchName, fileNewContent, filePath, repoFullName, serverBaseUrl]);

  const onFileExecute = useCallback(async () => {
    if (!file.plan) return;
    if (!fileApprovalId.trim()) {
      setFile((prev) => ({ ...prev, message: "approval ID가 필요합니다" }));
      return;
    }
    setFile((prev) => ({ ...prev, status: "executing" }));
    try {
      // 클라이언트도 새 콘텐츠 sha를 다시 계산해 서버 plan-store와 일치하는지 1차 검증.
      const newContentSha256 = await sha256Hex(fileNewContent);
      if (newContentSha256 !== file.plan.newContentSha256) {
        setFile((prev) => ({ ...prev, status: "blocked", message: "client newContentSha256이 plan과 다릅니다 — newContent를 다시 입력하세요" }));
        emit({ ts: isoNow(), step: "file", event: "blocked", summary: "client sha drift" });
        return;
      }
      const res = await postGithubFileChangeExecute(
        serverBaseUrl,
        {
          planId: file.plan.id,
          newContentSha256,
          baseFileSha: file.plan.baseFileSha,
          approvalId: fileApprovalId.trim(),
        },
        fetcher,
      );
      const status = mapOutcomeToStatus(res.outcome);
      if (res.outcome === "observed" && res.commitSha && res.blobSha) {
        setFile((prev) => ({
          ...prev,
          status,
          observed: { commitSha: res.commitSha!, blobSha: res.blobSha!, htmlUrl: res.htmlUrl ?? "" },
          message: undefined,
        }));
        emit({ ts: isoNow(), step: "file", event: "observed", summary: `commit ${res.commitSha.slice(0, 7)}` });
      } else {
        setFile((prev) => ({ ...prev, status, message: res.message }));
        emit({ ts: isoNow(), step: "file", event: status === "already_exists" ? "already_exists" : status === "blocked" ? "blocked" : "failed", summary: res.message ?? res.outcome });
      }
    } catch (error) {
      const message = error instanceof Error ? error.name : "unknown_error";
      setFile((prev) => ({ ...prev, status: "failed", message }));
      emit({ ts: isoNow(), step: "file", event: "failed", summary: message });
    }
  }, [emit, fetcher, file.plan, fileApprovalId, fileNewContent, serverBaseUrl]);

  // ── PR plan/execute ──────────────────────────────────────────────────────
  const onPrPlan = useCallback(async () => {
    if (!repoFullName.trim() || !prBase.trim() || !fileBranchName || !prTitle.trim()) {
      setPr({ status: "blocked", message: "repo / base / head(branch step) / title이 모두 필요합니다" });
      return;
    }
    setPr({ status: "planning" });
    try {
      const res = await postGithubPullRequestPlan(
        serverBaseUrl,
        {
          repoFullName: repoFullName.trim(),
          baseBranch: prBase.trim(),
          headBranch: fileBranchName,
          title: prTitle.trim(),
          body: prBody,
        },
        fetcher,
      );
      const status = mapOutcomeToStatus(res.outcome);
      if (res.plan) {
        setPr({ status, plan: res.plan, message: res.message });
      } else {
        setPr({ status, message: res.message });
      }
      emit({
        ts: isoNow(),
        step: "pr",
        event: status === "planned" || status === "approval_required" ? "planned" : status === "blocked" ? "blocked" : "failed",
        summary: res.plan ? `${res.plan.baseBranch} ← ${res.plan.headBranch} (+${res.plan.compare.aheadBy} commits / ${res.plan.compare.changedFiles} files)` : (res.message ?? res.outcome),
      });
    } catch (error) {
      const message = error instanceof Error ? error.name : "unknown_error";
      setPr({ status: "failed", message });
      emit({ ts: isoNow(), step: "pr", event: "failed", summary: message });
    }
  }, [emit, fetcher, fileBranchName, prBase, prBody, prTitle, repoFullName, serverBaseUrl]);

  const onPrExecute = useCallback(async () => {
    if (!pr.plan) return;
    if (!prApprovalId.trim()) {
      setPr((prev) => ({ ...prev, message: "approval ID가 필요합니다" }));
      return;
    }
    setPr((prev) => ({ ...prev, status: "executing" }));
    try {
      const res = await postGithubPullRequestExecute(
        serverBaseUrl,
        {
          planId: pr.plan.id,
          titleSha256: pr.plan.titleSha256,
          bodySha256: pr.plan.bodySha256,
          approvalId: prApprovalId.trim(),
        },
        fetcher,
      );
      const status = mapOutcomeToStatus(res.outcome);
      if (res.outcome === "observed" && res.pullNumber) {
        setPr((prev) => ({
          ...prev,
          status,
          observed: { pullNumber: res.pullNumber!, htmlUrl: res.htmlUrl ?? "", headSha: res.headSha ?? "" },
          message: undefined,
        }));
        emit({ ts: isoNow(), step: "pr", event: "observed", summary: `PR #${res.pullNumber}` });
      } else {
        setPr((prev) => ({ ...prev, status, message: res.message }));
        emit({ ts: isoNow(), step: "pr", event: status === "already_exists" ? "already_exists" : status === "blocked" ? "blocked" : "failed", summary: res.message ?? res.outcome });
      }
    } catch (error) {
      const message = error instanceof Error ? error.name : "unknown_error";
      setPr((prev) => ({ ...prev, status: "failed", message }));
      emit({ ts: isoNow(), step: "pr", event: "failed", summary: message });
    }
  }, [emit, fetcher, pr.plan, prApprovalId, serverBaseUrl]);

  return (
    <section
      aria-label="GitHub Publish 패널"
      data-testid="github-publish-panel"
      className="flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/40 p-4 text-zinc-200"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">GitHub Publish — branch ▸ file ▸ PR</h2>
        <input
          aria-label="repo full name"
          placeholder="owner/repo"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          className="w-56 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
      </header>

      {/* Step 1 — Branch */}
      <article aria-label="Step 1: Branch" data-testid="publish-step-branch" className="rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2">
          <GitBranch size={14} />
          <strong className="text-xs">Step 1 — Branch</strong>
          <StatusBadge status={branch.status} />
          {branch.observed ? (
            <span className="ml-auto text-[11px] text-zinc-400">{branch.observed.ref}@{branch.observed.sha.slice(0, 7)}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="source ref"
            placeholder="source ref (예: main)"
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            disabled={branchIsObserved}
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
          />
          <input
            aria-label="new branch name"
            placeholder="new branch (예: agent/feature-x)"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            disabled={branchIsObserved}
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBranchPlan}
            disabled={branch.status === "planning" || branchIsObserved}
            className="rounded border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-[11px] disabled:opacity-50"
          >
            {branch.status === "planning" ? <RefreshCw className="inline h-3 w-3 animate-spin" /> : null} Plan
          </button>
          {branch.plan ? (
            <>
              <input
                aria-label="branch approval ID"
                placeholder="approval ID"
                value={branchApprovalId}
                onChange={(e) => setBranchApprovalId(e.target.value)}
                className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={onBranchExecute}
                disabled={branch.status === "executing" || branchIsObserved}
                className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] disabled:opacity-50"
              >
                Execute
              </button>
            </>
          ) : null}
        </div>
        {branch.message ? <p className="mt-1 text-[11px] text-rose-300">{branch.message}</p> : null}
        {branch.plan ? (
          <p className="mt-1 text-[11px] text-zinc-400">
            plan {branch.plan.id.slice(0, 12)}… · source {branch.plan.sourceRef}@{branch.plan.sourceSha.slice(0, 7)} → {branch.plan.newRef}
          </p>
        ) : null}
      </article>

      {/* Step 2 — File change */}
      <article aria-label="Step 2: File change" data-testid="publish-step-file" className="rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2">
          <FileEdit size={14} />
          <strong className="text-xs">Step 2 — File change</strong>
          <StatusBadge status={file.status} />
          {file.observed ? (
            <span className="ml-auto text-[11px] text-zinc-400">commit {file.observed.commitSha.slice(0, 7)}</span>
          ) : null}
        </div>
        {!fileBranchName ? (
          <p className="text-[11px] text-amber-300">먼저 Step 1에서 branch를 만든 뒤 진행하세요.</p>
        ) : (
          <>
            <input
              aria-label="file path"
              placeholder="src/foo.ts"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
            />
            <textarea
              aria-label="file new content"
              placeholder="새 콘텐츠(텍스트만; binary/NUL 차단됨)"
              value={fileNewContent}
              onChange={(e) => setFileNewContent(e.target.value)}
              rows={4}
              className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onFilePlan}
                disabled={file.status === "planning"}
                className="rounded border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-[11px] disabled:opacity-50"
              >
                Plan
              </button>
              {file.plan ? (
                <>
                  <input
                    aria-label="file approval ID"
                    placeholder="approval ID"
                    value={fileApprovalId}
                    onChange={(e) => setFileApprovalId(e.target.value)}
                    className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={onFileExecute}
                    disabled={file.status === "executing"}
                    className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] disabled:opacity-50"
                  >
                    Execute
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
        {file.message ? <p className="mt-1 text-[11px] text-rose-300">{file.message}</p> : null}
        {file.plan ? (
          <details className="mt-2" data-testid="publish-file-diff">
            <summary className="cursor-pointer text-[11px] text-zinc-400">
              {file.plan.operation} · +{file.plan.diffStat.additions}/-{file.plan.diffStat.deletions} {file.plan.diffTruncated ? "· 일부만 표시" : ""}
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-tight text-zinc-200">{file.plan.diffPreview}</pre>
          </details>
        ) : null}
      </article>

      {/* Step 3 — Pull request */}
      <article aria-label="Step 3: Pull Request" data-testid="publish-step-pr" className="rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2">
          <GitPullRequest size={14} />
          <strong className="text-xs">Step 3 — Pull Request</strong>
          <StatusBadge status={pr.status} />
          {pr.observed ? (
            <a
              href={pr.observed.htmlUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:underline"
            >
              PR #{pr.observed.pullNumber} <ExternalLink size={10} />
            </a>
          ) : null}
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input
            aria-label="pr base branch"
            placeholder="base (예: main)"
            value={prBase}
            onChange={(e) => setPrBase(e.target.value)}
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
          />
          <span className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-400">
            head: {fileBranchName ?? "(branch step 필요)"}
          </span>
        </div>
        <input
          aria-label="pr title"
          placeholder="PR 제목"
          value={prTitle}
          onChange={(e) => setPrTitle(e.target.value)}
          className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
        <textarea
          aria-label="pr body"
          placeholder="PR 본문(빈 본문 허용)"
          value={prBody}
          onChange={(e) => setPrBody(e.target.value)}
          rows={3}
          className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPrPlan}
            disabled={pr.status === "planning"}
            className="rounded border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-[11px] disabled:opacity-50"
          >
            Plan
          </button>
          {pr.plan ? (
            <>
              <input
                aria-label="pr approval ID"
                placeholder="approval ID"
                value={prApprovalId}
                onChange={(e) => setPrApprovalId(e.target.value)}
                className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={onPrExecute}
                disabled={pr.status === "executing"}
                className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] disabled:opacity-50"
              >
                Create PR
              </button>
            </>
          ) : null}
        </div>
        {pr.message ? <p className="mt-1 text-[11px] text-rose-300">{pr.message}</p> : null}
        {pr.plan ? (
          <p className="mt-1 text-[11px] text-zinc-400">
            compare {pr.plan.baseBranch} ← {pr.plan.headBranch} · +{pr.plan.compare.aheadBy} commits · {pr.plan.compare.changedFiles} files
            {pr.plan.compare.truncated ? " · 일부만 표시" : ""}
          </p>
        ) : null}
      </article>

      {/* Step 4 — Trace */}
      <article aria-label="Step 4: Trace" data-testid="publish-step-trace" className="rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2">
          <ChevronRight size={14} />
          <strong className="text-xs">Trace</strong>
          <span className="text-[11px] text-zinc-500">{trace.length}건</span>
        </div>
        {trace.length === 0 ? (
          <p className="text-[11px] text-zinc-500">아직 이벤트가 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {trace.map((event, idx) => (
              <li key={`${event.ts}-${idx}`} className="text-[11px] text-zinc-400">
                <span className="font-mono text-zinc-500">[{event.ts.slice(11, 19)}]</span> <span className="font-semibold">{event.step}</span> {event.event} — {event.summary}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-zinc-500">
          merge / review submit / labels / assignees / branch delete UI는 이 패널에 의도적으로 없습니다.
          (W5 후보로 분류 — 별도 승인 필요.)
        </p>
      </article>
    </section>
  );
}
