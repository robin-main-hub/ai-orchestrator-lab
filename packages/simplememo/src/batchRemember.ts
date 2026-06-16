import type { MemoryInput } from "@ai-orchestrator/protocol";

/**
 * B1 — SimpleMemo/Memento batchRemember adapter seam.
 *
 * 학습 루프의 distilled candidate / 승인된 evidence를 MemoryAPI 뒤쪽으로 **안전하게
 * 넘길 수 있는 입구**. 이 모듈은 입구일 뿐, 실제 저장/검색 index/runtime 활성화를
 * 하지 않는다. mock/disabled가 기본 모드다.
 *
 * 불변선 (이 seam이 강제):
 *   - 자동 trusted/active 승격 0 — candidate는 suggested 같은 초기 상태로만 들어온다.
 *   - 숨은 백그라운드 write 0 — 결과는 즉시 결정론적으로 반환된다.
 *   - 가짜 성공 0 — disabled/mock 모드는 observed:false로 정직하게 표시.
 *   - source refs(sourceEventIds 또는 evidenceRefs) 없는 candidate는 거부.
 *   - 빈 content는 거부.
 *   - maxBatchSize(scan cap) 초과분은 skip + warning.
 *   - HNSW/index는 기본 off, soft RRF cutoff는 안전 기본값.
 *   - runtime activation / SimpleMem 서버 연동 / domain bridge / orchestrator wiring 0.
 */

export type BatchRememberOrigin = "learning_loop" | "evidence_bridge" | "manual" | "test_fixture";

/** suggested-like 초기 trust 상태만 허용 — 자동 trusted/active 금지. */
export type BatchRememberInitialTrust = "suggested" | "candidate" | "unverified";

export type BatchRememberCandidate = {
  /** 호출자 제공 임시 키(결과 매칭용). 없으면 파생 id가 유일 식별자. */
  clientRef?: string;
  /** MemoryInput — content가 비면 거부 */
  input: MemoryInput;
  /** 출처 추적 — sourceEventIds 또는 evidenceRefs 중 적어도 하나 필수 */
  sourceEventIds?: string[];
  evidenceRefs?: string[];
  /** 초기 trust 상태 — suggested-like만 */
  initialTrust: BatchRememberInitialTrust;
  origin: BatchRememberOrigin;
};

export type BatchRememberMode = "disabled" | "mock" | "local_simplememo" | "dgx_simplememo_placeholder";

export type BatchRememberConfig = {
  mode?: BatchRememberMode;
  /** scan cap — 이 수를 넘는 candidate는 skip(잘림) + warning */
  maxBatchSize?: number;
  /** HNSW/vector index 강제 — 기본 off. true여도 B1에서는 실제 index 안 켬(placeholder) */
  forceHnsw?: boolean;
  /** soft RRF importance cutoff — 기본 안전값(낮음). observed/error/pinned/active는 cutoff로 숨기지 않음(B2 규칙 예고) */
  rrfImportanceCutoff?: number;
  /** cutoff 모드 — soft 기본(하드 필터 금지) */
  rrfCutoffMode?: "soft" | "hard";
};

export const DEFAULT_BATCH_REMEMBER_CONFIG: Required<BatchRememberConfig> = {
  mode: "mock",
  maxBatchSize: 500,
  forceHnsw: false,
  rrfImportanceCutoff: 0.05,
  rrfCutoffMode: "soft",
};

export type BatchCandidateOutcome = "accepted" | "skipped" | "rejected";

export type BatchCandidateResult = {
  /** 결정론적으로 파생된 후보 id (성공/스킵/거부 무관하게 부여) */
  derivedId: string;
  clientRef?: string;
  outcome: BatchCandidateOutcome;
  origin: BatchRememberOrigin;
  /** accepted일 때만 의미 — 실제 저장 레코드 id는 B2에서. B1은 파생 id를 그대로 둔다 */
  recordId?: string;
  /** rejected/skipped 사유 */
  reason?: string;
};

export type BatchRememberResult = {
  mode: BatchRememberMode;
  /** mock/disabled면 false — 실제 저장 관측 아님(가짜 성공 금지) */
  observed: boolean;
  acceptedCount: number;
  skippedCount: number;
  rejectedCount: number;
  results: BatchCandidateResult[];
  warnings: string[];
  blockers: string[];
  /** 적용된 config(정직 표시) */
  effectiveConfig: Required<BatchRememberConfig>;
};

// ── 결정론적 id 파생 (FNV-1a, 부수효과 0) ──

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * candidate → 결정론적 id. content + origin + 정렬된 source refs 기반.
 * 같은 입력 → 같은 id (Date.now/랜덤 없음).
 */
export function deriveBatchCandidateId(candidate: BatchRememberCandidate): string {
  const refs = [...(candidate.sourceEventIds ?? []), ...(candidate.evidenceRefs ?? [])].slice().sort();
  const basis = [
    candidate.origin,
    candidate.input.title ?? "",
    candidate.input.content ?? "",
    refs.join(","),
  ].join("|");
  return `mem_cand_${candidate.origin}_${fnv1a(basis)}`;
}

function hasSourceRefs(candidate: BatchRememberCandidate): boolean {
  return (candidate.sourceEventIds?.length ?? 0) > 0 || (candidate.evidenceRefs?.length ?? 0) > 0;
}

function hasContent(candidate: BatchRememberCandidate): boolean {
  return typeof candidate.input.content === "string" && candidate.input.content.trim().length > 0;
}

// ── 순수 계획 함수 ──

/**
 * candidate 배열을 검증·분류한다. 실제 저장은 하지 않는다(순수).
 *   - source refs 없음 → rejected
 *   - 빈 content → rejected
 *   - maxBatchSize 초과 → skipped(잘림)
 *   - 그 외 → accepted (단, 저장은 adapter가 결정)
 * 결정론적: 입력 순서 보존, id는 deriveBatchCandidateId로만.
 */
export function planBatchRemember(
  candidates: ReadonlyArray<BatchRememberCandidate>,
  config: BatchRememberConfig = {},
): { results: BatchCandidateResult[]; warnings: string[]; effectiveConfig: Required<BatchRememberConfig> } {
  const cfg: Required<BatchRememberConfig> = { ...DEFAULT_BATCH_REMEMBER_CONFIG, ...config };
  const warnings: string[] = [];
  const results: BatchCandidateResult[] = [];

  candidates.forEach((candidate, idx) => {
    const derivedId = deriveBatchCandidateId(candidate);
    const base = { derivedId, clientRef: candidate.clientRef, origin: candidate.origin };

    if (!hasContent(candidate)) {
      results.push({ ...base, outcome: "rejected", reason: "empty_content" });
      return;
    }
    if (!hasSourceRefs(candidate)) {
      results.push({ ...base, outcome: "rejected", reason: "no_source_refs" });
      return;
    }
    if (idx >= cfg.maxBatchSize) {
      results.push({ ...base, outcome: "skipped", reason: "max_batch_size_exceeded" });
      return;
    }
    results.push({ ...base, outcome: "accepted", recordId: derivedId });
  });

  const skippedByCap = results.filter((r) => r.reason === "max_batch_size_exceeded").length;
  if (skippedByCap > 0) {
    warnings.push(`scan cap(${cfg.maxBatchSize}) 초과로 ${skippedByCap}건 skip`);
  }
  if (cfg.forceHnsw) {
    warnings.push("forceHnsw=true 지정됨 — B1 seam에서는 실제 index를 켜지 않음(placeholder)");
  }

  return { results, warnings, effectiveConfig: cfg };
}

// ── adapter seam ──

export interface BatchRememberAdapter {
  readonly mode: BatchRememberMode;
  batchRemember(candidates: ReadonlyArray<BatchRememberCandidate>): BatchRememberResult;
}

function summarize(
  mode: BatchRememberMode,
  observed: boolean,
  plan: ReturnType<typeof planBatchRemember>,
  extraBlockers: string[] = [],
): BatchRememberResult {
  const accepted = plan.results.filter((r) => r.outcome === "accepted").length;
  const skipped = plan.results.filter((r) => r.outcome === "skipped").length;
  const rejected = plan.results.filter((r) => r.outcome === "rejected").length;
  return {
    mode,
    observed,
    acceptedCount: accepted,
    skippedCount: skipped,
    rejectedCount: rejected,
    results: plan.results,
    warnings: plan.warnings,
    blockers: extraBlockers,
    effectiveConfig: plan.effectiveConfig,
  };
}

/**
 * disabled — 아무것도 저장하지 않고 모든 candidate를 skip 처리. observed:false.
 * (입구는 살아 있지만 기능은 꺼짐 — 정직)
 */
class DisabledBatchRememberAdapter implements BatchRememberAdapter {
  readonly mode = "disabled" as const;
  constructor(private readonly config: BatchRememberConfig = {}) {}
  batchRemember(candidates: ReadonlyArray<BatchRememberCandidate>): BatchRememberResult {
    const plan = planBatchRemember(candidates, this.config);
    // disabled는 accepted를 전부 skipped(disabled)로 강등. rejected는 그대로(검증 실패는 정직 표시).
    const results = plan.results.map((r) =>
      r.outcome === "accepted" ? { ...r, outcome: "skipped" as const, recordId: undefined, reason: "adapter_disabled" } : r,
    );
    const downgraded = { ...plan, results };
    return summarize("disabled", false, downgraded, ["adapter_disabled"]);
  }
}

/**
 * mock — 검증/분류만 하고 저장은 시뮬레이션. accepted는 파생 id를 recordId로 쓰되
 * observed:false(실제 저장 아님). 자동 trusted/active 승격 절대 없음.
 */
class MockBatchRememberAdapter implements BatchRememberAdapter {
  readonly mode = "mock" as const;
  constructor(private readonly config: BatchRememberConfig = {}) {}
  batchRemember(candidates: ReadonlyArray<BatchRememberCandidate>): BatchRememberResult {
    const plan = planBatchRemember(candidates, this.config);
    return summarize("mock", false, plan);
  }
}

/**
 * local_simplememo / dgx_simplememo_placeholder — B1에서는 실제 write 경로가 없으므로
 * placeholder. 호출되면 정직하게 observed:false + blocker로 "미구현(B2)"을 표시한다.
 * (가짜 성공 금지)
 */
class PlaceholderBatchRememberAdapter implements BatchRememberAdapter {
  constructor(
    readonly mode: BatchRememberMode,
    private readonly config: BatchRememberConfig = {},
  ) {}
  batchRemember(candidates: ReadonlyArray<BatchRememberCandidate>): BatchRememberResult {
    const plan = planBatchRemember(candidates, this.config);
    // 저장 경로 미구현 — accepted를 skipped(not_implemented)로 강등, observed:false.
    const results = plan.results.map((r) =>
      r.outcome === "accepted"
        ? { ...r, outcome: "skipped" as const, recordId: undefined, reason: "write_path_not_implemented_b1" }
        : r,
    );
    return summarize(this.mode, false, { ...plan, results }, ["write_path_not_implemented_b1"]);
  }
}

/**
 * adapter 팩토리. 기본 mock. local_simplememo/dgx_*는 B1에서 placeholder(미구현 정직 표시).
 */
export function createBatchRememberAdapter(config: BatchRememberConfig = {}): BatchRememberAdapter {
  const mode = config.mode ?? DEFAULT_BATCH_REMEMBER_CONFIG.mode;
  switch (mode) {
    case "disabled":
      return new DisabledBatchRememberAdapter(config);
    case "mock":
      return new MockBatchRememberAdapter(config);
    case "local_simplememo":
    case "dgx_simplememo_placeholder":
      return new PlaceholderBatchRememberAdapter(mode, config);
    default:
      return new MockBatchRememberAdapter(config);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B2 — local SimpleMemo batch write implementation.
//
// B1의 sync batchRemember(plan-only)는 그대로 둔다. B2는 그 입구 뒤에 **주입된 local
// writer**를 통해 accepted candidate를 실제로 write하는 async 경로를 *추가*한다.
//
// 안전선:
//   - writer가 명시적으로 주입되지 않으면 절대 성공 처리하지 않는다(observed:false,
//     accepted → skipped(local_writer_missing)).
//   - planBatchRemember가 accepted로 판정한 candidate만 writer를 호출한다.
//     rejected/skipped는 writer 호출 0.
//   - writeObserved:true는 writer가 실제로 ok를 돌려줬을 때만.
//   - 한 candidate의 writer 실패가 배치 전체를 성공으로 만들지 않는다(partial 정직 표기).
//   - B1의 결정론적 id(deriveBatchCandidateId)는 그대로 유지.
//   - 자동 trusted/active 승격 0, runtime activation 0, 숨은 백그라운드 0.
//   - HNSW 기본 off 유지(B2도 index를 켜지 않는다), maxBatchSize/empty/no-refs 가드 유지.
// ─────────────────────────────────────────────────────────────────────────────

export type LocalSimpleMemoWriteResult =
  | { ok: true; memoryId?: string }
  | { ok: false; errorCode?: string; reason?: string };

/**
 * 주입형 local writer. 실제 저장 부수효과는 전부 여기서만 일어난다.
 * candidateId는 B1 파생 id — writer가 멱등 키로 쓸 수 있게 넘긴다.
 */
export interface LocalSimpleMemoWriter {
  remember(input: MemoryInput, candidateId: string): Promise<LocalSimpleMemoWriteResult>;
}

export type LocalBatchWriteStatus = "written" | "skipped" | "rejected" | "failed";

export type LocalBatchWriteCandidateResult = {
  derivedId: string;
  clientRef?: string;
  origin: BatchRememberOrigin;
  writeStatus: LocalBatchWriteStatus;
  /** writer가 실제 ok를 돌려줬을 때만 true */
  writeObserved: boolean;
  /** writer가 돌려준 저장 id(있을 때만) */
  writtenId?: string;
  errorCode?: string;
  reason?: string;
};

export type LocalBatchWriteResult = {
  mode: "local_simplememo";
  /** writer 존재 + 최소 1건 실제 write 성공일 때만 true(가짜 성공 금지) */
  observed: boolean;
  writtenCount: number;
  failedCount: number;
  skippedCount: number;
  rejectedCount: number;
  results: LocalBatchWriteCandidateResult[];
  warnings: string[];
  blockers: string[];
  effectiveConfig: Required<BatchRememberConfig>;
};

/**
 * B1 입구 뒤에서 local writer로 실제 write를 수행하는 async 경로.
 *
 *   planBatchRemember(accepted only) → writer.remember(sequential) → per-candidate 결과
 *
 * writer 미주입이면 accepted를 skipped(local_writer_missing)로 강등하고 observed:false.
 * writer 주입이면 accepted만 순차 write(결정론적 순서). 실패는 candidate 단위로 격리.
 */
export async function executeLocalBatchWrite(args: {
  candidates: ReadonlyArray<BatchRememberCandidate>;
  writer?: LocalSimpleMemoWriter;
  config?: BatchRememberConfig;
}): Promise<LocalBatchWriteResult> {
  // mode는 local_simplememo로 고정해 effectiveConfig 정직 표기.
  const plan = planBatchRemember(args.candidates, { ...args.config, mode: "local_simplememo" });
  const warnings = [...plan.warnings];
  const blockers: string[] = [];
  const results: LocalBatchWriteCandidateResult[] = [];

  const writer = args.writer;
  if (!writer) blockers.push("local_writer_missing");

  for (const planned of plan.results) {
    const base = { derivedId: planned.derivedId, clientRef: planned.clientRef, origin: planned.origin };

    if (planned.outcome === "rejected") {
      results.push({ ...base, writeStatus: "rejected", writeObserved: false, reason: planned.reason });
      continue;
    }
    if (planned.outcome === "skipped") {
      results.push({ ...base, writeStatus: "skipped", writeObserved: false, reason: planned.reason });
      continue;
    }
    // accepted
    if (!writer) {
      // writer 없음 — 절대 성공 처리하지 않는다.
      results.push({ ...base, writeStatus: "skipped", writeObserved: false, reason: "local_writer_missing" });
      continue;
    }
    // accepted candidate의 input을 찾는다(파생 id로 매칭).
    const candidate = args.candidates.find((c) => deriveBatchCandidateId(c) === planned.derivedId);
    if (!candidate) {
      // 이론상 도달 불가(plan은 candidates에서 파생). 방어적으로 failed 처리.
      results.push({ ...base, writeStatus: "failed", writeObserved: false, errorCode: "candidate_not_found" });
      continue;
    }
    try {
      const write = await writer.remember(candidate.input, planned.derivedId);
      if (write.ok) {
        results.push({ ...base, writeStatus: "written", writeObserved: true, writtenId: write.memoryId });
      } else {
        results.push({
          ...base,
          writeStatus: "failed",
          writeObserved: false,
          errorCode: write.errorCode ?? "writer_failed",
          reason: write.reason,
        });
      }
    } catch (err) {
      results.push({
        ...base,
        writeStatus: "failed",
        writeObserved: false,
        errorCode: "writer_threw",
        reason: err instanceof Error ? err.name : "unknown",
      });
    }
  }

  const writtenCount = results.filter((r) => r.writeStatus === "written").length;
  const failedCount = results.filter((r) => r.writeStatus === "failed").length;
  const skippedCount = results.filter((r) => r.writeStatus === "skipped").length;
  const rejectedCount = results.filter((r) => r.writeStatus === "rejected").length;

  return {
    mode: "local_simplememo",
    observed: Boolean(writer) && writtenCount > 0,
    writtenCount,
    failedCount,
    skippedCount,
    rejectedCount,
    results,
    warnings,
    blockers,
    effectiveConfig: plan.effectiveConfig,
  };
}
