import { useState } from "react";
import { Tag } from "lucide-react";
import type { GithubPullRequestLabelsUpdatePlan } from "@ai-orchestrator/protocol";
import {
  postGithubPullRequestLabelsUpdatePlan,
  postGithubPullRequestLabelsUpdateExecute,
} from "../../lib/githubConnector";

/**
 * W5d Phase 1: PR labels add/remove.
 *
 * 좁은 범위(사용자 확정):
 *   - labels add/remove만. assignees/milestone/project/draft/state/title/body/base/merge/close
 *     UI는 일절 노출하지 않는다(security: UI 부재 → 클릭으로도 실행 불가).
 *   - same-repo, open PR only.
 *   - approval ONLY(armed 없음).
 *   - 자동 실행 없음 — Plan/Execute 모두 사용자 명시 클릭.
 *
 * 흐름:
 *   defaults(repo + PR#) → 사용자가 콤마 구분 add/remove 입력 → Plan → diff preview →
 *   approval ID 입력 → Execute → observed appliedLabels.
 */

export function PullRequestLabelsUpdateCard({
  defaultRepoFullName,
  defaultPullNumber,
  serverBaseUrl,
  fetchImpl,
  onContextEvent,
}: {
  defaultRepoFullName?: string;
  defaultPullNumber?: number;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [repoFullName, setRepoFullName] = useState(defaultRepoFullName ?? "");
  const [pullNumber, setPullNumber] = useState<string>(
    defaultPullNumber ? String(defaultPullNumber) : "",
  );
  const [addLabelsText, setAddLabelsText] = useState("");
  const [removeLabelsText, setRemoveLabelsText] = useState("");
  const [approvalId, setApprovalId] = useState("");

  const [planBusy, setPlanBusy] = useState(false);
  const [execBusy, setExecBusy] = useState(false);
  const [plan, setPlan] = useState<GithubPullRequestLabelsUpdatePlan | undefined>();
  const [planMessage, setPlanMessage] = useState<{ kind: "info" | "warn"; text: string } | undefined>();
  const [execResult, setExecResult] = useState<
    | { kind: "idle" }
    | { kind: "observed"; pullNumber: number; htmlUrl: string; appliedLabels: ReadonlyArray<string> }
    | { kind: "blocked"; reason?: string; message: string }
    | { kind: "failed"; message: string }
  >({ kind: "idle" });

  const prNum = Number(pullNumber);
  /** "a, b, c" → ["a","b","c"]. 빈 문자열은 무시. 양 끝 공백 trim. */
  const parseList = (text: string): string[] =>
    text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const addLabels = parseList(addLabelsText);
  const removeLabels = parseList(removeLabelsText);
  const canPlan =
    !planBusy &&
    !!repoFullName.trim() &&
    Number.isInteger(prNum) &&
    prNum > 0 &&
    addLabels.length + removeLabels.length > 0;
  const canExecute =
    !execBusy &&
    plan?.status === "approval_required" &&
    approvalId.trim().length > 0;

  const onPlan = async () => {
    if (!canPlan) return;
    setPlanBusy(true);
    setPlan(undefined);
    setPlanMessage(undefined);
    setExecResult({ kind: "idle" });
    onContextEvent?.("github.publish.pr.labels.plan.requested", {
      repoFullName,
      pullNumber: prNum,
      addCount: addLabels.length,
      removeCount: removeLabels.length,
      ts: new Date().toISOString(),
    });
    try {
      const res = await postGithubPullRequestLabelsUpdatePlan(
        serverBaseUrl,
        { repoFullName, pullNumber: prNum, addLabels, removeLabels },
        fetchImpl ?? fetch,
      );
      if (res.outcome === "planned" && res.plan) {
        setPlan(res.plan);
        onContextEvent?.("github.publish.pr.labels.planned", {
          repoFullName,
          pullNumber: prNum,
          planId: res.plan.id,
          actuallyAdded: res.plan.changeSummary.actuallyAdded.length,
          actuallyRemoved: res.plan.changeSummary.actuallyRemoved.length,
          noopAdd: res.plan.changeSummary.noopAdd.length,
          noopRemove: res.plan.changeSummary.noopRemove.length,
          ts: new Date().toISOString(),
        });
      } else if (res.outcome === "no_op") {
        setPlanMessage({ kind: "info", text: res.message ?? "이미 원하는 상태입니다 — 변경 없음." });
      } else {
        setPlanMessage({ kind: "warn", text: res.message ?? res.outcome });
        onContextEvent?.("github.publish.pr.labels.plan.blocked", {
          repoFullName,
          pullNumber: prNum,
          summary: res.message ?? res.outcome,
          ts: new Date().toISOString(),
        });
      }
    } catch (err) {
      setPlanMessage({ kind: "warn", text: err instanceof Error ? err.message : "unknown" });
    } finally {
      setPlanBusy(false);
    }
  };

  const onExecute = async () => {
    if (!canExecute || !plan) return;
    setExecBusy(true);
    setExecResult({ kind: "idle" });
    onContextEvent?.("github.publish.pr.labels.execute.requested", {
      repoFullName,
      pullNumber: prNum,
      planId: plan.id,
      ts: new Date().toISOString(),
    });
    try {
      const res = await postGithubPullRequestLabelsUpdateExecute(
        serverBaseUrl,
        {
          planId: plan.id,
          expectedCurrentLabelsHash: plan.currentLabelsHash,
          approvalId,
        },
        fetchImpl ?? fetch,
      );
      if (res.outcome === "observed" && res.pullNumber && res.htmlUrl && res.appliedLabels) {
        setExecResult({
          kind: "observed",
          pullNumber: res.pullNumber,
          htmlUrl: res.htmlUrl,
          appliedLabels: res.appliedLabels,
        });
        onContextEvent?.("github.publish.pr.labels.observed", {
          repoFullName,
          pullNumber: res.pullNumber,
          htmlUrl: res.htmlUrl,
          appliedCount: res.appliedLabels.length,
          ts: new Date().toISOString(),
        });
      } else if (res.outcome === "blocked" || res.outcome === "approval_required") {
        setExecResult({ kind: "blocked", reason: res.reason, message: res.message ?? res.outcome });
        onContextEvent?.("github.publish.pr.labels.blocked", {
          repoFullName,
          pullNumber: prNum,
          reason: res.reason ?? res.outcome,
          summary: res.message ?? "",
          ts: new Date().toISOString(),
        });
      } else {
        setExecResult({ kind: "failed", message: res.message ?? res.outcome });
        onContextEvent?.("github.publish.pr.labels.failed", {
          repoFullName,
          pullNumber: prNum,
          reason: res.reason ?? res.outcome,
          summary: res.message ?? "",
          ts: new Date().toISOString(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      setExecResult({ kind: "failed", message });
    } finally {
      setExecBusy(false);
    }
  };

  return (
    <article
      data-testid="publish-pr-labels-card"
      aria-label="PR labels update (W5d-Phase-1)"
      className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-500/[0.05] p-4 text-xs text-zinc-300"
    >
      <header className="mb-2 flex items-center gap-2">
        <Tag className="h-4 w-4 text-amber-300" />
        <strong className="text-[11px] font-semibold uppercase tracking-wider text-amber-200">
          PR labels (W5d Phase 1)
        </strong>
        <span className="flex-1" />
        <span className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-medium uppercase text-zinc-400">
          labels만 — assignees는 Phase 2, milestone/project/draft/close 없음
        </span>
      </header>

      <div className="mb-2 flex flex-wrap gap-2">
        <input
          aria-label="pr-labels repo"
          placeholder="owner/repo"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          disabled={planBusy || execBusy}
          className="w-44 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
        <input
          aria-label="pr-labels pull number"
          placeholder="PR #"
          value={pullNumber}
          onChange={(e) => setPullNumber(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={planBusy || execBusy}
          className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
      </div>

      <input
        aria-label="pr-labels add"
        placeholder="추가할 라벨(콤마 구분): bug, enhancement"
        value={addLabelsText}
        onChange={(e) => setAddLabelsText(e.target.value)}
        disabled={planBusy || execBusy}
        className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs font-mono"
      />
      <input
        aria-label="pr-labels remove"
        placeholder="제거할 라벨(콤마 구분): needs-review"
        value={removeLabelsText}
        onChange={(e) => setRemoveLabelsText(e.target.value)}
        disabled={planBusy || execBusy}
        className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs font-mono"
      />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPlan}
          disabled={!canPlan}
          data-testid="publish-pr-labels-plan"
          className={
            canPlan
              ? "rounded border border-emerald-300/40 px-2 py-1 text-[11px] font-medium uppercase text-emerald-200 hover:bg-emerald-300/10"
              : "rounded border border-white/10 px-2 py-1 text-[11px] font-medium uppercase text-zinc-500 cursor-not-allowed"
          }
        >
          {planBusy ? "Plan 진행 중…" : "Plan"}
        </button>
        {plan ? (
          <span className="text-[11px] text-zinc-400" data-testid="publish-pr-labels-plan-summary">
            +{plan.changeSummary.actuallyAdded.length} -{plan.changeSummary.actuallyRemoved.length}
            {plan.changeSummary.noopAdd.length + plan.changeSummary.noopRemove.length > 0
              ? ` (noop ${plan.changeSummary.noopAdd.length + plan.changeSummary.noopRemove.length})`
              : ""}
          </span>
        ) : null}
      </div>

      {plan ? (
        <div className="mb-2 rounded border border-white/10 bg-black/30 p-2 text-[11px]" data-testid="publish-pr-labels-diff">
          <div className="text-zinc-400">현재: <span className="text-zinc-200">{plan.currentLabels.join(", ") || "(없음)"}</span></div>
          <div className="text-zinc-400">변경 후: <span className="text-emerald-200">{plan.finalLabels.join(", ") || "(없음)"}</span></div>
          {plan.changeSummary.actuallyAdded.length > 0 ? (
            <div className="text-emerald-300">+ {plan.changeSummary.actuallyAdded.join(", ")}</div>
          ) : null}
          {plan.changeSummary.actuallyRemoved.length > 0 ? (
            <div className="text-rose-300">- {plan.changeSummary.actuallyRemoved.join(", ")}</div>
          ) : null}
          {plan.changeSummary.noopAdd.length + plan.changeSummary.noopRemove.length > 0 ? (
            <div className="mt-1 text-[10px] text-zinc-500">
              noop: {[...plan.changeSummary.noopAdd, ...plan.changeSummary.noopRemove].join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {planMessage ? (
        <p
          data-testid="publish-pr-labels-plan-message"
          className={
            planMessage.kind === "warn"
              ? "mb-2 text-[11px] text-rose-300"
              : "mb-2 text-[11px] text-amber-200"
          }
        >
          {planMessage.text}
        </p>
      ) : null}

      {plan ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-amber-300/10 pt-2">
          <input
            aria-label="pr-labels approval ID"
            placeholder="approval ID"
            value={approvalId}
            onChange={(e) => setApprovalId(e.target.value)}
            disabled={execBusy}
            className="w-48 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={onExecute}
            disabled={!canExecute}
            data-testid="publish-pr-labels-execute"
            className={
              canExecute
                ? "rounded border border-rose-300/40 px-2 py-1 text-[11px] font-medium uppercase text-rose-200 hover:bg-rose-300/10"
                : "rounded border border-white/10 px-2 py-1 text-[11px] font-medium uppercase text-zinc-500 cursor-not-allowed"
            }
          >
            {execBusy ? "PUT 진행 중…" : "labels 적용"}
          </button>
        </div>
      ) : null}

      {execResult.kind === "observed" ? (
        <p className="mt-2 text-[11px] text-emerald-200" data-testid="publish-pr-labels-observed">
          ✓ PR #{execResult.pullNumber} labels: <span className="text-zinc-200">{execResult.appliedLabels.join(", ") || "(없음)"}</span>{" "}
          <a
            href={execResult.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-emerald-100"
            data-testid="publish-pr-labels-link"
          >
            GitHub에서 보기
          </a>
        </p>
      ) : execResult.kind === "blocked" ? (
        <p className="mt-2 text-[11px] text-rose-300" data-testid="publish-pr-labels-blocked">
          ✗ 차단: {execResult.reason ?? "blocked"} — {execResult.message}
        </p>
      ) : execResult.kind === "failed" ? (
        <p className="mt-2 text-[11px] text-rose-300" data-testid="publish-pr-labels-failed">
          ✗ 실패: {execResult.message}
        </p>
      ) : null}
    </article>
  );
}
