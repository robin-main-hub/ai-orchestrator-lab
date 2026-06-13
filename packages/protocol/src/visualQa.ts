import { z } from "zod";
import { truthStatusSchema } from "./truthStatus.js";

/**
 * Visual QA / DesignIssueCard (D5b) — observed preview 위에서만 디자인 품질을 검사한다.
 *
 * 절대 원칙(가짜 visual pass 금지):
 *   - **observed running preview가 없으면 QA는 blocked** (실행하지 않음).
 *   - 검사를 실제로 수행한 항목만 passed/warning/failed(observed). screenshot/DOM/console
 *     관측이 없으면 그 항목은 **skipped**(configured) — 절대 observed pass로 위장하지 않는다.
 *   - report.truthStatus는 실제 관측이 하나라도 있어야 observed. 전부 skip이면 configured.
 *
 * 분석기는 순수 함수: 원시 관측(HTTP HTML, 선택적 브라우저 메트릭)을 받아 VisualQaReport +
 * DesignIssueCard를 만든다. 실제 브라우저 구동(Playwright)은 서버의 DI 슬롯이며, 없으면
 * 브라우저 의존 검사는 skipped로 남는다.
 */

export const designIssueKindSchema = z.enum([
  "visual_overflow",
  "console_error",
  "contrast",
  "hierarchy",
  "missing_primary_action",
  "mobile_break",
  "click_target",
  "accessibility",
]);
export type DesignIssueKind = z.infer<typeof designIssueKindSchema>;

export const designIssueCardSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  kind: designIssueKindSchema,
  severity: z.enum(["low", "medium", "high"]),
  targetSurface: z.string().optional(),
  summary: z.string(),
  recommendation: z.string(),
  evidenceRef: z.string().optional(),
  truthStatus: truthStatusSchema,
  createdAt: z.string(),
});
export type DesignIssueCard = z.infer<typeof designIssueCardSchema>;

export const visualQaCheckStatusSchema = z.enum(["passed", "warning", "failed", "skipped"]);
export const visualQaCheckSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: visualQaCheckStatusSchema,
  summary: z.string(),
  evidenceRef: z.string().optional(),
});
export type VisualQaCheck = z.infer<typeof visualQaCheckSchema>;

export const visualQaReportSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  previewUrl: z.string(),
  checks: z.array(visualQaCheckSchema),
  issues: z.array(designIssueCardSchema),
  status: z.enum(["passed", "warning", "failed", "blocked"]),
  truthStatus: truthStatusSchema,
  createdAt: z.string(),
});
export type VisualQaReport = z.infer<typeof visualQaReportSchema>;

// 이벤트 payload (서버 전용 — 클라이언트 append 창구에 없음)
export const missionVisualQaRecordedPayloadSchema = z.object({
  missionId: z.string(),
  report: visualQaReportSchema,
});
export type MissionVisualQaRecordedPayload = z.infer<typeof missionVisualQaRecordedPayloadSchema>;

export const missionDesignIssueRecordedPayloadSchema = z.object({
  missionId: z.string(),
  issue: designIssueCardSchema,
});
export type MissionDesignIssueRecordedPayload = z.infer<typeof missionDesignIssueRecordedPayloadSchema>;

/** 원시 관측 입력 — HTTP-tier는 항상 시도, browser-tier(Playwright)는 선택적. */
export type VisualQaObservation = {
  previewObserved: boolean;
  previewUrl: string;
  /** HTTP GET 결과 — preview HTML. ok=false면 로드 실패. */
  http?: { ok: boolean; status: number; html: string };
  /** 브라우저 관측(Playwright). 없으면 브라우저 의존 검사는 skipped. */
  browser?: {
    viewports: Array<{ name: "desktop" | "tablet" | "mobile"; innerWidth: number; scrollWidth: number }>;
    consoleErrors: ReadonlyArray<string>;
    screenshotRefs: ReadonlyArray<string>;
    iconButtonsMissingAria: number;
    smallClickTargets: number;
  };
};

const HEADING_RE = /<h[1-3][\s>]/i;
const PRIMARY_ACTION_RE = /<button[\s>]|<a\s[^>]*href|role=["']button["']|type=["']submit["']/i;

function stripText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 원시 관측 → VisualQaReport + DesignIssueCard(순수). observed는 실제 관측 항목만.
 * preview가 observed가 아니면 blocked.
 */
export function analyzeVisualQa(input: {
  id: string;
  missionId: string;
  workspaceId: string;
  obs: VisualQaObservation;
  targetSurface?: string;
  now: () => string;
}): VisualQaReport {
  const { obs } = input;
  const createdAt = input.now();
  const base = { id: input.id, missionId: input.missionId, workspaceId: input.workspaceId, previewUrl: obs.previewUrl, createdAt };

  if (!obs.previewObserved) {
    return {
      ...base,
      checks: [{ id: `${input.id}_preview`, kind: "preview", status: "skipped", summary: "observed running preview가 없어 QA를 건너뜀" }],
      issues: [],
      status: "blocked",
      truthStatus: "configured",
    };
  }

  const checks: VisualQaCheck[] = [];
  const issues: DesignIssueCard[] = [];
  const issue = (kind: DesignIssueKind, severity: DesignIssueCard["severity"], summary: string, recommendation: string, evidenceRef?: string): void => {
    issues.push({ id: `${input.id}_${kind}`, missionId: input.missionId, workspaceId: input.workspaceId, kind, severity, targetSurface: input.targetSurface, summary, recommendation, evidenceRef, truthStatus: "observed", createdAt });
  };

  // ── HTTP-tier ── http 미수행=skipped, 시도했으나 실패=failed, 성공=HTML 검사
  const html = obs.http?.ok ? obs.http.html : undefined;
  if (obs.http === undefined) {
    checks.push({ id: `${input.id}_load`, kind: "load", status: "skipped", summary: "HTTP 관측 미수행" });
  } else if (!html) {
    checks.push({ id: `${input.id}_load`, kind: "load", status: "failed", summary: `preview HTML 로드 실패 (status ${obs.http.status})` });
  } else {
    const hasHeading = HEADING_RE.test(html);
    checks.push({ id: `${input.id}_hierarchy`, kind: "hierarchy", status: hasHeading ? "passed" : "warning", summary: hasHeading ? "제목(h1~h3) 있음" : "제목(h1~h3) 없음 — 정보 위계 약함" });
    if (!hasHeading) issue("hierarchy", "low", "화면에 제목(h1~h3)이 없어 정보 위계가 약합니다", "주요 섹션에 명확한 제목을 추가하세요");

    const hasPrimary = PRIMARY_ACTION_RE.test(html);
    checks.push({ id: `${input.id}_primary`, kind: "missing_primary_action", status: hasPrimary ? "passed" : "failed", summary: hasPrimary ? "주요 액션(버튼/링크) 있음" : "주요 액션(버튼/링크/submit) 없음" });
    if (!hasPrimary) issue("missing_primary_action", "medium", "화면에 명확한 주요 액션이 없습니다", "기본 동작을 수행할 primary 버튼/링크를 추가하세요");

    const text = stripText(html);
    checks.push({ id: `${input.id}_empty`, kind: "empty_state", status: text.length > 0 ? "passed" : "warning", summary: text.length > 0 ? `본문 텍스트 ${text.length}자` : "본문 텍스트가 비어 있음" });
  }

  // ── Browser-tier (Playwright probe 없으면 전부 skipped — 가짜 pass 금지) ──
  const browser = obs.browser;
  if (!browser) {
    for (const kind of ["overflow", "console_error", "click_target", "accessibility", "screenshot"]) {
      checks.push({ id: `${input.id}_${kind}`, kind, status: "skipped", summary: "브라우저 probe(Playwright) 미연결 — 관측 불가" });
    }
  } else {
    const overflowVp = browser.viewports.find((vp) => vp.scrollWidth > vp.innerWidth);
    checks.push({ id: `${input.id}_overflow`, kind: "overflow", status: overflowVp ? "failed" : "passed", summary: overflowVp ? `${overflowVp.name} 가로 overflow (${overflowVp.scrollWidth}>${overflowVp.innerWidth})` : "가로 overflow 없음" });
    if (overflowVp) issue(overflowVp.name === "mobile" ? "mobile_break" : "visual_overflow", "high", `${overflowVp.name} 뷰포트에서 가로 스크롤이 생깁니다`, "고정 폭/min-width를 줄이고 반응형으로 감싸세요");

    const consoleFail = browser.consoleErrors.length > 0;
    checks.push({ id: `${input.id}_console`, kind: "console_error", status: consoleFail ? "failed" : "passed", summary: consoleFail ? `console 에러 ${browser.consoleErrors.length}건` : "console 에러 없음" });
    if (consoleFail) issue("console_error", "high", `런타임 console 에러가 ${browser.consoleErrors.length}건 있습니다`, "첫 에러부터 원인을 추적해 수정하세요", browser.consoleErrors[0]);

    const clickWarn = browser.smallClickTargets > 0;
    checks.push({ id: `${input.id}_click`, kind: "click_target", status: clickWarn ? "warning" : "passed", summary: clickWarn ? `작은 클릭 타겟 ${browser.smallClickTargets}개` : "클릭 타겟 크기 양호" });
    if (clickWarn) issue("click_target", "low", `최소 크기 미만 클릭 타겟이 ${browser.smallClickTargets}개 있습니다`, "터치 타겟을 최소 44px로 키우세요");

    const ariaWarn = browser.iconButtonsMissingAria > 0;
    checks.push({ id: `${input.id}_a11y`, kind: "accessibility", status: ariaWarn ? "warning" : "passed", summary: ariaWarn ? `aria-label 없는 아이콘 버튼 ${browser.iconButtonsMissingAria}개` : "아이콘 버튼 aria 양호" });
    if (ariaWarn) issue("accessibility", "medium", `aria-label 없는 아이콘 버튼이 ${browser.iconButtonsMissingAria}개 있습니다`, "아이콘 전용 버튼에 aria-label을 추가하세요");

    const hasShot = browser.screenshotRefs.length > 0;
    checks.push({ id: `${input.id}_screenshot`, kind: "screenshot", status: hasShot ? "passed" : "skipped", summary: hasShot ? `screenshot ${browser.screenshotRefs.length}장` : "screenshot 없음", evidenceRef: browser.screenshotRefs[0] });
  }

  const anyObserved = checks.some((c) => c.status !== "skipped");
  const status: VisualQaReport["status"] = checks.some((c) => c.status === "failed")
    ? "failed"
    : checks.some((c) => c.status === "warning") || !anyObserved
      ? "warning"
      : "passed";

  return { ...base, checks, issues, status, truthStatus: anyObserved ? "observed" : "configured" };
}
