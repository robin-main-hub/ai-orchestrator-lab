import type { RecallResult } from "@ai-orchestrator/protocol";

/**
 * 패치 P2 (MTRAG-UN, arXiv 2602.23184) — 답변가능성 가드 + 명시적 IDK.
 *
 * MTRAG-UN: 멀티턴 질의의 28%가 답변불가/부분답변이고, 모델은 IDK가 명시될 때만
 * 환각을 멈춘다. 우리 파이프라인은 0.18 usedInDecision 임계를 pin/trust/importance
 * 부스트로 넘을 수 있어 — 무관한 핀고정 기억이 recall에 섞여 페르소나가 그럴듯하게
 * 지어낸다. 이 가드는 부스트를 제외한 *내용 기반* 점수만 보고, 진짜 내용 매칭이
 * 없으면 recall 블록을 억제하고 "기억나지 않는다고 답하라"는 지시를 주입한다.
 */

/** lexical/semantic 뷰의 원점수 = 내용 기반 신호 (metadata/pin 부스트 제외) */
export function contentOnlyScore(result: RecallResult): number {
  const views = result.fusionDetail?.views ?? [];
  const contentViews = views.filter((view) => view.view === "lexical" || view.view === "semantic");
  if (contentViews.length === 0) {
    // 뷰 정보가 없는 경로(비-RRF)는 내용/부스트를 구분할 수 없으므로 fused score를
    // 그대로 신뢰 — 실제 핀고정 부스트 케이스는 RRF 뷰를 동반하므로 여전히 잡힌다.
    return result.score;
  }
  return Math.max(...contentViews.map((view) => view.rawScore));
}

export type AnswerabilityVerdict = {
  /** 내용 기반으로 답변 가능한 기억이 있는가 */
  answerable: boolean;
  /** 답변 가능으로 통과한 결과들 (recall 블록 렌더 대상) */
  groundedResults: RecallResult[];
  /** 주입할 IDK 지시 (answerable=false일 때) */
  idkDirective?: string;
  /** 디버그: 부스트만으로 통과했던(내용 미달) 후보 수 */
  boostOnlyCount: number;
};

const DEFAULT_CONTENT_THRESHOLD = 0.15;

const IDK_DIRECTIVE = [
  "관련 기억 없음: 이 질문에 대응하는 신뢰할 만한 기억을 찾지 못했다.",
  "기억나지 않거나 모르는 부분은 솔직히 '기억나지 않는다/모른다'고 답하라. 그럴듯한 기억을 지어내지 말 것.",
].join("\n");

/**
 * recall 결과(이미 scope/usedInDecision 통과)를 받아 답변가능성을 판정(순수).
 * 내용 기반 점수가 임계를 넘는 결과만 grounded로 통과시키고, 하나도 없으면 IDK.
 */
export function evaluateAnswerability(
  results: ReadonlyArray<RecallResult>,
  options: { contentThreshold?: number } = {},
): AnswerabilityVerdict {
  const threshold = options.contentThreshold ?? DEFAULT_CONTENT_THRESHOLD;
  const grounded: RecallResult[] = [];
  let boostOnly = 0;
  for (const result of results) {
    if (contentOnlyScore(result) >= threshold) {
      grounded.push(result);
    } else {
      boostOnly += 1;
    }
  }
  if (grounded.length === 0) {
    return { answerable: false, groundedResults: [], idkDirective: IDK_DIRECTIVE, boostOnlyCount: boostOnly };
  }
  return { answerable: true, groundedResults: grounded, boostOnlyCount: boostOnly };
}
