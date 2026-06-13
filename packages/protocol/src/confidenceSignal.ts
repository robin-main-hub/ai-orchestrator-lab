import { z } from "zod";
import { truthStatusSchema, type TruthStatus } from "./productKernel.js";

/**
 * Confidence Signal — SID/엔트로피 게이지의 함정(모든 provider가 logprobs를 주지
 * 않음)을 피해, 확신을 **출처별로 분리**한다. "엔트로피 85%"라고 단정하지 않고
 * "verifier passed / 토론 이견 낮음 / 자가 보고 72%"처럼 출처를 나눈다.
 *
 * 가짜 entropy 금지: logprobs가 실제로 없으면 observed처럼 표시하지 않는다.
 */

export const confidenceSignalKindSchema = z.enum([
  "provider_logprobs",
  "verifier_result",
  "debate_disagreement",
  "self_reported",
  "simulated",
]);
export type ConfidenceSignalKind = z.infer<typeof confidenceSignalKindSchema>;

export const confidenceSignalSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workerId: z.string().optional(),
  kind: confidenceSignalKindSchema,
  /** 0..1 */
  score: z.number().min(0).max(1),
  label: z.string(),
  truthStatus: truthStatusSchema,
  createdAt: z.string(),
});
export type ConfidenceSignal = z.infer<typeof confidenceSignalSchema>;

/**
 * 신호 출처 → truthStatus. logprobs/verifier는 실측이면 observed, 토론 이견·자가
 * 보고는 configured(파생/제한적), 데모는 simulated. (가짜 observed 금지)
 */
export function truthStatusForConfidenceKind(kind: ConfidenceSignalKind): TruthStatus {
  switch (kind) {
    case "provider_logprobs":
    case "verifier_result":
      return "observed";
    case "debate_disagreement":
    case "self_reported":
      return "configured";
    case "simulated":
      return "simulated";
  }
}

const KIND_LABEL: Record<ConfidenceSignalKind, string> = {
  provider_logprobs: "모델 logprobs",
  verifier_result: "검증 결과",
  debate_disagreement: "토론 이견",
  self_reported: "자가 보고",
  simulated: "데모",
};

export function buildConfidenceSignal(input: {
  id: string;
  missionId: string;
  workerId?: string;
  kind: ConfidenceSignalKind;
  score: number;
  now: () => string;
  labelSuffix?: string;
}): ConfidenceSignal {
  const clamped = Math.max(0, Math.min(1, input.score));
  return {
    id: input.id,
    missionId: input.missionId,
    workerId: input.workerId,
    kind: input.kind,
    score: clamped,
    label: `${KIND_LABEL[input.kind]}: ${Math.round(clamped * 100)}%${input.labelSuffix ? ` · ${input.labelSuffix}` : ""}`,
    truthStatus: truthStatusForConfidenceKind(input.kind),
    createdAt: input.now(),
  };
}

export type ConfidenceSummary = {
  /** 단일 게이지가 아니라 출처별 라인 — "확신 85%" 단정 금지 */
  lines: Array<{ kind: ConfidenceSignalKind; label: string; truthStatus: TruthStatus }>;
  /** observed 신호만으로 본 최고 확신(없으면 undefined) */
  observedHighest?: number;
};

export function summarizeConfidence(signals: ReadonlyArray<ConfidenceSignal>): ConfidenceSummary {
  const lines = signals.map((signal) => ({ kind: signal.kind, label: signal.label, truthStatus: signal.truthStatus }));
  const observedScores = signals.filter((signal) => signal.truthStatus === "observed").map((signal) => signal.score);
  return {
    lines,
    observedHighest: observedScores.length > 0 ? Math.max(...observedScores) : undefined,
  };
}
