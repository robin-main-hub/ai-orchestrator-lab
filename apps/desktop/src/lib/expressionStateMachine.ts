/**
 * Expression state machine (P2-8, KIMI 브리프 / 서브컬처 축).
 *
 * 기존 classifyExpression은 입력마다 표정을 즉시 정한다 → 발화마다 표정이
 * 깜빡인다(과민 전환). 이 상태머신은 직전 표정 상태를 기억하고 히스테리시스
 * (진입 임계 + 미세변화 무시)와 쿨다운(표정별 최소 유지)·극성 반전 딜레이로
 * 자연스러운 전환만 통과시킨다. neutral 자동 복귀까지 포함. 순수 + 시간 주입.
 */

import type { ExpressionKey } from "./expressionTaxonomy";

export type ExpressionPolarity = "positive" | "negative" | "ambiguous" | "neutral";

const POLARITY: Record<ExpressionKey, ExpressionPolarity> = {
  neutral: "neutral",
  joy: "positive",
  pride: "positive",
  amusement: "positive",
  love: "positive",
  relief: "positive",
  excitement: "positive",
  admiration: "positive",
  approval: "positive",
  caring: "positive",
  desire: "positive",
  gratitude: "positive",
  optimism: "positive",
  sadness: "negative",
  anger: "negative",
  embarrassment: "negative",
  nervousness: "negative",
  disappointment: "negative",
  annoyance: "negative",
  disapproval: "negative",
  disgust: "negative",
  fear: "negative",
  grief: "negative",
  remorse: "negative",
  curiosity: "ambiguous",
  surprise: "ambiguous",
  confusion: "ambiguous",
  realization: "ambiguous",
};

export function expressionPolarity(key: ExpressionKey): ExpressionPolarity {
  return POLARITY[key] ?? "neutral";
}

/** 표정별 최소 유지(쿨다운) ms — 부정/강한 감정은 길게, 긍정은 짧게 (브리프 8.2) */
const COOLDOWN_MS: Partial<Record<ExpressionKey, number>> = {
  neutral: 800,
  joy: 1500,
  amusement: 1500,
  excitement: 2000,
  anger: 3000,
  disgust: 3000,
  grief: 3000,
  sadness: 3000,
  fear: 2000,
  surprise: 2000,
};
const DEFAULT_COOLDOWN_MS = 2000;

export function expressionCooldownMs(key: ExpressionKey): number {
  return COOLDOWN_MS[key] ?? DEFAULT_COOLDOWN_MS;
}

export type ExpressionStateConfig = {
  /** 미세 신호 무시 + 전환 진입 최소 신뢰도 (0~1). 기본 0.4 */
  entryConfidence?: number;
  /** 극성 반전 시 추가 유지 딜레이 ms. 기본 500 */
  polarityFlipExtraMs?: number;
  /** 마지막 전환 후 이 시간 동안 후보가 안 오면 neutral로 복귀. 0이면 비활성. 기본 0 */
  neutralReturnMs?: number;
};

export type ExpressionUpdate = {
  /** 후보 표정 (classifyExpression 결과 등) */
  candidate: ExpressionKey;
  /** 후보 신뢰도 (0~1). 분류기가 없으면 1로 간주 */
  confidence?: number;
  /** 현재 시각(ms) */
  nowMs: number;
};

export type ExpressionDecision = {
  expression: ExpressionKey;
  changed: boolean;
  /** 유지된 경우 사유 (디버그/감사) */
  heldReason?: "same" | "low_confidence" | "cooldown" | "polarity_flip";
};

/**
 * 표정 전환을 히스테리시스/쿨다운으로 게이팅하는 상태머신. 인스턴스 하나가
 * 한 캐릭터(또는 한 대화 채널)의 표정 상태를 보유한다.
 */
export class ExpressionStateMachine {
  private expression: ExpressionKey = "neutral";
  private changedAtMs = 0;
  private lastCandidateAtMs = 0;
  private readonly config: Required<ExpressionStateConfig>;

  constructor(config: ExpressionStateConfig = {}, initial: ExpressionKey = "neutral") {
    this.expression = initial;
    this.config = {
      entryConfidence: config.entryConfidence ?? 0.4,
      polarityFlipExtraMs: config.polarityFlipExtraMs ?? 500,
      neutralReturnMs: config.neutralReturnMs ?? 0,
    };
  }

  current(): ExpressionKey {
    return this.expression;
  }

  /** 후보 표정을 받아 전환할지 결정한다 */
  update(input: ExpressionUpdate): ExpressionDecision {
    const { candidate, nowMs } = input;
    const confidence = input.confidence ?? 1;
    this.lastCandidateAtMs = nowMs;

    if (candidate === this.expression) {
      return { expression: this.expression, changed: false, heldReason: "same" };
    }
    // 미세 신호(낮은 신뢰도)는 무시 — neutral로의 약한 흔들림도 차단
    if (confidence < this.config.entryConfidence) {
      return { expression: this.expression, changed: false, heldReason: "low_confidence" };
    }

    const elapsed = nowMs - this.changedAtMs;
    const cooldown = expressionCooldownMs(this.expression);
    // 극성 반전은 positive↔negative만 (ambiguous/neutral 경유는 반전 아님)
    const from = expressionPolarity(this.expression);
    const to = expressionPolarity(candidate);
    const isFlip =
      (from === "positive" && to === "negative") || (from === "negative" && to === "positive");
    const requiredHold = cooldown + (isFlip ? this.config.polarityFlipExtraMs : 0);

    if (elapsed < requiredHold) {
      return {
        expression: this.expression,
        changed: false,
        heldReason: isFlip ? "polarity_flip" : "cooldown",
      };
    }

    this.expression = candidate;
    this.changedAtMs = nowMs;
    return { expression: candidate, changed: true };
  }

  /**
   * 시간 경과만으로 호출 — neutralReturnMs가 설정됐고 마지막 후보 이후 그만큼
   * 지났으면 neutral로 복귀한다. (애니메이션 루프/타이머에서 주기적으로 호출)
   */
  tick(nowMs: number): ExpressionDecision {
    if (
      this.config.neutralReturnMs > 0 &&
      this.expression !== "neutral" &&
      nowMs - this.lastCandidateAtMs >= this.config.neutralReturnMs &&
      nowMs - this.changedAtMs >= expressionCooldownMs(this.expression)
    ) {
      this.expression = "neutral";
      this.changedAtMs = nowMs;
      return { expression: "neutral", changed: true };
    }
    return { expression: this.expression, changed: false };
  }
}
