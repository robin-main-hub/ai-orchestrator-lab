import type { VisualQaReport, DesignIssueCard, DesignIssueKind } from "@ai-orchestrator/protocol";

/**
 * Preview → Visual QA → Revision Draft vertical의 결정적 마지막 한 조각.
 *
 * Visual QA report를 받아 사용자가 손으로 적용할 "수정안 초안"을 만든다. LLM 0/네트워크 0:
 * issue kind를 우리 react_vite scaffold의 파일에 결정적으로 매핑한다.
 *
 * 정직성:
 *   - 자동 파일 수정/자동 scaffold refresh/자동 PR 0. 응답은 보기 전용.
 *   - 분류 불가한 issue는 "unmappedIssues"로 정직하게 따로 둔다(추측 금지).
 *   - 같은 파일로 떨어지는 issue들은 한 줄 suggestion으로 묶고 kindHints에 evidence 라벨을 남긴다.
 */

export type AppFixDraftStatus =
  /** report.status="passed" 또는 issues가 비어 있음 — 수정안 불필요. */
  | "no_issues"
  /** 한 개 이상의 issue가 분류되어 file suggestion이 만들어짐. */
  | "has_fixes"
  /** report.status="blocked"(observed preview 없음) — Visual QA가 의미 없으므로 초안도 없음. */
  | "blocked";

export type AppFixDraftFileSuggestion = {
  /** 사용자가 손으로 열어볼 파일 경로(react_vite 템플릿 기준). */
  file: string;
  /** 무엇을 바꾸라는지 한 줄로. */
  what: string;
  /** 왜 그렇게 바꿔야 하는지(보통 issue.recommendation을 합친 짧은 문장). */
  why: string;
  /** 이 suggestion이 어떤 issue에서 파생됐는지 — UI에서 배지로 표시. */
  kindHints: DesignIssueKind[];
  /** 묶인 issue id들 — trace/디버깅용. */
  evidenceIssueIds: string[];
};

export type AppFixDraftUnmappedIssue = {
  id: string;
  kind: string;
  severity: "low" | "medium" | "high";
  summary: string;
  recommendation: string;
};

export type AppFixDraft = {
  status: AppFixDraftStatus;
  /** 한 줄 요약(카드 헤더에 표시). */
  summary: string;
  /** 파일별 묶음 suggestion. has_fixes일 때만 비어 있지 않음. */
  fileSuggestions: AppFixDraftFileSuggestion[];
  /** 분류기에 안 잡힌 issue들 — 추측 안 하고 정직하게 따로 둠. */
  unmappedIssues: AppFixDraftUnmappedIssue[];
  /** 통계 — UI 배지에서 사용. */
  counts: {
    totalIssues: number;
    mappedIssues: number;
    unmappedIssues: number;
    suggestionGroups: number;
  };
};

/** kind → 우리 react_vite scaffold의 가장 가능성 높은 파일. 추측 금지/안전 매핑. */
function fileForKind(kind: DesignIssueKind): string | undefined {
  switch (kind) {
    case "visual_overflow":
    case "contrast":
    case "mobile_break":
    case "click_target":
      return "src/styles.css";
    case "hierarchy":
    case "missing_primary_action":
    case "accessibility":
      return "src/App.tsx";
    case "console_error":
      return "src/main.tsx";
    default:
      return undefined;
  }
}

/** kind별 한국어 라벨(배지용). 미정의 kind는 그대로. */
export const DESIGN_ISSUE_KIND_LABEL: Record<DesignIssueKind, string> = {
  visual_overflow: "레이아웃 overflow",
  console_error: "콘솔 에러",
  contrast: "대비",
  hierarchy: "정보 위계",
  missing_primary_action: "주요 액션 누락",
  mobile_break: "모바일 깨짐",
  click_target: "터치 타깃",
  accessibility: "접근성",
};

/** kind → 어떤 한 줄 안내가 적절한지 결정적 매핑. */
function whatForKind(kind: DesignIssueKind): string {
  switch (kind) {
    case "visual_overflow":
      return ".app-screens 그리드와 .screen-card padding을 줄이거나 가로 스크롤이 안 나게 조정";
    case "contrast":
      return ".app-hero, .screen-card 색상 토큰(배경/텍스트) 대비를 WCAG AA 이상으로 끌어올리기";
    case "mobile_break":
      return "@media (max-width: 640px) 미디어 쿼리를 추가해 .app-screens를 한 컬럼으로 떨어뜨리기";
    case "click_target":
      return ".screen-card__action padding을 최소 44x44px이 되게 키우기";
    case "hierarchy":
      return "<h1>/<h2> 단계와 .app-hero/.screen-card 헤더 순서를 의도에 맞춰 재배치";
    case "missing_primary_action":
      return "각 .screen-card 안에 primaryAction 버튼이 빠지지 않게 카드 렌더링을 점검";
    case "accessibility":
      return "aria-label/role/포커스 스타일을 보강하고 의미 없는 div 대신 <main>/<section> 등 시맨틱 태그 사용";
    case "console_error":
      return "main.tsx import 경로와 createRoot 호출, App 컴포넌트 export를 확인(런타임 에러 직격)";
    default:
      return "변경 위치 직접 확인 필요";
  }
}

/** issue 묶음에서 "왜"를 짧게 합친다(recommendation 1순위, summary 보조). */
function joinWhy(issues: ReadonlyArray<DesignIssueCard>): string {
  const recs = issues.map((i) => (i.recommendation || "").trim()).filter((s) => s.length > 0);
  if (recs.length === 0) {
    const sums = issues.map((i) => (i.summary || "").trim()).filter((s) => s.length > 0);
    return sums.slice(0, 2).join(" · ") || "Visual QA에서 관측된 이슈";
  }
  return recs.slice(0, 2).join(" · ");
}

export function buildAppFixDraftFromVisualQa(report: VisualQaReport): AppFixDraft {
  if (report.status === "blocked") {
    return {
      status: "blocked",
      summary: "preview running이 없으면 Visual QA가 차단됩니다 — 먼저 preview를 띄우세요.",
      fileSuggestions: [],
      unmappedIssues: [],
      counts: { totalIssues: 0, mappedIssues: 0, unmappedIssues: 0, suggestionGroups: 0 },
    };
  }
  const issues = report.issues ?? [];
  if (issues.length === 0 || report.status === "passed") {
    return {
      status: "no_issues",
      summary: "Visual QA 통과 — 수정안이 필요 없습니다.",
      fileSuggestions: [],
      unmappedIssues: [],
      counts: { totalIssues: issues.length, mappedIssues: 0, unmappedIssues: 0, suggestionGroups: 0 },
    };
  }
  // 파일별로 묶는다(file 미정 issue는 unmapped로).
  const byFile = new Map<string, { kinds: Set<DesignIssueKind>; issues: DesignIssueCard[] }>();
  const unmapped: AppFixDraftUnmappedIssue[] = [];
  for (const issue of issues) {
    const file = fileForKind(issue.kind);
    if (!file) {
      unmapped.push({
        id: issue.id,
        kind: issue.kind,
        severity: issue.severity,
        summary: issue.summary,
        recommendation: issue.recommendation,
      });
      continue;
    }
    const entry = byFile.get(file) ?? { kinds: new Set<DesignIssueKind>(), issues: [] };
    entry.kinds.add(issue.kind);
    entry.issues.push(issue);
    byFile.set(file, entry);
  }
  const fileSuggestions: AppFixDraftFileSuggestion[] = [];
  // file 정렬 결정적: 알파벳 — UI/테스트가 안정적.
  const sortedFiles = [...byFile.keys()].sort();
  for (const file of sortedFiles) {
    const entry = byFile.get(file)!;
    const kindHints = [...entry.kinds].sort();
    // "무엇을": 첫 번째 kind의 안내를 헤더로 쓰고, 추가 kind가 있으면 짧게 합친다.
    const primaryKind = kindHints[0]!;
    const primaryWhat = whatForKind(primaryKind);
    const extraWhat = kindHints
      .slice(1)
      .map((k) => `${DESIGN_ISSUE_KIND_LABEL[k] ?? k}: ${whatForKind(k)}`)
      .join(" / ");
    const what = extraWhat ? `${primaryWhat} (+ ${extraWhat})` : primaryWhat;
    fileSuggestions.push({
      file,
      what,
      why: joinWhy(entry.issues),
      kindHints,
      evidenceIssueIds: entry.issues.map((i) => i.id),
    });
  }
  const mappedCount = issues.length - unmapped.length;
  const summaryParts: string[] = [];
  if (fileSuggestions.length > 0) summaryParts.push(`${fileSuggestions.length}개 파일 수정 후보`);
  if (unmapped.length > 0) summaryParts.push(`${unmapped.length}개 분류 불가`);
  return {
    status: "has_fixes",
    summary: `${summaryParts.join(" · ")} (총 ${issues.length}개 이슈)`,
    fileSuggestions,
    unmappedIssues: unmapped,
    counts: {
      totalIssues: issues.length,
      mappedIssues: mappedCount,
      unmappedIssues: unmapped.length,
      suggestionGroups: fileSuggestions.length,
    },
  };
}
