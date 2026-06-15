import type { ChangedFileSummary, CodingRunResult, TestResultSummary } from "./codingRunner";

/**
 * H8c — Runner output → patch/diff handoff.
 *
 * runner는 변경 *제안*(CodingRunResult.changedFiles + diffSummary)만 낸다. 이 모듈은 그
 * 제안을 **적용 가능한 구조화 patch handoff**로 정리해 승인 단계(control queue)로 넘기는
 * 다리다. 핵심 불변(H8a/H8b와 동일선):
 *
 *  - **절대 자동 적용 안 한다.** handoff는 항상 requiresApproval=true. 적용·커밋·PR은
 *    여전히 사람 승인 후 별도 단계.
 *  - 실체 없는 run은 넘기지 않는다 — 미관측(mock/게이트 off)·미완료·무변경·빈 diff면
 *    applicable=false + blockers. (가짜 패치 0)
 *  - 테스트 실패는 막진 않지만(사람이 판단) warning으로 분명히 표식.
 *  - 순수 — id는 result.endedAt로 결정론적(헤드리스 테스트 가능, Date.now 안 씀).
 */

export type PatchFileOp = {
  path: string;
  change: ChangedFileSummary["change"];
  additions: number;
  deletions: number;
  /** 이 파일에 해당하는 unified diff 조각 (파싱되면) */
  diff?: string;
};

export type PatchHandoffBlocker =
  | "run_not_completed" // status !== "completed"
  | "not_observed" // observed=false (mock/시뮬레이션/게이트 off)
  | "no_changes" // changedFiles 비었음
  | "empty_diff" // diffSummary 비었음
  | "tests_failed"; // testResult.failed > 0 (hard 아님 — warning)

export const PATCH_BLOCKER_REASON: Record<PatchHandoffBlocker, string> = {
  run_not_completed: "run이 완료되지 않음 — 적용할 패치 없음",
  not_observed: "미관측 run(시뮬레이션/게이트 off) — 실제 변경이 아님",
  no_changes: "변경 파일 없음",
  empty_diff: "diff가 비어 있음 — 적용할 내용 없음",
  tests_failed: "테스트 실패 — 적용 전 검토 필요",
};

export type RunnerPatchHandoff = {
  id: string;
  missionId: string;
  repoRoot: string;
  runnerId: string;
  createdAt: string;
  files: PatchFileOp[];
  unifiedDiff: string;
  stats: { files: number; additions: number; deletions: number };
  testResult: TestResultSummary;
  /** 적용 가능한가 — false면 blockers 참조. 절대 자동 적용 아님. */
  applicable: boolean;
  /** 사람 승인 필수 — 항상 true (자동 적용 경로 없음) */
  requiresApproval: true;
  /** 적용을 막는 하드 사유 */
  blockers: PatchHandoffBlocker[];
  /** 막진 않지만 경고할 사유 (예: tests_failed) */
  warnings: PatchHandoffBlocker[];
};

// ── unified diff → 파일별 조각 (순수, 관용 파서) ──

/** diff 텍스트를 파일 경로별 조각으로 쪼갠다. git 헤더(diff --git)가 있으면 그 경계, 없으면 `--- ` 경계. */
export function parseUnifiedDiffFiles(diff: string): Map<string, string> {
  const out = new Map<string, string>();
  const text = diff.replace(/\r\n/g, "\n");
  if (!text.trim()) return out;
  const hasGitHeaders = /^diff --git /m.test(text);
  const isBoundary = (line: string) => (hasGitHeaders ? line.startsWith("diff --git ") : line.startsWith("--- "));
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of text.split("\n")) {
    if (isBoundary(line) && cur.length > 0) {
      blocks.push(cur.join("\n"));
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (cur.length > 0) blocks.push(cur.join("\n"));
  for (const block of blocks) {
    const path = extractDiffPath(block);
    if (path) out.set(path, block.trim());
  }
  return out;
}

function extractDiffPath(block: string): string | null {
  const plus = block.match(/^\+\+\+ [ab]\/(.+)$/m);
  if (plus && plus[1] && !plus[1].includes("/dev/null")) return plus[1].trim();
  const git = block.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (git && git[2]) return git[2].trim();
  const minus = block.match(/^--- [ab]\/(.+)$/m);
  if (minus && minus[1] && minus[1] !== "/dev/null") return minus[1].trim();
  return null;
}

// ── handoff 빌더 (순수) ──

export function buildRunnerPatchHandoff(
  result: CodingRunResult,
  context: { missionId: string; repoRoot: string; runnerId: string },
): RunnerPatchHandoff {
  const diffByPath = parseUnifiedDiffFiles(result.diffSummary);
  const files: PatchFileOp[] = result.changedFiles.map((file) => ({
    path: file.path,
    change: file.change,
    additions: file.additions,
    deletions: file.deletions,
    diff: diffByPath.get(file.path),
  }));

  const blockers: PatchHandoffBlocker[] = [];
  if (result.status !== "completed") blockers.push("run_not_completed");
  if (!result.observed) blockers.push("not_observed");
  if (files.length === 0) blockers.push("no_changes");
  if (!result.diffSummary.trim()) blockers.push("empty_diff");

  const warnings: PatchHandoffBlocker[] = [];
  if (result.testResult.failed > 0) warnings.push("tests_failed");

  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return {
    id: `patch_${context.missionId}_${result.endedAt}`,
    missionId: context.missionId,
    repoRoot: context.repoRoot,
    runnerId: context.runnerId,
    createdAt: result.endedAt,
    files,
    unifiedDiff: result.diffSummary,
    stats: { files: files.length, additions, deletions },
    testResult: result.testResult,
    applicable: blockers.length === 0,
    requiresApproval: true,
    blockers,
    warnings,
  };
}

/** handoff 한 줄 요약 (UI 라벨용) */
export function summarizePatchHandoff(handoff: RunnerPatchHandoff): string {
  if (!handoff.applicable) {
    return handoff.blockers.map((b) => PATCH_BLOCKER_REASON[b]).join(" · ");
  }
  const { files, additions, deletions } = handoff.stats;
  const warn = handoff.warnings.length > 0 ? ` ⚠ ${handoff.warnings.map((w) => PATCH_BLOCKER_REASON[w]).join(", ")}` : "";
  return `${files}개 파일 · +${additions} / -${deletions} → 승인 대기${warn}`;
}
