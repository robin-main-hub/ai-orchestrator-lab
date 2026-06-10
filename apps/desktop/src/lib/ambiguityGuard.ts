import type { RecallResult } from "@ai-orchestrator/protocol";

/**
 * 패치 P3 (MTRAG-UN, arXiv 2602.23184) — 불충분명세 질의 → 후보 헤지.
 *
 * MTRAG-UN의 최악 카테고리: 모델은 모호한 참조를 "그럴듯한 한 해석"으로 단정해
 * 답한다. 멀티테넌트 lorebook + per-agent 기억에선 이게 기계적으로 탐지된다 —
 * 비슷한 이름의 캐릭터 둘, 혹은 서로 다른 출처의 비슷한 점수 기억. 오타쿠 OS에서
 * "엉뚱한 캐릭터로 답하기"는 몰입 최상위 파괴이므로, 모호하면 한 후보를 단정하지
 * 않고 후보들을 나열해 되묻게 한다. 순수 로직(LLM 불필요).
 */

export type AmbiguityCandidate = {
  entity: string;
  source: string;
  score: number;
};

export type AmbiguityVerdict = {
  ambiguous: boolean;
  candidates: AmbiguityCandidate[];
  /** 주입할 헤지 지시 (ambiguous=true일 때) */
  directive?: string;
};

/** 결과의 대표 엔티티 (persons 우선, 없으면 entities, 없으면 제목 첫 토큰) */
function primaryEntity(result: RecallResult): string | undefined {
  const record = result.record;
  const person = record.persons?.[0];
  if (person) return person.toLowerCase();
  const entity = record.entities?.[0];
  if (entity) return entity.toLowerCase();
  return undefined;
}

const AMBIGUITY_RATIO = 0.8;

/**
 * 서로 다른 엔티티를 가리키는 비슷한 점수의 결과가 ≥2면 모호로 판정(순수).
 * 엔티티별로 최고 점수 결과를 모아, 상위 2개 클러스터의 점수비가 임계 이상이면 헤지.
 */
export function detectEntityAmbiguity(
  results: ReadonlyArray<RecallResult>,
  options: { ratio?: number } = {},
): AmbiguityVerdict {
  const ratio = options.ratio ?? AMBIGUITY_RATIO;
  const byEntity = new Map<string, AmbiguityCandidate>();
  for (const result of results) {
    const entity = primaryEntity(result);
    if (!entity) continue;
    const source = result.record.tags?.find((tag) => tag.startsWith("tenant:") || tag.startsWith("book:"))
      ?? (result.record.layer ?? "기억");
    const existing = byEntity.get(entity);
    if (!existing || result.score > existing.score) {
      byEntity.set(entity, { entity, source, score: result.score });
    }
  }

  const clusters = [...byEntity.values()].sort((a, b) => b.score - a.score);
  if (clusters.length < 2) {
    return { ambiguous: false, candidates: clusters };
  }
  const [top, second] = clusters;
  if (!top || !second || top.score <= 0) {
    return { ambiguous: false, candidates: clusters };
  }
  if (second.score / top.score < ratio) {
    return { ambiguous: false, candidates: clusters };
  }

  const list = clusters
    .slice(0, 3)
    .map((candidate) => `${candidate.entity} (${candidate.source})`)
    .join(" / ");
  const directive = [
    `모호한 참조 감지: 비슷한 비중의 후보가 둘 이상이다 — ${list}.`,
    "어느 쪽을 말하는지 단정하지 말고, 후보를 제시하며 어느 것인지 캐릭터 말투로 되물어라.",
  ].join("\n");

  return { ambiguous: true, candidates: clusters.slice(0, 3), directive };
}
