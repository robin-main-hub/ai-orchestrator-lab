import { useState } from "react";
import { Eye, AlertTriangle, FileEdit, Sparkles } from "lucide-react";
import type {
  DesignIssueCard,
  DesignIssueKind,
  VisualQaReport,
} from "@ai-orchestrator/protocol";
import { runDgxVisualQa } from "../runtime/stage47MissionServer";
import {
  buildAppFixDraftFromVisualQa,
  DESIGN_ISSUE_KIND_LABEL,
  type AppFixDraft,
} from "../lib/appFixDraft";
import type { MissionVisualQaSummary } from "../lib/missionBoardModel";

/**
 * Preview → Visual QA → Revision Draft vertical 카드.
 *
 * 정직성/안전(사용자 확정):
 *   - preview URL이 없으면 CTA disabled(fake observed 금지).
 *   - report.status="blocked"는 그대로 표시. observed running 없이는 절대 passed로 표시 X.
 *   - issue list는 한눈에 보이고, console_error는 미리보기 최대 3개. 전문 dump 안 함.
 *   - screenshot 필드가 schema에 없으므로 "스크린샷 미지원" 정직 표시.
 *   - issues_found/failed → "수정안 초안 만들기" CTA. 클릭은 trace만 — 자동 파일 수정/scaffold
 *     refresh/GitHub write 0. 초안은 사용자가 보고 직접 적용한다.
 *   - 자동 재실행 없음.
 */

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "report"; report: VisualQaReport }
  | { kind: "error"; message: string };

const STATUS_LABEL: Record<VisualQaReport["status"], string> = {
  passed: "통과",
  warning: "경고",
  failed: "실패",
  blocked: "차단",
};

const STATUS_TONE: Record<VisualQaReport["status"], string> = {
  passed: "visual-qa__status--passed",
  warning: "visual-qa__status--warning",
  failed: "visual-qa__status--failed",
  blocked: "visual-qa__status--blocked",
};

const SEVERITY_LABEL: Record<DesignIssueCard["severity"], string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

const CONSOLE_PREVIEW_LIMIT = 3;

export function VisualQaCard({
  missionId,
  workspaceId,
  previewUrl,
  latestSummary,
  serverBaseUrl,
  fetchImpl,
  onContextEvent,
}: {
  missionId: string;
  workspaceId?: string;
  /** Preview Run vertical이 observed running으로 만든 URL. 없으면 CTA disabled. */
  previewUrl?: string;
  /** 보드에 이미 기록된 직전 Visual QA 요약(서버 사이드). 없으면 첫 실행 전 상태. */
  latestSummary?: MissionVisualQaSummary;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  /** 사용자가 "수정안 초안 만들기"를 눌렀는지(한 번 누르면 trace + 패널 열림). */
  const [draft, setDraft] = useState<AppFixDraft | undefined>(undefined);
  const busy = run.kind === "running";
  const canRun = !!previewUrl && !!workspaceId && !busy;

  const onRunQa = async () => {
    if (!canRun) return;
    setRun({ kind: "running" });
    setDraft(undefined);
    onContextEvent?.("mission.visual_qa.requested", {
      missionId,
      workspaceId,
      previewUrl,
      ts: new Date().toISOString(),
    });
    try {
      const res = await runDgxVisualQa({
        missionId,
        workspaceId: workspaceId!,
        serverBaseUrl,
        fetchImpl,
      });
      setRun({ kind: "report", report: res.report });
      onContextEvent?.("mission.visual_qa.observed", {
        missionId,
        workspaceId,
        status: res.report.status,
        truthStatus: res.report.truthStatus,
        issueCount: res.report.issues.length,
        checkCount: res.report.checks.length,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      setRun({ kind: "error", message });
      onContextEvent?.("mission.visual_qa.failed", {
        missionId,
        workspaceId,
        summary: message,
        ts: new Date().toISOString(),
      });
    }
  };

  const onMakeDraft = () => {
    if (run.kind !== "report") return;
    const fix = buildAppFixDraftFromVisualQa(run.report);
    setDraft(fix);
    onContextEvent?.("mission.visual_qa.revision_draft.requested", {
      missionId,
      workspaceId,
      reportStatus: run.report.status,
      status: fix.status,
      suggestionGroups: fix.counts.suggestionGroups,
      unmappedIssues: fix.counts.unmappedIssues,
      ts: new Date().toISOString(),
    });
  };

  const report = run.kind === "report" ? run.report : undefined;
  const consoleErrors = report
    ? report.issues.filter((i): i is DesignIssueCard & { kind: "console_error" } => i.kind === "console_error")
    : [];
  const otherIssues = report ? report.issues.filter((i) => i.kind !== "console_error") : [];
  const showDraftCta = report && (report.status === "warning" || report.status === "failed");

  return (
    <div
      className="visual-qa"
      data-testid={`visual-qa-${missionId}`}
      data-state={run.kind}
    >
      <div className="visual-qa__head">
        <button
          type="button"
          onClick={onRunQa}
          disabled={!canRun}
          data-testid={`visual-qa-run-${missionId}`}
          className={canRun ? "visual-qa__cta" : "visual-qa__cta visual-qa__cta--disabled"}
          title={
            previewUrl
              ? "현재 preview URL을 대상으로 Visual QA를 한 번 실행합니다."
              : "Preview가 running observed가 아니면 실행할 수 없습니다."
          }
        >
          <Eye size={12} /> {busy ? "Visual QA 실행 중…" : "Visual QA 실행"}
        </button>
        {!previewUrl ? (
          <span className="visual-qa__hint visual-qa__hint--muted" data-testid={`visual-qa-no-preview-${missionId}`}>
            preview URL이 없습니다 — 먼저 Preview 실행을 눌러 observed running을 만드세요.
          </span>
        ) : null}
        {latestSummary && run.kind === "idle" ? (
          <span className="visual-qa__hint visual-qa__hint--muted" data-testid={`visual-qa-latest-summary-${missionId}`}>
            직전: {STATUS_LABEL[latestSummary.status] ?? latestSummary.status} · 이슈 {latestSummary.issueCount}건
          </span>
        ) : null}
      </div>

      {run.kind === "error" ? (
        <p className="visual-qa__error" data-testid={`visual-qa-error-${missionId}`}>
          실행 실패 — {run.message}
        </p>
      ) : null}

      {report ? (
        <div className="visual-qa__report" data-testid={`visual-qa-report-${missionId}`}>
          <div className="visual-qa__report-head">
            <span className={`visual-qa__status ${STATUS_TONE[report.status]}`} data-testid={`visual-qa-status-${missionId}`}>
              {STATUS_LABEL[report.status]} · {report.truthStatus}
            </span>
            <span className="visual-qa__counts">
              issues {report.issues.length} · checks {report.checks.length}
            </span>
          </div>
          {/* 스크린샷은 schema에 없는 정직 영역. 추측해서 fake image를 보여주지 않는다. */}
          <p className="visual-qa__screenshot-note" data-testid={`visual-qa-screenshot-note-${missionId}`}>
            스크린샷: 별도 미지원(이번 vertical에서는 이미지 노출 X — schema 합의 시 추가).
          </p>

          {otherIssues.length > 0 ? (
            <ul className="visual-qa__issues" data-testid={`visual-qa-issues-${missionId}`}>
              {otherIssues.map((issue) => (
                <li key={issue.id} className={`visual-qa__issue visual-qa__issue--${issue.severity}`}>
                  <span className="visual-qa__issue-kind">
                    {DESIGN_ISSUE_KIND_LABEL[issue.kind as DesignIssueKind] ?? issue.kind}
                  </span>
                  <span className="visual-qa__issue-severity">{SEVERITY_LABEL[issue.severity]}</span>
                  <span className="visual-qa__issue-summary">{issue.summary}</span>
                  {issue.recommendation ? (
                    <span className="visual-qa__issue-recommendation">→ {issue.recommendation}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {consoleErrors.length > 0 ? (
            <div className="visual-qa__console" data-testid={`visual-qa-console-${missionId}`}>
              <div className="visual-qa__console-head">
                <AlertTriangle size={12} /> 콘솔 에러 {consoleErrors.length}건 (미리보기 최대 {CONSOLE_PREVIEW_LIMIT})
              </div>
              <ul>
                {consoleErrors.slice(0, CONSOLE_PREVIEW_LIMIT).map((e) => (
                  <li key={e.id} className="visual-qa__console-line">
                    <span className="visual-qa__issue-severity">{SEVERITY_LABEL[e.severity]}</span>
                    <span>{e.summary}</span>
                  </li>
                ))}
              </ul>
              {consoleErrors.length > CONSOLE_PREVIEW_LIMIT ? (
                <p className="visual-qa__console-more" data-testid={`visual-qa-console-more-${missionId}`}>
                  나머지 {consoleErrors.length - CONSOLE_PREVIEW_LIMIT}건은 trace에서 확인하세요(전문 dump는 카드에 표시하지 않습니다).
                </p>
              ) : null}
            </div>
          ) : null}

          {showDraftCta ? (
            <div className="visual-qa__draft-cta-row">
              <button
                type="button"
                onClick={onMakeDraft}
                data-testid={`visual-qa-draft-cta-${missionId}`}
                className="visual-qa__draft-cta"
                disabled={!!draft}
                title={
                  draft
                    ? "초안이 이미 만들어졌습니다 — 아래에서 확인하세요."
                    : "Visual QA 결과를 파일별 수정 후보 초안으로 정리합니다. 실제 파일 수정/PR은 하지 않습니다."
                }
              >
                <FileEdit size={12} /> {draft ? "수정안 초안 보기" : "수정안 초안 만들기"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <div className="visual-qa__draft" data-testid={`visual-qa-draft-${missionId}`} data-status={draft.status}>
          <div className="visual-qa__draft-head">
            <Sparkles size={12} /> <strong>수정안 초안</strong>
            <span className="visual-qa__draft-summary">{draft.summary}</span>
          </div>
          <p className="visual-qa__draft-notice">
            자동 적용/자동 scaffold refresh/자동 PR은 하지 않습니다. 아래를 확인 후 직접 적용하세요.
          </p>
          {draft.fileSuggestions.length > 0 ? (
            <ul className="visual-qa__draft-files">
              {draft.fileSuggestions.map((s) => (
                <li key={s.file} data-testid={`visual-qa-draft-file-${missionId}-${s.file}`}>
                  <code>{s.file}</code>
                  <span className="visual-qa__draft-kinds">
                    {s.kindHints
                      .map((k) => DESIGN_ISSUE_KIND_LABEL[k as DesignIssueKind] ?? k)
                      .join(" · ")}
                  </span>
                  <span className="visual-qa__draft-what">→ {s.what}</span>
                  <span className="visual-qa__draft-why">{s.why}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {draft.unmappedIssues.length > 0 ? (
            <div className="visual-qa__draft-unmapped" data-testid={`visual-qa-draft-unmapped-${missionId}`}>
              <strong>분류 불가 ({draft.unmappedIssues.length}건)</strong> — 추측 없이 그대로 노출합니다.
              <ul>
                {draft.unmappedIssues.map((u) => (
                  <li key={u.id}>
                    <span>[{u.kind}]</span> <span>{u.summary}</span>
                    {u.recommendation ? <span>→ {u.recommendation}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
