import type { DesignIssueCard, VisualQaReport } from "@ai-orchestrator/protocol";

/**
 * Fix Verification Loop — Visual QA 두 report(before/after)를 비교해 issue delta를 만든다.
 *
 * 정직성/안전:
 *   - 비교 key는 결정적(kind + 정규화한 summary 일부). LLM 0/네트워크 0.
 *   - issue가 사라졌다고 자동으로 "고쳐졌다" 표시하지 않는다 — kind+summary가 같을 때만
 *     같은 issue로 본다. 의심 매칭(summary가 다르고 kind만 같음)은 같은 것으로 묶지 않는다.
 *   - blocked report는 비교가 의미 없으므로 status="blocked".
 *   - after.status="passed" + after.issues=0 → "passed". after.issues=0이라도
 *     after.status!=="passed"(load 실패·관측 없음·warning)면 "통과"로 위장하지 않고 "blocked".
 *   - new issue가 한 개라도 생기면 "regressed" — improved 표시 X(정직).
 */

export type IssueKey = string;

/** issue → 결정적 key. summary는 lowercase/trim/공백압축/200자 cap. */
export function issueKey(issue: DesignIssueCard): IssueKey {
  const summary = (issue.summary ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
  return `${issue.kind}::${summary}`;
}

export type VisualQaDiffStatus =
  /** after.issues=0 — 모두 해결됨. */
  | "passed"
  /** resolved>0 + new=0 + remaining>0. 일부 해결됐지만 남은 게 있음. */
  | "improved"
  /** resolved=0 + new=0 + remaining>0 — patch가 효과 없음(또는 부분만). */
  | "no_change"
  /** new>0 — 새 issue가 생겨남(돌아가는 길이 더 나빠짐). */
  | "regressed"
  /** before 또는 after가 blocked — 비교 의미 없음. */
  | "blocked";

export type VisualQaDiff = {
  status: VisualQaDiffStatus;
  /** before에는 있었는데 after에는 없는 issue들. */
  resolved: DesignIssueCard[];
  /** before에도 after에도 같은 key로 존재 — patch가 해결하지 못함. after의 issue를 그대로 노출. */
  remaining: DesignIssueCard[];
  /** before에는 없는데 after에는 있는 issue들. */
  newIssues: DesignIssueCard[];
  counts: {
    before: number;
    after: number;
    resolved: number;
    remaining: number;
    new: number;
  };
  /** UI/trace 요약 한 줄. */
  summary: string;
};

export function buildVisualQaDiff(before: VisualQaReport, after: VisualQaReport): VisualQaDiff {
  if (before.status === "blocked" || after.status === "blocked") {
    return {
      status: "blocked",
      resolved: [], remaining: [], newIssues: [],
      counts: { before: before.issues.length, after: after.issues.length, resolved: 0, remaining: 0, new: 0 },
      summary: "두 report 중 하나가 blocked — observed preview 없이는 비교가 의미 없습니다.",
    };
  }
  const beforeMap = new Map<IssueKey, DesignIssueCard>();
  for (const i of before.issues) beforeMap.set(issueKey(i), i);
  const afterMap = new Map<IssueKey, DesignIssueCard>();
  for (const i of after.issues) afterMap.set(issueKey(i), i);

  const resolved: DesignIssueCard[] = [];
  const remaining: DesignIssueCard[] = [];
  for (const [key, beforeIssue] of beforeMap) {
    const afterIssue = afterMap.get(key);
    if (afterIssue) remaining.push(afterIssue);
    else resolved.push(beforeIssue);
  }
  const newIssues: DesignIssueCard[] = [];
  for (const [key, afterIssue] of afterMap) {
    if (!beforeMap.has(key)) newIssues.push(afterIssue);
  }

  let status: VisualQaDiffStatus;
  if (after.issues.length === 0) {
    // after.issues=0이라도 after report 자체가 깨끗한 observed pass가 아니면(HTML load 실패·
    // 관측 없음·empty_state warning 등으로 status!=="passed") "통과"로 위장하지 않는다.
    // analyzeVisualQa가 내려준 status를 존중 — 가짜 visual pass 금지(merge gating과 동일한 정직성).
    status = after.status === "passed" ? "passed" : "blocked";
  } else if (newIssues.length > 0) status = "regressed";
  else if (resolved.length > 0 && remaining.length > 0) status = "improved";
  else if (resolved.length === 0 && remaining.length > 0) status = "no_change";
  else status = "passed"; // resolved>0 && remaining=0 && new=0 → 모두 해결.

  const summary =
    status === "passed"
      ? `통과 — ${resolved.length}개 해결, 남은 이슈 없음`
      : status === "improved"
        ? `개선 — ${resolved.length}개 해결, ${remaining.length}개 남음`
        : status === "no_change"
          ? `변화 없음 — ${remaining.length}개 그대로`
          : status === "regressed"
            ? `악화 — ${newIssues.length}개 새로 생김, ${remaining.length}개 남음`
            : `확인 불가 — after 검증이 깨끗한 통과 상태가 아닙니다(status=${after.status}) — 재검증이 필요합니다`;

  return {
    status,
    resolved,
    remaining,
    newIssues,
    counts: {
      before: before.issues.length,
      after: after.issues.length,
      resolved: resolved.length,
      remaining: remaining.length,
      new: newIssues.length,
    },
    summary,
  };
}
