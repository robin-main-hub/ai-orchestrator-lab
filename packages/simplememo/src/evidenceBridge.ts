import type { MemoryInput } from "@ai-orchestrator/protocol";
import {
  executeLocalBatchWrite,
  type BatchRememberCandidate,
  type BatchRememberConfig,
  type LocalBatchWriteResult,
  type LocalSimpleMemoWriter,
} from "./batchRemember.js";

/**
 * D — 승인된 ERP/CRM evidence → batchRemember.
 *
 * ERP/CRM 워크플로에서 사람이 승인(approved/published)한 evidence를 B2(#534)의
 * local write 경로로 흘려보내는 다리. C2(learningBatchRemember)와 같은 모양:
 * 순수 변환 + 명시적 writer 주입. 이 모듈은 입구일 뿐 ERP DB를 건드리거나 외부/
 * 고객에게 무언가를 보내지 않는다.
 *
 * 불변선 (이 bridge가 강제):
 *   - origin은 "evidence_bridge" 고정.
 *   - initialTrust는 "suggested" — 자동 trusted/active 승격 0.
 *   - evidence content는 trustLevel "limited"로만 들어온다 (NEVER trusted).
 *   - approved/published evidence만 candidate가 됨 — draft/candidate는 무시(미저장).
 *   - source refs(sourceEventIds 또는 evidenceRefs) 없는 evidence는 드롭
 *     → batchRemember가 다시 한 번 reject.
 *   - writer 미주입이면 observed:false, 가짜 성공 0 (B2가 강제).
 *   - runtime activation / ERP DB mutation / external send / customer send 0.
 *   - 결정론적 — 같은 입력은 같은 candidate/derivedId.
 */

/** evidence가 memory로 흐를 수 있는 승인 상태 — 사람이 검토를 끝낸 것만. */
export type ApprovedEvidenceStatus = "approved" | "published" | "draft" | "candidate";

/** memory로 넘길 수 있는, 통과(committed) 상태 집합. */
const COMMITTED_EVIDENCE_STATUSES: ReadonlySet<ApprovedEvidenceStatus> = new Set<ApprovedEvidenceStatus>([
  "approved",
  "published",
]);

/**
 * 승인된 evidence 항목(자가완결형).
 *   - evidenceRefs는 결합을 피하려고 string reference id 배열로 모델링.
 *   - summary 또는 aiReason 중 하나가 memory content가 됨.
 */
export type ApprovedEvidence = {
  id: string;
  status: ApprovedEvidenceStatus;
  /** 출처 reference id들 — protocol EvidenceRef.reference/id 와 호환되는 평문 키. */
  evidenceRefs?: string[];
  /** 원천 이벤트 id들 — evidenceRefs 와 함께 source refs 로 전달. */
  sourceEventIds?: string[];
  title: string;
  /** 사람이 보는 요약 / AI 판단 근거. content 우선순위: aiReason ?? summary. */
  summary?: string;
  aiReason?: string;
};

/** evidence가 episode/reflection 중 어느 layer로 들어갈지. 기본 episode. */
function evidenceLayer(evidence: ApprovedEvidence): "episode" | "reflection" {
  // aiReason(추론된 교훈성)이 있으면 reflection, 단순 관측이면 episode.
  return evidence.aiReason && evidence.aiReason.trim().length > 0 ? "reflection" : "episode";
}

/**
 * 승인된 evidence를 memory content로 — context kind, trustLevel limited(NEVER trusted).
 * content는 aiReason ?? summary 를 보존한다.
 */
export function evidenceToMemoryInput(evidence: ApprovedEvidence): MemoryInput {
  const content = (evidence.aiReason ?? evidence.summary ?? "").trim();
  return {
    layer: evidenceLayer(evidence),
    kind: "context",
    title: evidence.title,
    content,
    sourceChannel: "agent",
    // 승인됐어도 ERP evidence는 curator/eval 전 — 절대 trusted로 올리지 않는다.
    trustLevel: "limited",
  };
}

/**
 * 승인된 evidence들을 batchRemember candidate로 변환(순수).
 *   - status가 approved/published 가 아니면 제외(draft/candidate 무시).
 *   - source refs(sourceEventIds 또는 evidenceRefs)가 하나도 없으면 드롭
 *     (batchRemember도 no_source_refs 로 reject).
 *   - origin "evidence_bridge", initialTrust "suggested" 고정.
 */
export function buildBatchRememberCandidatesFromEvidence(
  items: ReadonlyArray<ApprovedEvidence>,
): BatchRememberCandidate[] {
  return items
    .filter((e) => COMMITTED_EVIDENCE_STATUSES.has(e.status))
    .filter((e) => (e.sourceEventIds?.length ?? 0) > 0 || (e.evidenceRefs?.length ?? 0) > 0)
    .map((e) => {
      const candidate: BatchRememberCandidate = {
        clientRef: e.id,
        input: evidenceToMemoryInput(e),
        initialTrust: "suggested",
        origin: "evidence_bridge",
      };
      if (e.sourceEventIds?.length) candidate.sourceEventIds = [...e.sourceEventIds];
      if (e.evidenceRefs?.length) candidate.evidenceRefs = [...e.evidenceRefs];
      return candidate;
    });
}

/**
 * 승인된 evidence → batchRemember 실행. writer가 있으면 실제 local write, 없으면 observed:false.
 * B2 executeLocalBatchWrite의 모든 안전선을 그대로 상속한다.
 */
export async function executeEvidenceBatchRemember(args: {
  items: ReadonlyArray<ApprovedEvidence>;
  writer?: LocalSimpleMemoWriter;
  config?: BatchRememberConfig;
}): Promise<LocalBatchWriteResult> {
  const batchCandidates = buildBatchRememberCandidatesFromEvidence(args.items);
  return executeLocalBatchWrite({ candidates: batchCandidates, writer: args.writer, config: args.config });
}
