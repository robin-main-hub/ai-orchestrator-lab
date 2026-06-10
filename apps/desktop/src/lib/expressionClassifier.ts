import type { LoopStatus } from "./closedLoopController";
import type { PaneOutcome } from "./closedLoopExecution";
import { DEFAULT_EXPRESSION, WORK_STATE_EXPRESSION, type ExpressionKey } from "./expressionTaxonomy";

/**
 * Pick the persona's facial expression from context. Work context (a closed-loop
 * outcome or run status) takes precedence over casual chat sentiment, so during
 * a run the face tracks the task; otherwise a light keyword sentiment over the
 * latest message drives a casual-conversation expression. Pure, so it is
 * unit-tested. Returns a key; the UI resolves it to a sprite with fallback.
 */

const OUTCOME_EXPRESSION: Record<PaneOutcome, ExpressionKey> = {
  progressing: "curiosity",
  awaiting_input: "confusion",
  needs_approval: "nervousness",
  blocked: "nervousness",
  completed: "pride",
  failed: "sadness",
};

const SENTIMENT_RULES: ReadonlyArray<{ test: RegExp; expression: ExpressionKey }> = [
  { test: /ㅋㅋ|ㅎㅎ|lol|ㅍㅎ|하하|ㅋ{2,}/i, expression: "amusement" },
  { test: /고마|감사|thank|땡큐/i, expression: "gratitude" },
  { test: /사랑|❤|♥|최고야|좋아해/i, expression: "love" },
  { test: /부끄|\/\/+|헤헤|쑥스|얼굴.?빨/i, expression: "embarrassment" },
  { test: /짜증|닥쳐|꺼져|싫어|성가|annoy/i, expression: "annoyance" },
  { test: /화나|열받|빡쳐|angry|분노/i, expression: "anger" },
  { test: /미안|죄송|sorry|잘못했/i, expression: "remorse" },
  { test: /슬프|우울|힘들|눈물|ㅠ|ㅜ|sad/i, expression: "sadness" },
  { test: /헐|대박|진짜\?|wow|뭐\?|믿기지/i, expression: "surprise" },
  { test: /야호|신난|기뻐|행복|좋다|됐다|해냈/i, expression: "joy" },
  { test: /무서|두려|위험|큰일|panic/i, expression: "fear" },
];

export type ExpressionContext = {
  /** closed-loop step outcome (highest priority during a run) */
  outcome?: PaneOutcome;
  /** overall run status */
  loopStatus?: LoopStatus;
  /** whether a run is actively executing */
  running?: boolean;
  /** latest casual message text */
  text?: string;
};

export function classifyExpression(context: ExpressionContext): ExpressionKey {
  if (context.outcome) {
    return OUTCOME_EXPRESSION[context.outcome];
  }
  if (context.loopStatus) {
    return WORK_STATE_EXPRESSION[context.loopStatus];
  }
  if (context.running) {
    return WORK_STATE_EXPRESSION.running;
  }
  const text = (context.text ?? "").trim();
  if (text) {
    for (const rule of SENTIMENT_RULES) {
      if (rule.test.test(text)) {
        return rule.expression;
      }
    }
    if (text.includes("?")) {
      return "curiosity";
    }
  }
  return DEFAULT_EXPRESSION;
}
