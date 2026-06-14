import { useState } from "react";
import { GitPullRequestArrow } from "lucide-react";
import type { GithubPullRequestUpdatePlan } from "@ai-orchestrator/protocol";
import {
  postGithubPullRequestUpdatePlan,
  postGithubPullRequestUpdateExecute,
} from "../../lib/githubConnector";

/**
 * W5c: PR title/body update.
 *
 * 좁은 범위(사용자 확정):
 *   - title/body만 수정. draft toggle/close/base 변경/labels/assignees/review/merge는
 *     이 카드에 절대 노출하지 않는다(보안: UI 자체가 부재 → 클릭으로도 실행 불가).
 *   - same-repo only(서버가 PATCH /repos/o/r/pulls/N로 직접 호출 — fork 없음).
 *   - open PR만 — 서버가 plan 단계에서 closed/merged면 blocked.
 *   - approval required(armed 없음 — PR 본문은 외부 흔적이 크다).
 *   - 본문 raw는 trace/log에 남기지 않는다(서버가 excerpt/sha만 응답).
 *   - 자동 실행 없음 — Plan/Execute 모두 사용자 명시 클릭만.
 *
 * 흐름:
 *   defaults → 사용자가 newTitle/newBody 편집 → Plan → diff preview → approval ID 입력 → Execute → observed.
 */

export function PullRequestUpdateCard({
  defaultRepoFullName,
  defaultPullNumber,
  defaultCurrentTitle,
  defaultCurrentBody,
  serverBaseUrl,
  fetchImpl,
  onContextEvent,
}: {
  defaultRepoFullName?: string;
  defaultPullNumber?: number;
  /** prefill용 — 사용자가 편집 전 초기 값. 서버가 plan에서 진짜 현재 값 다시 읽어 검증. */
  defaultCurrentTitle?: string;
  defaultCurrentBody?: string;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [repoFullName, setRepoFullName] = useState(defaultRepoFullName ?? "");
  const [pullNumber, setPullNumber] = useState<string>(
    defaultPullNumber ? String(defaultPullNumber) : "",
  );
  const [newTitle, setNewTitle] = useState(defaultCurrentTitle ?? "");
  const [newBody, setNewBody] = useState(defaultCurrentBody ?? "");
  const [approvalId, setApprovalId] = useState("");

  const [planBusy, setPlanBusy] = useState(false);
  const [execBusy, setExecBusy] = useState(false);
  const [plan, setPlan] = useState<GithubPullRequestUpdatePlan | undefined>();
  const [planMessage, setPlanMessage] = useState<{ kind: "info" | "warn"; text: string } | undefined>();
  const [execResult, setExecResult] = useState<
    | { kind: "idle" }
    | { kind: "observed"; pullNumber: number; htmlUrl: string; title: string; updatedAt: string; bodyLength: number }
    | { kind: "blocked"; reason?: string; message: string }
    | { kind: "failed"; message: string }
  >({ kind: "idle" });

  const prNum = Number(pullNumber);
  const canPlan =
    !planBusy &&
    !!repoFullName.trim() &&
    Number.isInteger(prNum) &&
    prNum > 0 &&
    (newTitle.trim().length > 0 || newBody.length > 0);
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
    onContextEvent?.("github.publish.pr.update.plan.requested", {
      repoFullName,
      pullNumber: prNum,
      titleChanged: newTitle !== (defaultCurrentTitle ?? ""),
      bodyChanged: newBody !== (defaultCurrentBody ?? ""),
      ts: new Date().toISOString(),
    });
    try {
      const res = await postGithubPullRequestUpdatePlan(
        serverBaseUrl,
        {
          repoFullName,
          pullNumber: prNum,
          newTitle: newTitle.trim() ? newTitle : undefined,
          newBody: newBody.length > 0 ? newBody : undefined,
        },
        fetchImpl ?? fetch,
      );
      if (res.outcome === "planned" && res.plan) {
        setPlan(res.plan);
        onContextEvent?.("github.publish.pr.update.planned", {
          repoFullName,
          pullNumber: prNum,
          planId: res.plan.id,
          titleChanged: res.plan.changeSummary.titleChanged,
          bodyChanged: res.plan.changeSummary.bodyChanged,
          bodyDelta: res.plan.changeSummary.bodyDelta,
          ts: new Date().toISOString(),
        });
      } else if (res.outcome === "no_op") {
        setPlanMessage({ kind: "info", text: res.message ?? "변경할 게 없습니다 — 새 값이 현재와 동일." });
      } else {
        setPlanMessage({ kind: "warn", text: res.message ?? res.outcome });
        onContextEvent?.("github.publish.pr.update.plan.blocked", {
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
    onContextEvent?.("github.publish.pr.update.execute.requested", {
      repoFullName,
      pullNumber: prNum,
      planId: plan.id,
      ts: new Date().toISOString(),
    });
    try {
      const res = await postGithubPullRequestUpdateExecute(
        serverBaseUrl,
        {
          planId: plan.id,
          expectedCurrentTitleSha256: plan.currentTitleSha256,
          expectedCurrentBodySha256: plan.currentBodySha256,
          newTitleSha256: plan.newTitleSha256,
          newBodySha256: plan.newBodySha256,
          approvalId,
        },
        fetchImpl ?? fetch,
      );
      if (res.outcome === "observed" && res.pullNumber && res.htmlUrl) {
        setExecResult({
          kind: "observed",
          pullNumber: res.pullNumber,
          htmlUrl: res.htmlUrl,
          title: res.title ?? "",
          updatedAt: res.updatedAt ?? "",
          bodyLength: res.bodyLength ?? 0,
        });
        onContextEvent?.("github.publish.pr.update.observed", {
          repoFullName,
          pullNumber: res.pullNumber,
          htmlUrl: res.htmlUrl,
          updatedAt: res.updatedAt,
          // raw body는 보내지 않음 — sha/length만.
          bodyLength: res.bodyLength,
          bodySha256: res.bodySha256,
          ts: new Date().toISOString(),
        });
      } else if (res.outcome === "blocked" || res.outcome === "approval_required") {
        setExecResult({ kind: "blocked", reason: res.reason, message: res.message ?? res.outcome });
        onContextEvent?.("github.publish.pr.update.blocked", {
          repoFullName,
          pullNumber: prNum,
          reason: res.reason ?? res.outcome,
          summary: res.message ?? "",
          ts: new Date().toISOString(),
        });
      } else {
        setExecResult({ kind: "failed", message: res.message ?? res.outcome });
        onContextEvent?.("github.publish.pr.update.failed", {
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
      onContextEvent?.("github.publish.pr.update.failed", {
        repoFullName,
        pullNumber: prNum,
        summary: message,
        ts: new Date().toISOString(),
      });
    } finally {
      setExecBusy(false);
    }
  };

  return (
    <article
      data-testid="publish-pr-update-card"
      aria-label="PR title/body update (W5c)"
      className="mt-3 rounded-2xl border border-violet-300/20 bg-violet-500/[0.05] p-4 text-xs text-zinc-300"
    >
      <header className="mb-2 flex items-center gap-2">
        <GitPullRequestArrow className="h-4 w-4 text-violet-300" />
        <strong className="text-[11px] font-semibold uppercase tracking-wider text-violet-200">
          PR 제목/본문 다듬기 (W5c)
        </strong>
        <span className="flex-1" />
        <span className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-medium uppercase text-zinc-400">
          title/body만 — draft/close/base/labels/assignees 없음
        </span>
      </header>

      <div className="mb-2 flex flex-wrap gap-2">
        <input
          aria-label="pr-update repo"
          placeholder="owner/repo"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          disabled={planBusy || execBusy}
          className="w-44 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
        <input
          aria-label="pr-update pull number"
          placeholder="PR #"
          value={pullNumber}
          onChange={(e) => setPullNumber(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={planBusy || execBusy}
          className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
      </div>

      <input
        aria-label="pr-update new title"
        placeholder="새 PR 제목 (변경 안 하려면 비워둬도 됨 — body만 변경 가능)"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        disabled={planBusy || execBusy}
        className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
      />
      <textarea
        aria-label="pr-update new body"
        placeholder="새 PR 본문 (변경 안 하려면 비워둬도 됨)"
        value={newBody}
        onChange={(e) => setNewBody(e.target.value)}
        rows={4}
        disabled={planBusy || execBusy}
        className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs font-mono"
      />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPlan}
          disabled={!canPlan}
          data-testid="publish-pr-update-plan"
          className={
            canPlan
              ? "rounded border border-emerald-300/40 px-2 py-1 text-[11px] font-medium uppercase text-emerald-200 hover:bg-emerald-300/10"
              : "rounded border border-white/10 px-2 py-1 text-[11px] font-medium uppercase text-zinc-500 cursor-not-allowed"
          }
        >
          {planBusy ? "Plan 진행 중…" : "Plan"}
        </button>
        {plan ? (
          <span className="text-[11px] text-zinc-400" data-testid="publish-pr-update-plan-summary">
            {plan.changeSummary.titleChanged ? "title 변경" : null}
            {plan.changeSummary.titleChanged && plan.changeSummary.bodyChanged ? " · " : null}
            {plan.changeSummary.bodyChanged ? `body 변경 (Δ ${plan.changeSummary.bodyDelta}B)` : null}
          </span>
        ) : null}
      </div>

      {plan && plan.changeSummary.titleChanged ? (
        <p className="mb-1 text-[11px] text-zinc-400" data-testid="publish-pr-update-title-diff">
          현재: <span className="text-zinc-200">{plan.currentTitle}</span> → 새:{" "}
          <span className="text-emerald-200">{plan.newTitle}</span>
        </p>
      ) : null}
      {plan && plan.newBodyExcerpt ? (
        <details className="mb-2" data-testid="publish-pr-update-body-excerpt">
          <summary className="cursor-pointer text-[11px] text-zinc-400">
            새 body excerpt ({plan.newBodyLength ?? 0}B)
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-tight text-zinc-200">
            {plan.newBodyExcerpt}
          </pre>
        </details>
      ) : null}

      {planMessage ? (
        <p
          data-testid="publish-pr-update-plan-message"
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
        <div className="flex flex-wrap items-center gap-2 border-t border-violet-300/10 pt-2">
          <input
            aria-label="pr-update approval ID"
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
            data-testid="publish-pr-update-execute"
            className={
              canExecute
                ? "rounded border border-rose-300/40 px-2 py-1 text-[11px] font-medium uppercase text-rose-200 hover:bg-rose-300/10"
                : "rounded border border-white/10 px-2 py-1 text-[11px] font-medium uppercase text-zinc-500 cursor-not-allowed"
            }
          >
            {execBusy ? "PATCH 진행 중…" : "PR title/body 갱신"}
          </button>
        </div>
      ) : null}

      {execResult.kind === "observed" ? (
        <p className="mt-2 text-[11px] text-emerald-200" data-testid="publish-pr-update-observed">
          ✓ PR #{execResult.pullNumber} updated — {execResult.title}{" "}
          <a
            href={execResult.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-emerald-100"
            data-testid="publish-pr-update-link"
          >
            GitHub에서 보기
          </a>
          <span className="ml-2 text-[10px] text-zinc-400">updated {execResult.updatedAt}</span>
        </p>
      ) : execResult.kind === "blocked" ? (
        <p className="mt-2 text-[11px] text-rose-300" data-testid="publish-pr-update-blocked">
          ✗ 차단: {execResult.reason ?? "blocked"} — {execResult.message}
        </p>
      ) : execResult.kind === "failed" ? (
        <p className="mt-2 text-[11px] text-rose-300" data-testid="publish-pr-update-failed">
          ✗ 실패: {execResult.message}
        </p>
      ) : null}
    </article>
  );
}
