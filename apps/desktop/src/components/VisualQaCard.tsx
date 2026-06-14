import { useEffect, useState, useMemo } from "react";
import { Eye, AlertTriangle, FileEdit, Sparkles, Check, RefreshCw, ShieldCheck } from "lucide-react";
import type {
  DesignIssueCard,
  DesignIssueKind,
  MissionScaffoldLatestSafeFile,
  VisualQaReport,
} from "@ai-orchestrator/protocol";
import {
  postDgxMissionScaffoldOverlay,
  runDgxMissionPreviewScaffold,
  runDgxVisualQa,
} from "../runtime/stage47MissionServer";
import {
  buildAppFixDraftFromVisualQa,
  buildAppFixPatches,
  DESIGN_ISSUE_KIND_LABEL,
  type AppFixDraft,
  type AppFixPatch,
} from "../lib/appFixDraft";
import { buildVisualQaDiff, type VisualQaDiff } from "../lib/visualQaDiff";
import type { MissionVisualQaSummary } from "../lib/missionBoardModel";
import { VisualEvidenceCard } from "./VisualEvidenceCard";

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
  currentScaffoldFiles,
  serverBaseUrl,
  fetchImpl,
  onContextEvent,
  onRefreshScaffold,
  onNavigate,
  onStateChange,
}: {
  missionId: string;
  workspaceId?: string;
  /** Preview Run vertical이 observed running으로 만든 URL. 없으면 CTA disabled. */
  previewUrl?: string;
  /** 보드에 이미 기록된 직전 Visual QA 요약(서버 사이드). 없으면 첫 실행 전 상태. */
  latestSummary?: MissionVisualQaSummary;
  /** scaffold/latest로 받은 현재 파일들 — AppFix patch 미리보기 계산에 사용. */
  currentScaffoldFiles?: ReadonlyArray<Pick<MissionScaffoldLatestSafeFile, "path" | "content">>;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
  /** overlay 적용 후 scaffold/latest 캐시를 무효화시킬 콜백(있으면 호출). */
  onRefreshScaffold?: (missionId: string) => void;
  /** Evidence readiness CTA가 가야 할 target — Mission Workspace의 Router가 처리. */
  onNavigate?: (target: "publish" | "fix" | "preview" | "qa") => void;
  /** 카드 내부 상태 변화를 부모(StatusBar 계산용)에 알린다. 자동 실행 0 — read-only mirror. */
  onStateChange?: (state: {
    qaReport?: VisualQaReport;
    verifyDiff?: VisualQaDiff;
    verifyFailedStep?: "preview" | "qa";
    fixApplied?: boolean;
  }) => void;
}) {
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  /** 사용자가 "수정안 초안 만들기"를 눌렀는지(한 번 누르면 trace + 패널 열림). */
  const [draft, setDraft] = useState<AppFixDraft | undefined>(undefined);
  /** 사용자가 파일별로 적용 포함/제외할 선택 — 기본은 patch.applied=true인 파일만 on. */
  const [includeByFile, setIncludeByFile] = useState<Record<string, boolean>>({});
  type ApplyState =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "recorded"; appliedPaths: string[] }
    | { kind: "error"; message: string };
  const [applyState, setApplyState] = useState<ApplyState>({ kind: "idle" });
  /** Fix Verification Loop: 적용 직전 시점의 report를 baseline으로 잡아 둔다. */
  const [baselineReport, setBaselineReport] = useState<VisualQaReport | undefined>(undefined);
  type VerifyState =
    | { kind: "idle" }
    | { kind: "running"; step: "preview" | "qa" }
    | { kind: "preview_failed"; message: string }
    | { kind: "qa_failed"; message: string }
    | { kind: "diff"; diff: VisualQaDiff; afterReport: VisualQaReport };
  const [verify, setVerify] = useState<VerifyState>({ kind: "idle" });
  const busy = run.kind === "running";
  const canRun = !!previewUrl && !!workspaceId && !busy;

  /** draft + current files → patches. memo로 캐시. */
  const patches: AppFixPatch[] = useMemo(() => {
    if (!draft || draft.status !== "has_fixes") return [];
    return buildAppFixPatches(draft, currentScaffoldFiles ?? []);
  }, [draft, currentScaffoldFiles]);

  /** 사용자가 처음 draft를 만든 직후 패치 가능한 파일만 자동 선택. */
  const ensureDefaultSelection = (next: AppFixPatch[]) => {
    setIncludeByFile((prev) => {
      const merged = { ...prev };
      for (const p of next) {
        if (!(p.file in merged)) merged[p.file] = p.applied;
      }
      return merged;
    });
  };

  const includedCount = patches.filter((p) => includeByFile[p.file] && p.applied).length;
  const canApply = applyState.kind === "idle" && includedCount > 0 && !!workspaceId;

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
    setApplyState({ kind: "idle" });
    // 초기 선택을 즉시 계산 — useEffect를 안 쓰는 이유는 patch 계산이 useMemo로 동기이기 때문.
    const nextPatches = fix.status === "has_fixes" ? buildAppFixPatches(fix, currentScaffoldFiles ?? []) : [];
    ensureDefaultSelection(nextPatches);
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

  const onToggleInclude = (file: string) => {
    setIncludeByFile((prev) => ({ ...prev, [file]: !prev[file] }));
  };

  /** 사용자 명시 클릭으로만 호출 — scaffold overlay POST. 자동 적용 X. */
  const onApplySelected = async () => {
    if (!canApply) return;
    const selected = patches.filter((p) => includeByFile[p.file] && p.applied);
    if (selected.length === 0) return;
    setApplyState({ kind: "running" });
    onContextEvent?.("appfix.patch.requested", {
      missionId,
      workspaceId,
      fileCount: selected.length,
      paths: selected.map((p) => p.file),
      ts: new Date().toISOString(),
    });
    try {
      const res = await postDgxMissionScaffoldOverlay({
        missionId,
        request: {
          source: "appfix",
          files: selected.map((p) => ({ path: p.file, content: p.newContent })),
          evidenceRef: run.kind === "report" ? run.report.id : undefined,
        },
        serverBaseUrl,
        fetchImpl,
      });
      if (res.outcome === "recorded") {
        const appliedPaths = selected.map((p) => p.file);
        setApplyState({ kind: "recorded", appliedPaths });
        // 적용 직전 report를 baseline으로 — 이후 "수정 검증"이 before로 사용.
        if (run.kind === "report") setBaselineReport(run.report);
        setVerify({ kind: "idle" });
        onContextEvent?.("appfix.patch.applied", {
          missionId,
          workspaceId,
          fileCount: appliedPaths.length,
          paths: appliedPaths,
          overlayId: res.overlay?.id,
          ts: new Date().toISOString(),
        });
        // scaffold/latest 캐시 invalidate(있을 때만 — 자동 실행 X).
        onRefreshScaffold?.(missionId);
      } else {
        setApplyState({ kind: "error", message: res.message ?? res.outcome });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      setApplyState({ kind: "error", message });
    }
  };

  /**
   * Fix Verification Loop — patch 적용 후 사용자 클릭에서만 실행:
   *   1) /preview/run-scaffold(overlay 반영본으로 다시 띄움) → observed 아니면 preview_failed.
   *   2) 새 workspaceId로 /visual-qa rerun → 실패 시 qa_failed.
   *   3) baselineReport vs 새 report → buildVisualQaDiff → "diff" 패널 표시.
   * GitHub write/자동 patch/자동 publish 0.
   */
  const canVerify = applyState.kind === "recorded" && verify.kind !== "running" && !!baselineReport;
  const onVerifyFix = async () => {
    if (!canVerify || !baselineReport) return;
    setVerify({ kind: "running", step: "preview" });
    onContextEvent?.("mission.fix_verification.requested", {
      missionId,
      workspaceId,
      baselineReportId: baselineReport.id,
      ts: new Date().toISOString(),
    });
    let newWorkspaceId: string | undefined;
    try {
      const previewRes = await runDgxMissionPreviewScaffold({
        missionId,
        serverBaseUrl,
        fetchImpl,
        body: { host: "127.0.0.1" },
      });
      if (previewRes.outcome !== "observed" || !previewRes.workspaceId) {
        const message = previewRes.message ?? `preview ${previewRes.outcome}`;
        setVerify({ kind: "preview_failed", message });
        onContextEvent?.("mission.fix_verification.failed", {
          missionId, step: "preview", reason: previewRes.outcome, summary: message, ts: new Date().toISOString(),
        });
        return;
      }
      newWorkspaceId = previewRes.workspaceId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      setVerify({ kind: "preview_failed", message });
      onContextEvent?.("mission.fix_verification.failed", { missionId, step: "preview", summary: message, ts: new Date().toISOString() });
      return;
    }
    setVerify({ kind: "running", step: "qa" });
    try {
      const qaRes = await runDgxVisualQa({
        missionId,
        workspaceId: newWorkspaceId,
        serverBaseUrl,
        fetchImpl,
      });
      const diff = buildVisualQaDiff(baselineReport, qaRes.report);
      setVerify({ kind: "diff", diff, afterReport: qaRes.report });
      // 새 후속 단계에서 또 적용한다면, 다음 baseline은 이 새 report.
      setRun({ kind: "report", report: qaRes.report });
      onContextEvent?.("mission.fix_verification.observed", {
        missionId,
        workspaceId: newWorkspaceId,
        diffStatus: diff.status,
        resolved: diff.counts.resolved,
        remaining: diff.counts.remaining,
        new: diff.counts.new,
        before: diff.counts.before,
        after: diff.counts.after,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      setVerify({ kind: "qa_failed", message });
      onContextEvent?.("mission.fix_verification.failed", { missionId, step: "qa", summary: message, ts: new Date().toISOString() });
    }
  };

  const report = run.kind === "report" ? run.report : undefined;
  const consoleErrors = report
    ? report.issues.filter((i): i is DesignIssueCard & { kind: "console_error" } => i.kind === "console_error")
    : [];
  const otherIssues = report ? report.issues.filter((i) => i.kind !== "console_error") : [];
  const showDraftCta = report && (report.status === "warning" || report.status === "failed");

  /** verify 단계가 실패했으면 어떤 단계인지 — VisualEvidenceCard에 readiness 계산용. */
  const verifyFailedStep = verify.kind === "preview_failed"
    ? ("preview" as const)
    : verify.kind === "qa_failed"
      ? ("qa" as const)
      : undefined;

  /** 상태 mirror — 부모(StatusBar)에 변화가 있을 때만 알린다. 자동 실행 0. */
  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({
      qaReport: verify.kind === "diff" ? verify.afterReport : run.kind === "report" ? run.report : undefined,
      verifyDiff: verify.kind === "diff" ? verify.diff : undefined,
      verifyFailedStep,
      fixApplied: applyState.kind === "recorded",
    });
  }, [onStateChange, run, verify, applyState, verifyFailedStep]);
  /** Evidence Card에 보여줄 최신 report — verify 후의 결과가 우선. */
  const evidenceReport = verify.kind === "diff" ? verify.afterReport : run.kind === "report" ? run.report : undefined;
  const evidenceDiff = verify.kind === "diff" ? verify.diff : undefined;

  return (
    <div
      className="visual-qa"
      data-testid={`visual-qa-${missionId}`}
      data-state={run.kind}
    >
      {/* Visual Evidence Card — preview/QA/delta/console/screenshot/readiness를 한 화면에. */}
      <VisualEvidenceCard
        missionId={missionId}
        previewUrl={previewUrl}
        latestReport={evidenceReport}
        latestDiff={evidenceDiff}
        verifyFailedStep={verifyFailedStep}
        onContextEvent={onContextEvent}
        onNavigate={onNavigate}
      />

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

          {/* Patch preview + 적용 CTA — 결정적 규칙으로 만든 patch만 보여주고, 사용자가 파일별로 선택. */}
          {patches.length > 0 ? (
            <div className="visual-qa__patch" data-testid={`visual-qa-patch-${missionId}`}>
              <div className="visual-qa__patch-head">
                <FileEdit size={12} /> <strong>파일별 수정 patch 미리보기</strong>
                <span className="visual-qa__patch-summary">
                  {patches.filter((p) => p.applied).length}/{patches.length}개 자동 적용 가능 · 선택 {includedCount}
                </span>
              </div>
              <ul className="visual-qa__patch-files">
                {patches.map((p) => {
                  const id = `visual-qa-patch-${missionId}-${p.file}`;
                  const isChecked = !!includeByFile[p.file] && p.applied;
                  return (
                    <li key={p.file} data-testid={id} data-applied={p.applied ? "true" : "false"}>
                      <label className="visual-qa__patch-label">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!p.applied || applyState.kind === "running" || applyState.kind === "recorded"}
                          onChange={() => onToggleInclude(p.file)}
                          data-testid={`${id}-include`}
                          aria-label={`include patch for ${p.file}`}
                        />
                        <code>{p.file}</code>
                        <span className="visual-qa__patch-kinds">
                          {p.kindHints.map((k) => DESIGN_ISSUE_KIND_LABEL[k] ?? k).join(" · ")}
                        </span>
                        <span className={p.applied ? "visual-qa__patch-note visual-qa__patch-note--ok" : "visual-qa__patch-note visual-qa__patch-note--skip"}>
                          {p.applied ? p.note : `미적용 — ${p.note}`}
                        </span>
                      </label>
                      {p.applied ? (
                        <details className="visual-qa__patch-diff" data-testid={`${id}-diff`}>
                          <summary>변경 요약 보기</summary>
                          <p className="visual-qa__patch-rule-summary">{p.note}</p>
                          <p className="visual-qa__patch-size">
                            크기: {p.oldContent.length} → {p.newContent.length} chars
                          </p>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="visual-qa__patch-actions">
                <button
                  type="button"
                  onClick={onApplySelected}
                  disabled={!canApply}
                  data-testid={`visual-qa-patch-apply-${missionId}`}
                  className={canApply ? "visual-qa__patch-apply" : "visual-qa__patch-apply visual-qa__patch-apply--disabled"}
                  title={
                    applyState.kind === "recorded"
                      ? "이미 적용됨 — Preview를 다시 실행해 결과를 확인하세요."
                      : applyState.kind === "running"
                        ? "적용 중…"
                        : includedCount === 0
                          ? "선택된 파일이 없습니다."
                          : `선택한 ${includedCount}개 파일을 scaffold overlay로 저장합니다 (GitHub 전송 X, 자동 PR X).`
                  }
                >
                  {applyState.kind === "running"
                    ? "적용 중…"
                    : applyState.kind === "recorded"
                      ? "수정안 적용됨"
                      : `선택한 ${includedCount}개 수정 적용`}
                </button>
                {applyState.kind === "recorded" ? (
                  <span className="visual-qa__patch-applied" data-testid={`visual-qa-patch-applied-${missionId}`}>
                    <Check size={12} /> 수정안 적용됨 · preview 재실행 필요 ({applyState.appliedPaths.length}개 파일)
                  </span>
                ) : null}
                {applyState.kind === "recorded" ? (
                  <span className="visual-qa__patch-rerun-hint" data-testid={`visual-qa-patch-rerun-hint-${missionId}`}>
                    <RefreshCw size={12} /> Mission Workspace의 "Preview 실행"을 다시 눌러 변경을 확인하세요.
                  </span>
                ) : null}
                {applyState.kind === "error" ? (
                  <span className="visual-qa__patch-error" data-testid={`visual-qa-patch-error-${missionId}`}>
                    적용 실패 — {applyState.message}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Fix Verification Loop — patch 적용 후만 CTA 표시. preview rerun → Visual QA rerun → before/after diff. */}
      {applyState.kind === "recorded" && baselineReport ? (
        <div className="visual-qa__verify" data-testid={`visual-qa-verify-${missionId}`} data-state={verify.kind}>
          <div className="visual-qa__verify-head">
            <ShieldCheck size={12} />
            <strong>수정 검증</strong>
            <button
              type="button"
              onClick={onVerifyFix}
              disabled={!canVerify}
              data-testid={`visual-qa-verify-cta-${missionId}`}
              className={canVerify ? "visual-qa__verify-cta" : "visual-qa__verify-cta visual-qa__verify-cta--disabled"}
              title={
                verify.kind === "running"
                  ? "preview 재실행 → Visual QA 재실행 → before/after 비교"
                  : "scaffold overlay를 반영한 preview를 다시 띄우고 Visual QA를 재실행해 issue가 줄었는지 확인합니다. GitHub 전송/PR/자동 수정 없음."
              }
            >
              {verify.kind === "running" && verify.step === "preview"
                ? "preview 다시 띄우는 중…"
                : verify.kind === "running" && verify.step === "qa"
                  ? "Visual QA 재실행 중…"
                  : "수정 검증 실행"}
            </button>
          </div>

          {verify.kind === "preview_failed" ? (
            <p className="visual-qa__verify-error" data-testid={`visual-qa-verify-preview-failed-${missionId}`}>
              preview 재실행 실패 — {verify.message} (Visual QA 재실행은 시도하지 않았습니다)
            </p>
          ) : null}

          {verify.kind === "qa_failed" ? (
            <p className="visual-qa__verify-error" data-testid={`visual-qa-verify-qa-failed-${missionId}`}>
              Visual QA 재실행 실패 — {verify.message}
            </p>
          ) : null}

          {verify.kind === "diff" ? (
            <div className="visual-qa__verify-diff" data-status={verify.diff.status} data-testid={`visual-qa-verify-diff-${missionId}`}>
              <div className="visual-qa__verify-summary">
                <span
                  className={`visual-qa__verify-badge visual-qa__verify-badge--${verify.diff.status}`}
                  data-testid={`visual-qa-verify-status-${missionId}`}
                >
                  {verify.diff.status === "passed"
                    ? "수정 검증 통과"
                    : verify.diff.status === "improved"
                      ? "개선됨 · 추가 수정 필요"
                      : verify.diff.status === "regressed"
                        ? "악화 · 추가 수정 필요"
                        : verify.diff.status === "no_change"
                          ? "변화 없음 · 추가 수정 필요"
                          : "비교 불가"}
                </span>
                <span className="visual-qa__verify-counts" data-testid={`visual-qa-verify-counts-${missionId}`}>
                  before {verify.diff.counts.before} → after {verify.diff.counts.after} · 해결 {verify.diff.counts.resolved} · 남음 {verify.diff.counts.remaining} · 새로 {verify.diff.counts.new}
                </span>
              </div>
              {verify.diff.resolved.length > 0 ? (
                <details className="visual-qa__verify-section" data-testid={`visual-qa-verify-resolved-${missionId}`}>
                  <summary>해결됨 ({verify.diff.resolved.length})</summary>
                  <ul>
                    {verify.diff.resolved.slice(0, 10).map((i) => (
                      <li key={i.id}>
                        <span>[{DESIGN_ISSUE_KIND_LABEL[i.kind as DesignIssueKind] ?? i.kind}]</span>{" "}
                        <span>{i.summary}</span>
                      </li>
                    ))}
                    {verify.diff.resolved.length > 10 ? <li>… 외 {verify.diff.resolved.length - 10}건</li> : null}
                  </ul>
                </details>
              ) : null}
              {verify.diff.remaining.length > 0 ? (
                <details className="visual-qa__verify-section" data-testid={`visual-qa-verify-remaining-${missionId}`} open>
                  <summary>아직 남음 ({verify.diff.remaining.length})</summary>
                  <ul>
                    {verify.diff.remaining.slice(0, 10).map((i) => (
                      <li key={i.id}>
                        <span>[{DESIGN_ISSUE_KIND_LABEL[i.kind as DesignIssueKind] ?? i.kind}]</span>{" "}
                        <span>{i.summary}</span>
                      </li>
                    ))}
                    {verify.diff.remaining.length > 10 ? <li>… 외 {verify.diff.remaining.length - 10}건</li> : null}
                  </ul>
                </details>
              ) : null}
              {verify.diff.newIssues.length > 0 ? (
                <details className="visual-qa__verify-section" data-testid={`visual-qa-verify-new-${missionId}`} open>
                  <summary>새로 생김 ({verify.diff.newIssues.length})</summary>
                  <ul>
                    {verify.diff.newIssues.slice(0, 10).map((i) => (
                      <li key={i.id}>
                        <span>[{DESIGN_ISSUE_KIND_LABEL[i.kind as DesignIssueKind] ?? i.kind}]</span>{" "}
                        <span>{i.summary}</span>
                      </li>
                    ))}
                    {verify.diff.newIssues.length > 10 ? <li>… 외 {verify.diff.newIssues.length - 10}건</li> : null}
                  </ul>
                </details>
              ) : null}
              <p className="visual-qa__verify-notice">
                자동 GitHub write/자동 patch 추가 적용 0. 남은 이슈는 다시 "수정안 초안 만들기"로 시작하세요.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
