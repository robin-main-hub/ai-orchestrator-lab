import type { VisualQaReport, DesignIssueCard, DesignIssueKind, MissionScaffoldLatestSafeFile } from "@ai-orchestrator/protocol";

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

// ──────────────────────────────────────────────────────────────────────────────
// AppFix Patch — Visual QA AppFix 초안의 다음 단계.
//
// 사용자가 "수정안 적용" 버튼을 누르기 전에 파일별로 어떤 변경이 생길지 보여줄 수 있도록
// 현재 scaffold 파일 content + draft를 받아 결정적 patch를 만든다. LLM 0/네트워크 0.
//
// 정직성:
//   - rule이 없는 kind는 applied=false + note로 정직 표시(추측 금지).
//   - rule이 매칭되지 않으면 applied=false(예: styles.css에 .app-screens가 없는 경우).
//   - "full file rewrite처럼 보여도 preview에 변경 요약을 보여준다" → summary에 어떤 줄/규칙이
//     매치됐는지 적는다.
// ──────────────────────────────────────────────────────────────────────────────

export type AppFixPatch = {
  /** 대상 파일 경로(scaffold/latest의 path 그대로). */
  file: string;
  /** 이 patch가 처리하려는 issue kinds. */
  kindHints: DesignIssueKind[];
  /** patch 적용 전 원본(scaffold/latest의 content). */
  oldContent: string;
  /** patch 적용 후 새 content. applied=false면 oldContent와 동일. */
  newContent: string;
  /** rule이 실제로 매치돼 새 content가 만들어졌는지. */
  applied: boolean;
  /** 변경 요약 또는 적용 불가 사유(한 줄). */
  note: string;
};

/** 안전한 regex replace 한 번씩 — 결과/적용여부/사유를 모은다. */
function tryApplyRule(
  content: string,
  rules: ReadonlyArray<{
    pattern: RegExp;
    replacement: string;
    label: string;
  }>,
): { content: string; appliedNotes: string[] } {
  let cur = content;
  const notes: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(cur)) {
      cur = cur.replace(rule.pattern, rule.replacement);
      notes.push(rule.label);
    }
  }
  return { content: cur, appliedNotes: notes };
}

/** styles.css에 mobile-break 미디어 쿼리가 없으면 추가. 있으면 noop. */
function ensureMobileMediaQuery(content: string): { content: string; changed: boolean } {
  if (/@media[^{]+max-width:\s*640px[^{]+\.app-screens/i.test(content)) {
    return { content, changed: false };
  }
  const block = `\n@media (max-width: 640px) {\n  .app-screens { grid-template-columns: 1fr; }\n  .app-shell { padding: 1.5rem 1rem; }\n}\n`;
  return { content: content.trimEnd() + "\n" + block, changed: true };
}

/** App.tsx의 .screen-card__action 버튼에 aria-label이 없으면 primaryAction 텍스트로 추가. */
function ensureAriaLabelOnScreenAction(content: string): { content: string; changed: boolean } {
  // 이미 aria-label이 있으면 noop.
  if (/className="screen-card__action"[^>]*aria-label=/.test(content) || /aria-label=[^>]*className="screen-card__action"/.test(content)) {
    return { content, changed: false };
  }
  // scaffold가 만든 패턴: `>${jsxText(s.primaryAction || "시작")}</button>` 가 같은 라인에 따라옴.
  // 안전한 단일 매치 — 같은 라인에 className="screen-card__action"와 버튼 텍스트가 같이 있음.
  const pattern = /(<button[^>]*?className="screen-card__action"[^>]*?>)([^<]*?)(<\/button>)/g;
  if (!pattern.test(content)) return { content, changed: false };
  pattern.lastIndex = 0;
  const next = content.replace(pattern, (_m, open, text, close) => {
    if (open.includes("aria-label=")) return _m;
    // 버튼 텍스트가 비어 있으면 "시작" fallback.
    const label = (text ?? "").trim() || "시작";
    // 안전 따옴표 제거.
    const safeLabel = label.replace(/"/g, "&quot;");
    const newOpen = open.replace(/>$/, ` aria-label="${safeLabel}">`);
    return `${newOpen}${text}${close}`;
  });
  return { content: next, changed: next !== content };
}

/**
 * 한 파일에 들어갈 patch — kindHints가 가리키는 규칙들을 결정적으로 적용한다.
 * 매칭이 없거나 규칙이 없는 kind만 모이면 applied=false + 사유.
 */
function applyPatchForFile(file: string, oldContent: string, kindHints: ReadonlyArray<DesignIssueKind>): AppFixPatch {
  if (oldContent === "") {
    return { file, kindHints: [...kindHints], oldContent, newContent: oldContent, applied: false, note: "원본 파일 content가 비어 있어 patch를 적용하지 않았습니다." };
  }
  let cur = oldContent;
  const notes: string[] = [];

  if (file === "src/styles.css") {
    // visual_overflow → grid minmax 축소 + .screen-card padding 축소.
    if (kindHints.includes("visual_overflow")) {
      const r = tryApplyRule(cur, [
        {
          pattern: /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(240px,\s*1fr\)\);/,
          replacement: "grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));",
          label: "visual_overflow: .app-screens minmax 240px→200px",
        },
        {
          pattern: /\.screen-card\s*\{[^}]*?padding:\s*1\.25rem;/,
          replacement: (match: string) => match.replace(/padding:\s*1\.25rem;/, "padding: 1rem;") as never,
        } as never,
      ]);
      cur = r.content;
      notes.push(...r.appliedNotes);
      if (/padding:\s*1\.25rem;/.test(cur)) {
        cur = cur.replace(/(\.screen-card\s*\{[^}]*?)padding:\s*1\.25rem;/, "$1padding: 1rem;");
        notes.push("visual_overflow: .screen-card padding 1.25rem→1rem");
      }
    }
    // mobile_break → 미디어 쿼리 추가.
    if (kindHints.includes("mobile_break")) {
      const m = ensureMobileMediaQuery(cur);
      cur = m.content;
      if (m.changed) notes.push("mobile_break: @media (max-width:640px) 추가 — .app-screens 1열");
    }
    // click_target → .screen-card__action padding/최소 크기.
    if (kindHints.includes("click_target")) {
      const before = cur;
      cur = cur.replace(
        /\.screen-card__action\s*\{([^}]*?)padding:\s*0\.5rem\s+0\.85rem;([^}]*?)\}/,
        ".screen-card__action {$1padding: 0.75rem 1rem; min-height: 44px; min-width: 44px;$2}",
      );
      if (cur !== before) notes.push("click_target: .screen-card__action padding/min-size 44px");
    }
    // contrast → 텍스트 색상 강도 보강.
    if (kindHints.includes("contrast")) {
      const r = tryApplyRule(cur, [
        { pattern: /\.app-hero__intent\s*\{[^}]*?color:\s*#aab0bc;/, replacement: (m: string) => m.replace("#aab0bc", "#d6dae3") as never } as never,
        { pattern: /\.screen-card__purpose\s*\{[^}]*?color:\s*#aab0bc;/, replacement: (m: string) => m.replace("#aab0bc", "#c8ccd6") as never } as never,
      ]);
      // 위 callback replace는 RegExp.replace로 다시 처리.
      const before = cur;
      cur = cur.replace(/(\.app-hero__intent\s*\{[^}]*?color:\s*)#aab0bc;/, "$1#d6dae3;");
      cur = cur.replace(/(\.screen-card__purpose\s*\{[^}]*?color:\s*)#aab0bc;/, "$1#c8ccd6;");
      if (cur !== before) notes.push("contrast: intent/purpose 텍스트 색상 강화");
      void r;
    }
  } else if (file === "src/App.tsx") {
    if (kindHints.includes("accessibility")) {
      const m = ensureAriaLabelOnScreenAction(cur);
      cur = m.content;
      if (m.changed) notes.push("accessibility: .screen-card__action 버튼에 aria-label 자동 추가");
    }
    if (kindHints.includes("hierarchy") || kindHints.includes("missing_primary_action")) {
      // 구조 자체는 scaffold가 이미 hero h1 + card h2를 정직하게 내고 있으므로 추가 변경 없이
      // 미적용으로 노출 — 추측 금지.
    }
  } else if (file === "src/main.tsx") {
    // console_error는 원인을 안 보고 자동 수정하지 않는다(잘못된 변경이 더 큰 사고). 미적용.
  }

  const applied = notes.length > 0 && cur !== oldContent;
  return {
    file,
    kindHints: [...kindHints],
    oldContent,
    newContent: applied ? cur : oldContent,
    applied,
    note: applied ? notes.join(" · ") : "이 파일에는 자동 적용 가능한 규칙이 없습니다 — 직접 수정 필요.",
  };
}

/**
 * Draft + 현재 scaffold 파일들을 받아 file별 patch를 만든다. 같은 file이 draft에 없으면 patch도 없음.
 * scaffold/latest가 reply한 path만 patch 대상이 된다(가짜 path 만들지 않는다).
 */
export function buildAppFixPatches(
  draft: AppFixDraft,
  currentFiles: ReadonlyArray<Pick<MissionScaffoldLatestSafeFile, "path" | "content">>,
): AppFixPatch[] {
  if (draft.status !== "has_fixes" || draft.fileSuggestions.length === 0) return [];
  const contentByPath = new Map(currentFiles.map((f) => [f.path, f.content]));
  const patches: AppFixPatch[] = [];
  for (const s of draft.fileSuggestions) {
    const current = contentByPath.get(s.file);
    if (current === undefined) {
      patches.push({
        file: s.file,
        kindHints: [...s.kindHints],
        oldContent: "",
        newContent: "",
        applied: false,
        note: "현재 scaffold/latest 응답에 이 파일이 없어 patch를 만들 수 없습니다.",
      });
      continue;
    }
    patches.push(applyPatchForFile(s.file, current, s.kindHints));
  }
  return patches;
}
