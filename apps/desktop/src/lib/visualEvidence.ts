import type { DesignIssueCard, VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "./visualQaDiff";

/**
 * Visual Evidence Card vertical — Mission Workspace에 publish 판단을 위한 단일 카드로 묶는다.
 *
 * 정직성:
 *   - screenshot은 실제 reference가 있을 때만 표시. 없으면 "screenshot 없음 / runner가 제공하지
 *     않음"으로 정직 안내(fake 이미지 금지).
 *   - console summary는 최대 3개. 그 이상은 "전문은 trace 확인" 정도로만 안내(full dump 금지).
 *   - publish readiness는 결정적: passed+no_new → ready, remaining/new → needs_fix,
 *     preview/qa 실패 → blocked. 그 외 의심 상태는 needs_fix로 보수적으로 둔다.
 *   - 자동 publish/자동 수정 0 — readiness는 사용자가 다음에 뭘 누를지 추천만 한다.
 */

export type PublishReadiness =
  /** QA가 passed이고 verify 후 new issue도 없음 — publish 진행 권장. */
  | "ready"
  /** 남은 이슈 또는 새로 생긴 이슈가 있어 추가 수정 필요. */
  | "needs_fix"
  /** preview observed 없음 / Visual QA 실패 — 다시 띄우거나 다시 검사 필요. */
  | "blocked";

export type EvidenceConsoleLine = {
  id: string;
  severity: DesignIssueCard["severity"];
  summary: string;
};

export type EvidenceScreenshot = {
  /** evidenceRef 그대로(외부 fetch 책임은 호출자). */
  ref: string;
  /** 어떤 출처에서 발견했는지 — check/issue/unknown. */
  source: "check" | "issue";
};

export type VisualEvidence = {
  readiness: PublishReadiness;
  /** 한 줄 요약(카드 헤더에 표시). */
  summary: string;
  /** preview URL. observed 아니면 undefined. */
  previewUrl?: string;
  /** Visual QA 최신 report 상태(있을 때만). */
  qaStatus?: VisualQaReport["status"];
  qaTruth?: VisualQaReport["truthStatus"];
  /** Visual QA verify diff(있을 때만). */
  diff?: VisualQaDiff;
  /** console error 미리보기 최대 3개. */
  consolePreview: EvidenceConsoleLine[];
  /** console error 총 개수(미리보기 잘리기 전). */
  consoleTotal: number;
  /** screenshot reference(있을 때만). 없으면 undefined → "없음" 안내. */
  screenshot?: EvidenceScreenshot;
};

const CONSOLE_PREVIEW_LIMIT = 3;

/** Visual QA report에서 screenshot 참조를 결정적으로 추출. 없으면 undefined. */
export function extractScreenshotRef(report: VisualQaReport | undefined): EvidenceScreenshot | undefined {
  if (!report) return undefined;
  const isImageRef = (ref: string | undefined): ref is string => {
    if (!ref) return false;
    return /\.(png|jpe?g|webp|gif)(\?|#|$)|screenshot|image|\/snap\//i.test(ref);
  };
  // checks(주로 browser-tier에서 evidenceRef로 screenshot path를 남김) 우선.
  for (const check of report.checks ?? []) {
    if (isImageRef(check.evidenceRef)) {
      return { ref: check.evidenceRef!, source: "check" };
    }
  }
  for (const issue of report.issues ?? []) {
    if (isImageRef(issue.evidenceRef)) {
      return { ref: issue.evidenceRef!, source: "issue" };
    }
  }
  return undefined;
}

/** console_error issue 중 severity 우선순위로 최대 3개. */
export function extractConsoleSummary(report: VisualQaReport | undefined, limit: number = CONSOLE_PREVIEW_LIMIT): {
  preview: EvidenceConsoleLine[];
  total: number;
} {
  if (!report) return { preview: [], total: 0 };
  const errors = (report.issues ?? []).filter((i) => i.kind === "console_error");
  const severityRank: Record<DesignIssueCard["severity"], number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...errors].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return {
    total: errors.length,
    preview: sorted.slice(0, limit).map((i) => ({
      id: i.id,
      severity: i.severity,
      summary: i.summary,
    })),
  };
}

/**
 * 입력 상태 → publish readiness. 보수적: ambiguous한 경우 needs_fix(자동 ready 금지).
 *   - preview 없음 → blocked.
 *   - QA report 없음 → blocked(검사 필요).
 *   - QA report 있고 status="passed" + (diff 없으면 0 new로 간주) + diff의 new=0 → ready.
 *   - diff.new>0 또는 remaining>0 → needs_fix.
 *   - QA report.status="failed"|"warning" + diff 없음 → needs_fix.
 *   - QA report.status="blocked" → blocked.
 *   - verify 단계 실패(preview_failed/qa_failed) → blocked.
 */
export function computePublishReadiness(input: {
  previewUrl?: string;
  report?: VisualQaReport;
  diff?: VisualQaDiff;
  /** verify 단계가 실패했음을 카드가 알리는 시그널. */
  verifyFailedStep?: "preview" | "qa";
}): { readiness: PublishReadiness; reason: string } {
  if (input.verifyFailedStep === "preview") {
    return { readiness: "blocked", reason: "preview 재실행이 실패해 다시 검증할 수 없습니다." };
  }
  if (input.verifyFailedStep === "qa") {
    return { readiness: "blocked", reason: "Visual QA 재실행이 실패해 검증 결과를 확인할 수 없습니다." };
  }
  if (!input.previewUrl) {
    return { readiness: "blocked", reason: "preview URL이 없습니다 — Preview 실행이 필요합니다." };
  }
  const report = input.report;
  if (!report) {
    return { readiness: "blocked", reason: "Visual QA 결과가 없습니다 — Visual QA 실행이 필요합니다." };
  }
  if (report.status === "blocked") {
    return { readiness: "blocked", reason: "Visual QA가 blocked 상태 — observed preview가 필요합니다." };
  }
  const diff = input.diff;
  if (diff) {
    if (diff.status === "blocked") {
      return { readiness: "blocked", reason: "before/after 중 하나가 blocked 상태입니다." };
    }
    if (diff.counts.new > 0) {
      return { readiness: "needs_fix", reason: `새 이슈 ${diff.counts.new}건이 생겼습니다.` };
    }
    if (diff.counts.remaining > 0) {
      return { readiness: "needs_fix", reason: `남은 이슈 ${diff.counts.remaining}건이 있습니다.` };
    }
    // diff.new=0 && remaining=0 → 모두 해결.
    return { readiness: "ready", reason: "Visual QA verify 결과 남은 이슈가 없습니다." };
  }
  // diff 없음(처음 QA만 돌린 상태) — report.status 기준.
  if (report.status === "passed" && (report.issues ?? []).length === 0) {
    return { readiness: "ready", reason: "Visual QA가 passed이고 이슈가 없습니다." };
  }
  if (report.status === "warning" || report.status === "failed" || (report.issues ?? []).length > 0) {
    return { readiness: "needs_fix", reason: `Visual QA 이슈 ${(report.issues ?? []).length}건이 있습니다.` };
  }
  return { readiness: "needs_fix", reason: "상태가 불확실 — 보수적으로 추가 검증을 권장합니다." };
}

/** 카드 헤더용 한 줄 summary. */
function readinessSummary(readiness: PublishReadiness, reason: string): string {
  switch (readiness) {
    case "ready":
      return `Publish 진행 가능 — ${reason}`;
    case "needs_fix":
      return `추가 수정 필요 — ${reason}`;
    case "blocked":
      return `검증 차단 — ${reason}`;
  }
}

export function buildVisualEvidence(input: {
  previewUrl?: string;
  report?: VisualQaReport;
  diff?: VisualQaDiff;
  verifyFailedStep?: "preview" | "qa";
}): VisualEvidence {
  const { readiness, reason } = computePublishReadiness(input);
  const consoleInfo = extractConsoleSummary(input.report);
  return {
    readiness,
    summary: readinessSummary(readiness, reason),
    previewUrl: input.previewUrl,
    qaStatus: input.report?.status,
    qaTruth: input.report?.truthStatus,
    diff: input.diff,
    consolePreview: consoleInfo.preview,
    consoleTotal: consoleInfo.total,
    screenshot: extractScreenshotRef(input.report),
  };
}
