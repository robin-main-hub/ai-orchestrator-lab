import type { DistilledLearningCandidate, MemoryInput } from "@ai-orchestrator/protocol";
import {
  executeLocalBatchWrite,
  type BatchRememberCandidate,
  type BatchRememberConfig,
  type LocalBatchWriteResult,
  type LocalSimpleMemoWriter,
} from "./batchRemember.js";

/**
 * C2 — distilled learning candidate → batchRemember.
 *
 * learningLoop(#530)이 만든 검증된 증류 후보(DistilledLearningCandidate)를 B2(#534)의
 * local write 경로로 흘려보내는 다리. 순수 변환 + 명시적 writer 주입.
 *
 * 불변선 (GPT C2 지시 그대로):
 *   - trustStatus === "suggested" 후보만 batchRemember 대상 (검증된 증류는 항상
 *     suggested로 태어남 — 자동 trusted/active 0).
 *   - candidate는 evidenceRefs(min 1)를 가짐 → batchRemember source refs로 전달.
 *   - origin은 "learning_loop" 고정.
 *   - writer 미주입이면 observed:false, 가짜 성공 0 (B2가 강제).
 *   - rejected/unverified hypothesis는 애초에 DistilledLearningCandidate가 안 됨
 *     (learningLoop 리듀서가 막음) — 여기서는 trustStatus 게이트로 한 번 더 방어.
 *   - runtime activation 0.
 */

/** 증류 후보의 lesson을 학습 memory content로 — reflection layer, 사람이 본 검증된 교훈. */
export function distilledCandidateToMemoryInput(candidate: DistilledLearningCandidate): MemoryInput {
  return {
    layer: "reflection",
    kind: "learning",
    title: candidate.title,
    content: candidate.lesson,
    sourceChannel: "agent",
    // 증류 후보는 검증됐지만 아직 curator/eval 전 — trusted로 올리지 않는다.
    trustLevel: "limited",
  };
}

/**
 * 검증된 증류 후보들을 batchRemember candidate로 변환(순수).
 *   - trustStatus !== "suggested" → 제외(방어적 게이트).
 *   - evidenceRefs는 그대로 전달(min 1 보장은 protocol 스키마가 함).
 */
export function buildBatchRememberCandidatesFromLearning(
  candidates: ReadonlyArray<DistilledLearningCandidate>,
): BatchRememberCandidate[] {
  return candidates
    .filter((c) => c.trustStatus === "suggested")
    .map((c) => ({
      clientRef: c.id,
      input: distilledCandidateToMemoryInput(c),
      evidenceRefs: [...c.evidenceRefs],
      initialTrust: "suggested" as const,
      origin: "learning_loop" as const,
    }));
}

/**
 * 증류 후보 → batchRemember 실행. writer가 있으면 실제 local write, 없으면 observed:false.
 * B2 executeLocalBatchWrite의 모든 안전선을 그대로 상속한다.
 */
export async function executeLearningBatchRemember(args: {
  candidates: ReadonlyArray<DistilledLearningCandidate>;
  writer?: LocalSimpleMemoWriter;
  config?: BatchRememberConfig;
}): Promise<LocalBatchWriteResult> {
  const batchCandidates = buildBatchRememberCandidatesFromLearning(args.candidates);
  return executeLocalBatchWrite({ candidates: batchCandidates, writer: args.writer, config: args.config });
}
