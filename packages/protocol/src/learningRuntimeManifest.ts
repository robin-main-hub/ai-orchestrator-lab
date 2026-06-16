import type { MemoryEvalReport } from "./memoryEval.js";
import {
  buildSkillRuntimeManifest,
  isSkillRuntimeLoadable,
  type SkillArchiveCandidate,
  type SkillLoadBlockReason,
  type SkillRuntimeActivationRecord,
  type SkillRuntimeManifestEntry,
} from "./skillArchive.js";

/**
 * C3 — memoryEval → skill activation manifest.
 *
 * skill activation contract(#532)와 memoryEval(#531)을 연결한다. activation 계약만으로
 * loadable이어도, 그 skill을 gated한 eval run의 verdict가 fail이면 runtime manifest에서
 * 막는다. warning은 표면화하되 통과를 가짜로 만들지 않는다(여전히 loadable, 단 warned).
 *
 * 불변선 (GPT C3 지시 그대로):
 *   - eval fail → manifest load 차단(activation이 active여도).
 *   - eval warning → surface하되 fake pass 0.
 *   - active + evalRunId + eval pass → loadable.
 *   - pinned without eval basis → not loadable(activation 계약이 막음).
 *   - quarantined → never loadable.
 *   - 결정론적 manifest order(skillArchive buildSkillRuntimeManifest 상속).
 *   - 실제 runtime load 0, agent spawn 0, MemoryRecord.activationState 변경 0.
 */

export type LearningManifestBlockReason = SkillLoadBlockReason | "eval_failed";

export type LearningRuntimeManifestEntry = SkillRuntimeManifestEntry & {
  /** 이 skill을 gated한 eval run의 verdict(있을 때만). */
  evalVerdict?: MemoryEvalReport["verdict"];
  /** eval warning이 있으면 true — 통과시키되 정직하게 표식. */
  evalWarned: boolean;
};

export type LearningRuntimeManifestBlocked = {
  candidateId: string;
  reasons: LearningManifestBlockReason[];
};

export type LearningRuntimeManifest = {
  scope?: string;
  loadable: LearningRuntimeManifestEntry[];
  blocked: LearningRuntimeManifestBlocked[];
};

export type LearningRuntimeManifestInput = {
  candidates: ReadonlyArray<SkillArchiveCandidate>;
  activations: ReadonlyArray<SkillRuntimeActivationRecord>;
  /** evalRunId → MemoryEvalReport. activation.evalRunId가 이 맵에 fail로 있으면 차단. */
  evalReportsByRunId?: Record<string, MemoryEvalReport>;
  scope?: string;
};

/**
 * eval verdict를 입혀 runtime manifest를 만든다(결정론적).
 *
 * 1) skillArchive.buildSkillRuntimeManifest로 activation 계약 기준 loadable/blocked 산출.
 * 2) loadable 항목 중 evalRunId가 있고, 그 eval report가:
 *      - verdict="fail" → blocked로 강등(eval_failed)
 *      - verdict="warning" → loadable 유지하되 evalWarned=true
 *      - verdict="pass" → 그대로
 *    evalRunId가 있는데 report가 맵에 없으면 → 보수적으로 차단(eval_failed; 미관측 eval).
 *    evalRunId 없이 waiver로 loadable인 항목은 eval 게이트 면제(이미 activation이 허용).
 */
export function buildLearningRuntimeManifest(input: LearningRuntimeManifestInput): LearningRuntimeManifest {
  const base = buildSkillRuntimeManifest({
    candidates: input.candidates,
    activations: input.activations,
    scope: input.scope,
  });

  const activationByCandidate = new Map<string, SkillRuntimeActivationRecord>();
  for (const a of input.activations) {
    if (!activationByCandidate.has(a.candidateId)) activationByCandidate.set(a.candidateId, a);
  }
  const reports = input.evalReportsByRunId ?? {};

  const loadable: LearningRuntimeManifestEntry[] = [];
  const blocked: LearningRuntimeManifestBlocked[] = base.blocked.map((b) => ({
    candidateId: b.candidateId,
    reasons: [...b.reasons] as LearningManifestBlockReason[],
  }));

  for (const entry of base.loadable) {
    const activation = activationByCandidate.get(entry.candidateId);
    const evalRunId = activation?.evalRunId;

    if (!evalRunId) {
      // evalRunId 없음 — activation이 waiver로 통과시킨 경우. eval 게이트 면제.
      loadable.push({ ...entry, evalWarned: false });
      continue;
    }

    const report = reports[evalRunId];
    if (!report) {
      // evalRunId가 있는데 report가 없음 — 미관측 eval. 보수적 차단(가짜 pass 금지).
      blocked.push({ candidateId: entry.candidateId, reasons: ["eval_failed"] });
      continue;
    }
    if (report.verdict === "fail") {
      blocked.push({ candidateId: entry.candidateId, reasons: ["eval_failed"] });
      continue;
    }
    // pass 또는 warning → loadable. warning은 정직하게 표식(가짜 pass 0).
    loadable.push({ ...entry, evalVerdict: report.verdict, evalWarned: report.verdict === "warning" });
  }

  loadable.sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));
  blocked.sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));

  return { scope: input.scope, loadable, blocked };
}

/** 단일 skill의 eval-gated loadability — UI/디버그용 편의 함수. */
export function isLearningSkillLoadable(
  candidate: Pick<SkillArchiveCandidate, "trustStatus">,
  activation: SkillRuntimeActivationRecord,
  evalReport?: MemoryEvalReport,
): { loadable: boolean; reasons: LearningManifestBlockReason[]; evalWarned: boolean } {
  const verdict = isSkillRuntimeLoadable(candidate, activation);
  if (!verdict.loadable) {
    return { loadable: false, reasons: verdict.reasons as LearningManifestBlockReason[], evalWarned: false };
  }
  if (!activation.evalRunId) {
    return { loadable: true, reasons: [], evalWarned: false }; // waiver 통과
  }
  if (!evalReport) {
    return { loadable: false, reasons: ["eval_failed"], evalWarned: false }; // 미관측 eval
  }
  if (evalReport.verdict === "fail") {
    return { loadable: false, reasons: ["eval_failed"], evalWarned: false };
  }
  return { loadable: true, reasons: [], evalWarned: evalReport.verdict === "warning" };
}
