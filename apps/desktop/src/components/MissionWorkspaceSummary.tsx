import { ExternalLink } from "lucide-react";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "../lib/visualQaDiff";
import { computePublishReadiness } from "../lib/visualEvidence";

/**
 * Mission Workspace 요약 — 한 화면에 "지금 어떤 앱인지 / 어디까지 와 있는지"를 한 줄씩 보여준다.
 * 다음 액션 CTA는 MissionWorkspaceStatusBar가 담당 — 이건 정보만.
 *
 * 정직성:
 *   - preview URL은 observed일 때만 링크. 없으면 "—" 또는 "Preview 미실행".
 *   - QA/verify는 알 수 없는 상태면 "—".
 *   - 자동 실행 0 — read-only.
 */

export function MissionWorkspaceSummary({
  missionId,
  title,
  previewUrl,
  qaReport,
  fixApplied,
  verifyDiff,
  verifyFailedStep,
}: {
  missionId: string;
  title?: string;
  previewUrl?: string;
  qaReport?: VisualQaReport;
  fixApplied: boolean;
  verifyDiff?: VisualQaDiff;
  verifyFailedStep?: "preview" | "qa";
}) {
  const { readiness } = computePublishReadiness({
    previewUrl,
    report: qaReport,
    diff: verifyDiff,
    verifyFailedStep,
  });
  const qaLabel = qaReport
    ? `${qaReport.status} · ${qaReport.truthStatus}${qaReport.issues.length > 0 ? ` · ${qaReport.issues.length}건` : ""}`
    : "—";
  const verifyLabel = verifyFailedStep
    ? `${verifyFailedStep} 실패`
    : verifyDiff
      ? `${verifyDiff.status} · 해결 ${verifyDiff.counts.resolved}/남음 ${verifyDiff.counts.remaining}/새로 ${verifyDiff.counts.new}`
      : fixApplied
        ? "검증 대기"
        : "—";
  const readinessLabel =
    readiness === "ready"
      ? "Publish 진행 가능"
      : readiness === "needs_fix"
        ? "추가 수정 필요"
        : "검증 차단";
  return (
    <dl
      className="mws-summary"
      data-testid={`mws-summary-${missionId}`}
      data-readiness={readiness}
      aria-label="Mission summary"
    >
      <div className="mws-summary__row">
        <dt className="mws-summary__label">App</dt>
        <dd data-testid={`mws-summary-app-${missionId}`}>{title?.trim() ? title : "(제목 없음)"}</dd>
      </div>
      <div className="mws-summary__row">
        <dt className="mws-summary__label">Preview</dt>
        <dd>
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`mws-summary-preview-${missionId}`}
              className="mws-summary__link"
            >
              {previewUrl} <ExternalLink size={10} />
            </a>
          ) : (
            <span className="mws-summary__muted" data-testid={`mws-summary-preview-none-${missionId}`}>
              미실행
            </span>
          )}
        </dd>
      </div>
      <div className="mws-summary__row">
        <dt className="mws-summary__label">QA</dt>
        <dd data-testid={`mws-summary-qa-${missionId}`}>{qaLabel}</dd>
      </div>
      <div className="mws-summary__row">
        <dt className="mws-summary__label">Fix</dt>
        <dd data-testid={`mws-summary-fix-${missionId}`}>{fixApplied ? "적용됨" : "—"}</dd>
      </div>
      <div className="mws-summary__row">
        <dt className="mws-summary__label">Verify</dt>
        <dd data-testid={`mws-summary-verify-${missionId}`}>{verifyLabel}</dd>
      </div>
      <div className="mws-summary__row">
        <dt className="mws-summary__label">Readiness</dt>
        <dd data-testid={`mws-summary-readiness-${missionId}`}>{readinessLabel}</dd>
      </div>
    </dl>
  );
}
