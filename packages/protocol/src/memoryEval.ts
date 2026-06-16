import type { MemoryRecord, MemoryRelation } from "./index.js";

/**
 * Orchestration OS L8 — Memory Eval Harness (PR 2).
 *
 * "기억을 많이 저장했는가"가 아니라 **기억 검색 결과가 옳은가**를 채점하는 순수 계측기.
 * 실제 recall 엔진을 구현하지 않는다 — 이미 나온 retrieval 결과(memoryId + rank)를
 * 받아 결정론적으로 점수/판정만 낸다. memory를 승격/활성화하지 않는다(그건 PR 3).
 *
 * 새 DB·UI·server route 0. MemoryRecord schema 변경 0.
 *
 * 안전 정책 (이 모듈이 강제):
 *   - 명시적 forbidden id가 나오면 → 하드 fail(blocker).
 *   - tombstoned / quarantined 기억이 나오면 → 하드 unsafe(blocker). 죽었거나 격리된
 *     기억은 애초에 반환되면 안 된다(recall 엔진의 정확성 실패).
 *   - inactive 또는 freshness 초과(stale)는 기본 warning, strictStaleness면 fail.
 *   - contradicts / supersedes 관계에 걸린 기억은 separate하게 보고(warning).
 *   - 중복 retrieval은 recall을 부풀리지 못한다(memoryId로 dedupe, 최저 rank 유지).
 *   - 알 수 없는 retrieved id는 warning, crash 아님.
 *   - expected가 비면 recallAtK = null (0 나눗셈 금지).
 *   - verdict 우선순위: fail > warning > pass.
 */

export type MemoryEvalVerdict = "pass" | "warning" | "fail";

export type MemoryEvalRetrieved = {
  memoryId: string;
  rank: number;
  score?: number;
};

export type MemoryEvalInput = {
  evalCaseId: string;
  /** 이 쿼리에서 나와야 하는 기억들(정답) */
  expectedMemoryIds: string[];
  /** 절대 나오면 안 되는 기억들 */
  forbiddenMemoryIds?: string[];
  /** recall 엔진이 돌려준 결과 (rank asc가 상위). 중복 id 허용(dedupe됨) */
  retrieved: MemoryEvalRetrieved[];
  /** id → MemoryRecord. 있으면 tombstone/activation/freshness/unknown 판정에 쓴다 */
  recordsById?: Record<string, MemoryRecord>;
  /** contradicts / supersedes 판정용 관계 목록 */
  relations?: ReadonlyArray<MemoryRelation>;
  /** recall@k의 k. 미지정이면 dedupe된 retrieved 길이 */
  k?: number;
  /** freshness 계산 기준 시각(ISO). staleAfterDays와 함께 있을 때만 freshness 평가 */
  now?: string;
  /** 이 일수보다 오래된 기억은 stale. now와 함께 있을 때만 적용 */
  staleAfterDays?: number;
  /** true면 stale hit이 warning이 아니라 fail */
  strictStaleness?: boolean;
};

export type MemoryEvalReport = {
  evalCaseId: string;
  k: number;
  verdict: MemoryEvalVerdict;
  /** 0~1, expected가 비면 null */
  recallAtK: number | null;
  expectedHitIds: string[];
  missingExpectedIds: string[];
  forbiddenHitIds: string[];
  forbiddenHitRate: number;
  staleHitIds: string[];
  staleHitRate: number;
  contradictedHitIds: string[];
  supersededHitIds: string[];
  unknownRetrievedIds: string[];
  blockers: string[];
  warnings: string[];
};

const MS_PER_DAY = 86_400_000;

/** retrieved를 memoryId로 dedupe — 같은 id가 여러 번이면 최저(가장 좋은) rank만 유지. */
function dedupeByBestRank(retrieved: ReadonlyArray<MemoryEvalRetrieved>): MemoryEvalRetrieved[] {
  const best = new Map<string, MemoryEvalRetrieved>();
  for (const item of retrieved) {
    const prev = best.get(item.memoryId);
    if (!prev || item.rank < prev.rank) best.set(item.memoryId, item);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}

/** freshness 기준 시각 — lastAccessedAt > updatedAt > createdAt 순. */
function referenceDate(record: MemoryRecord): string {
  return record.lastAccessedAt ?? record.updatedAt ?? record.createdAt;
}

function isFreshnessStale(record: MemoryRecord, now: string, staleAfterDays: number): boolean {
  const ref = Date.parse(referenceDate(record));
  const nowMs = Date.parse(now);
  if (Number.isNaN(ref) || Number.isNaN(nowMs)) return false;
  return nowMs - ref > staleAfterDays * MS_PER_DAY;
}

/**
 * 순수 평가 함수. 입력을 바꾸지 않고 결정론적 report를 만든다.
 */
export function evaluateMemoryRecall(input: MemoryEvalInput): MemoryEvalReport {
  const unique = dedupeByBestRank(input.retrieved);
  const k = input.k ?? unique.length;
  const topK = unique.slice(0, Math.max(0, k));
  const topKIds = topK.map((r) => r.memoryId);
  const topKSet = new Set(topKIds);
  const retrievedSet = new Set(unique.map((r) => r.memoryId));

  // 중복 제거된 expected/forbidden
  const expected = [...new Set(input.expectedMemoryIds)];
  const forbidden = [...new Set(input.forbiddenMemoryIds ?? [])];

  // recall@k — top-k 안의 고유 expected hit / 전체 expected
  const expectedHitIds = expected.filter((id) => topKSet.has(id));
  const missingExpectedIds = expected.filter((id) => !topKSet.has(id));
  const recallAtK = expected.length === 0 ? null : expectedHitIds.length / expected.length;

  const records = input.recordsById ?? {};
  const relations = input.relations ?? [];

  // forbidden hits: 명시적 forbidden + tombstoned + quarantined (전부 retrieved 기준)
  const forbiddenHitSet = new Set<string>();
  for (const id of retrievedSet) {
    if (forbidden.includes(id)) forbiddenHitSet.add(id);
    const rec = records[id];
    if (rec) {
      if (rec.tombstonedAt) forbiddenHitSet.add(id);
      if (rec.activationState === "quarantined") forbiddenHitSet.add(id);
    }
  }
  const forbiddenHitIds = unique.map((r) => r.memoryId).filter((id) => forbiddenHitSet.has(id));

  // stale hits: inactive activation 또는 freshness 초과 (forbidden과 겹치면 forbidden 우선)
  const staleHitSet = new Set<string>();
  for (const id of retrievedSet) {
    if (forbiddenHitSet.has(id)) continue;
    const rec = records[id];
    if (!rec) continue;
    if (rec.activationState === "inactive") {
      staleHitSet.add(id);
      continue;
    }
    if (input.now !== undefined && input.staleAfterDays !== undefined && isFreshnessStale(rec, input.now, input.staleAfterDays)) {
      staleHitSet.add(id);
    }
  }
  const staleHitIds = unique.map((r) => r.memoryId).filter((id) => staleHitSet.has(id));

  // contradicted / superseded — 관계에 걸린 retrieved 기억
  const contradictedSet = new Set<string>();
  const supersededSet = new Set<string>();
  for (const rel of relations) {
    if (rel.kind === "contradicts") {
      if (retrievedSet.has(rel.fromRecordId)) contradictedSet.add(rel.fromRecordId);
      if (retrievedSet.has(rel.toRecordId)) contradictedSet.add(rel.toRecordId);
    } else if (rel.kind === "supersedes") {
      // supersedes: from이 to를 대체 → to는 outdated. retrieved된 to만 보고.
      if (retrievedSet.has(rel.toRecordId)) supersededSet.add(rel.toRecordId);
    }
  }
  const contradictedHitIds = unique.map((r) => r.memoryId).filter((id) => contradictedSet.has(id));
  const supersededHitIds = unique.map((r) => r.memoryId).filter((id) => supersededSet.has(id));

  // unknown — recordsById가 주어졌을 때만 판정
  const unknownRetrievedIds = input.recordsById
    ? unique.map((r) => r.memoryId).filter((id) => !(id in records))
    : [];

  const retrievedCount = unique.length;
  const forbiddenHitRate = retrievedCount === 0 ? 0 : forbiddenHitIds.length / retrievedCount;
  const staleHitRate = retrievedCount === 0 ? 0 : staleHitIds.length / retrievedCount;

  // ── verdict ──
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (forbiddenHitIds.length > 0) {
    blockers.push(`forbidden/unsafe 기억 ${forbiddenHitIds.length}건이 검색됨: ${forbiddenHitIds.join(", ")}`);
  }
  if (staleHitIds.length > 0) {
    if (input.strictStaleness) {
      blockers.push(`stale 기억 ${staleHitIds.length}건 (strict): ${staleHitIds.join(", ")}`);
    } else {
      warnings.push(`stale 기억 ${staleHitIds.length}건: ${staleHitIds.join(", ")}`);
    }
  }
  if (contradictedHitIds.length > 0) {
    warnings.push(`contradicts 관계 기억 ${contradictedHitIds.length}건: ${contradictedHitIds.join(", ")}`);
  }
  if (supersededHitIds.length > 0) {
    warnings.push(`superseded 기억 ${supersededHitIds.length}건: ${supersededHitIds.join(", ")}`);
  }
  if (unknownRetrievedIds.length > 0) {
    warnings.push(`알 수 없는 retrieved id ${unknownRetrievedIds.length}건: ${unknownRetrievedIds.join(", ")}`);
  }
  // expected가 있는데 하나도 못 맞췄으면 fail (answerable한데 비어있는 recall 포함)
  if (expected.length > 0 && expectedHitIds.length === 0) {
    blockers.push(`expected 기억을 top-${k}에서 하나도 찾지 못함`);
  }

  const verdict: MemoryEvalVerdict = blockers.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass";

  return {
    evalCaseId: input.evalCaseId,
    k,
    verdict,
    recallAtK,
    expectedHitIds,
    missingExpectedIds,
    forbiddenHitIds,
    forbiddenHitRate,
    staleHitIds,
    staleHitRate,
    contradictedHitIds,
    supersededHitIds,
    unknownRetrievedIds,
    blockers,
    warnings,
  };
}

// ── 다건 집계 ──

export type MemoryEvalMetricSummary = {
  totalCases: number;
  passedCases: number;
  warningCases: number;
  failedCases: number;
  /** recallAtK가 null이 아닌 케이스들의 평균. 그런 케이스가 없으면 null */
  meanRecallAtK: number | null;
  meanForbiddenHitRate: number;
  meanStaleHitRate: number;
};

/**
 * 여러 케이스 평가를 한 번에. 각 케이스를 evaluateMemoryRecall로 채점하고 집계 metric을 낸다.
 */
export function evaluateMemoryRecallBatch(inputs: ReadonlyArray<MemoryEvalInput>): {
  reports: MemoryEvalReport[];
  summary: MemoryEvalMetricSummary;
} {
  const reports = inputs.map((input) => evaluateMemoryRecall(input));
  const total = reports.length;
  const passed = reports.filter((r) => r.verdict === "pass").length;
  const warning = reports.filter((r) => r.verdict === "warning").length;
  const failed = reports.filter((r) => r.verdict === "fail").length;

  const recallValues = reports.map((r) => r.recallAtK).filter((v): v is number => v !== null);
  const meanRecallAtK =
    recallValues.length === 0 ? null : recallValues.reduce((sum, v) => sum + v, 0) / recallValues.length;

  const meanForbiddenHitRate = total === 0 ? 0 : reports.reduce((s, r) => s + r.forbiddenHitRate, 0) / total;
  const meanStaleHitRate = total === 0 ? 0 : reports.reduce((s, r) => s + r.staleHitRate, 0) / total;

  return {
    reports,
    summary: {
      totalCases: total,
      passedCases: passed,
      warningCases: warning,
      failedCases: failed,
      meanRecallAtK,
      meanForbiddenHitRate,
      meanStaleHitRate,
    },
  };
}
