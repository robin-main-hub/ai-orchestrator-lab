import { CheckCircle2, AlertTriangle, ShieldAlert, Image as ImageIcon, ExternalLink } from "lucide-react";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import { buildVisualEvidence, type VisualEvidence, type PublishReadiness } from "../lib/visualEvidence";
import type { VisualQaDiff } from "../lib/visualQaDiff";

/**
 * Visual Evidence Card — Mission Workspace에 publish 판단을 한 화면에 묶는다.
 *
 *   - Preview URL(있을 때만, 가짜 X)
 *   - Visual QA status + truth
 *   - before/after issue delta(verify diff가 있을 때만)
 *   - console errors 최대 3개 — 전문 dump 금지
 *   - screenshot 또는 "없음" 정직 안내
 *   - publish readiness: ready / needs_fix / blocked
 *   - 다음 행동 CTA(읽기 전용 trace만 — 자동 publish/자동 수정 0)
 */

const READINESS_LABEL: Record<PublishReadiness, string> = {
  ready: "Publish 진행 가능",
  needs_fix: "추가 수정 필요",
  blocked: "검증 차단",
};

const READINESS_ICON: Record<PublishReadiness, React.ComponentType<{ size?: number }>> = {
  ready: CheckCircle2,
  needs_fix: AlertTriangle,
  blocked: ShieldAlert,
};

export function VisualEvidenceCard({
  missionId,
  previewUrl,
  latestReport,
  latestDiff,
  verifyFailedStep,
  onContextEvent,
}: {
  missionId: string;
  previewUrl?: string;
  latestReport?: VisualQaReport;
  latestDiff?: VisualQaDiff;
  verifyFailedStep?: "preview" | "qa";
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const evidence: VisualEvidence = buildVisualEvidence({
    previewUrl,
    report: latestReport,
    diff: latestDiff,
    verifyFailedStep,
  });
  const ReadinessIcon = READINESS_ICON[evidence.readiness];

  const onPublishReady = () => {
    onContextEvent?.("mission.visual_evidence.publish_ready_clicked", {
      missionId,
      readiness: evidence.readiness,
      summary: evidence.summary,
      ts: new Date().toISOString(),
    });
  };
  const onAddressFixes = () => {
    onContextEvent?.("mission.visual_evidence.needs_fix_clicked", {
      missionId,
      remaining: evidence.diff?.counts.remaining ?? 0,
      newIssues: evidence.diff?.counts.new ?? 0,
      ts: new Date().toISOString(),
    });
  };
  const onRerunRequired = () => {
    onContextEvent?.("mission.visual_evidence.blocked_clicked", {
      missionId,
      verifyFailedStep: verifyFailedStep,
      qaStatus: latestReport?.status,
      ts: new Date().toISOString(),
    });
  };

  return (
    <div
      className="visual-evidence"
      data-testid={`visual-evidence-${missionId}`}
      data-readiness={evidence.readiness}
    >
      <div className="visual-evidence__head">
        <ReadinessIcon size={14} />
        <strong data-testid={`visual-evidence-readiness-${missionId}`}>
          {READINESS_LABEL[evidence.readiness]}
        </strong>
        <span className="visual-evidence__summary">{evidence.summary}</span>
      </div>

      <ul className="visual-evidence__rows">
        {/* preview row */}
        <li className="visual-evidence__row">
          <span className="visual-evidence__label">Preview</span>
          {evidence.previewUrl ? (
            <a
              href={evidence.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="visual-evidence__link"
              data-testid={`visual-evidence-preview-link-${missionId}`}
            >
              {evidence.previewUrl} <ExternalLink size={10} />
            </a>
          ) : (
            <span className="visual-evidence__muted" data-testid={`visual-evidence-preview-none-${missionId}`}>
              없음 — Preview 실행이 필요합니다(fake URL 표시 X).
            </span>
          )}
        </li>

        {/* QA status row */}
        <li className="visual-evidence__row">
          <span className="visual-evidence__label">Visual QA</span>
          {evidence.qaStatus ? (
            <span data-testid={`visual-evidence-qa-status-${missionId}`}>
              {evidence.qaStatus} · {evidence.qaTruth}
              {(latestReport?.issues ?? []).length > 0 ? ` · 이슈 ${(latestReport?.issues ?? []).length}건` : null}
            </span>
          ) : (
            <span className="visual-evidence__muted" data-testid={`visual-evidence-qa-none-${missionId}`}>
              아직 실행 안 됨 — Visual QA 실행이 필요합니다.
            </span>
          )}
        </li>

        {/* before/after delta row(diff 있을 때만) */}
        {evidence.diff ? (
          <li className="visual-evidence__row" data-testid={`visual-evidence-delta-${missionId}`}>
            <span className="visual-evidence__label">Before/After</span>
            <span>
              {evidence.diff.summary} · before {evidence.diff.counts.before} → after {evidence.diff.counts.after}
            </span>
          </li>
        ) : null}

        {/* console summary row */}
        <li className="visual-evidence__row" data-testid={`visual-evidence-console-${missionId}`}>
          <span className="visual-evidence__label">Console</span>
          {evidence.consoleTotal === 0 ? (
            <span className="visual-evidence__muted">에러 없음.</span>
          ) : (
            <div className="visual-evidence__console-body">
              <span>
                총 {evidence.consoleTotal}건
                {evidence.consoleTotal > evidence.consolePreview.length
                  ? ` (미리보기 ${evidence.consolePreview.length}건 — 나머지는 trace에서 확인)`
                  : ""}
              </span>
              <ul className="visual-evidence__console-list">
                {evidence.consolePreview.map((line) => (
                  <li key={line.id}>
                    <span className="visual-evidence__console-severity">{line.severity}</span>
                    <span>{line.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>

        {/* screenshot row */}
        <li className="visual-evidence__row visual-evidence__row--screenshot">
          <span className="visual-evidence__label">
            <ImageIcon size={11} /> Screenshot
          </span>
          {evidence.screenshot ? (
            <span data-testid={`visual-evidence-screenshot-${missionId}`}>
              참조: <code>{evidence.screenshot.ref}</code>{" "}
              <span className="visual-evidence__muted">({evidence.screenshot.source} 소스)</span>
            </span>
          ) : (
            <span className="visual-evidence__muted" data-testid={`visual-evidence-screenshot-none-${missionId}`}>
              screenshot 없음 — runner가 evidenceRef를 제공하지 않았습니다(fake 이미지 표시 X).
            </span>
          )}
        </li>
      </ul>

      <div className="visual-evidence__actions">
        {evidence.readiness === "ready" ? (
          <button
            type="button"
            onClick={onPublishReady}
            data-testid={`visual-evidence-publish-ready-cta-${missionId}`}
            className="visual-evidence__cta visual-evidence__cta--ready"
            title="아래 Publish Panel에서 branch → file → PR로 진행하세요. 자동 publish는 하지 않습니다."
          >
            Publish로 진행
          </button>
        ) : evidence.readiness === "needs_fix" ? (
          <button
            type="button"
            onClick={onAddressFixes}
            data-testid={`visual-evidence-needs-fix-cta-${missionId}`}
            className="visual-evidence__cta visual-evidence__cta--needs-fix"
            title="Visual QA 카드의 '수정안 초안 만들기'에서 다음 라운드를 시작하세요. 자동 수정은 하지 않습니다."
          >
            추가 수정 필요
          </button>
        ) : (
          <button
            type="button"
            onClick={onRerunRequired}
            data-testid={`visual-evidence-blocked-cta-${missionId}`}
            className="visual-evidence__cta visual-evidence__cta--blocked"
            title="Preview 실행 또는 Visual QA 실행을 다시 시도해야 합니다."
          >
            Preview/QA 재실행 필요
          </button>
        )}
      </div>
    </div>
  );
}
