/**
 * Persona facial-expression taxonomy.
 *
 * The 28 keys match SillyTavern's expression-sprite standard (the go_emotions
 * label set), so portraits a user crawls/generates for this orchestrator are
 * reusable in SillyTavern and vice-versa. Drop sprites at
 * `agents/<slug>/expressions/<key>.png`. Three tiers let a user prepare a small
 * set first and grow to the full sheet.
 */

export const EXPRESSION_KEYS = [
  "neutral",
  "joy",
  "curiosity",
  "surprise",
  "sadness",
  "anger",
  "embarrassment",
  "pride",
  "amusement",
  "confusion",
  "nervousness",
  "disappointment",
  "love",
  "relief",
  "excitement",
  "annoyance",
  "admiration",
  "approval",
  "caring",
  "desire",
  "disapproval",
  "disgust",
  "fear",
  "gratitude",
  "grief",
  "optimism",
  "realization",
  "remorse",
] as const;

export type ExpressionKey = (typeof EXPRESSION_KEYS)[number];

/** Preparation tiers — a user can crawl tier 0 first, then grow. */
export const EXPRESSION_TIERS: {
  essential: ExpressionKey[];
  recommended: ExpressionKey[];
  full: readonly ExpressionKey[];
} = {
  essential: ["neutral", "joy", "curiosity", "surprise", "sadness", "anger", "embarrassment", "pride"],
  recommended: ["amusement", "confusion", "nervousness", "disappointment", "love", "relief", "excitement", "annoyance"],
  full: EXPRESSION_KEYS,
};

export const DEFAULT_EXPRESSION: ExpressionKey = "neutral";

/** Closed-loop / run states mapped to the expression a persona should wear. */
export const WORK_STATE_EXPRESSION = {
  idle: "neutral",
  progressing: "curiosity",
  awaiting_input: "confusion",
  needs_approval: "nervousness",
  blocked: "nervousness",
  completed: "pride",
  failed: "sadness",
  cancelled: "neutral",
  awaiting_human: "nervousness",
  running: "curiosity",
} as const satisfies Record<string, ExpressionKey>;

/** Korean labels for UI / authoring tools. */
export const EXPRESSION_LABEL_KO: Record<ExpressionKey, string> = {
  neutral: "평상",
  joy: "기쁨",
  curiosity: "집중",
  surprise: "놀람",
  sadness: "슬픔",
  anger: "화남",
  embarrassment: "부끄럼",
  pride: "뿌듯",
  amusement: "웃음",
  confusion: "혼란",
  nervousness: "불안",
  disappointment: "실망",
  love: "애정",
  relief: "안도",
  excitement: "흥분",
  annoyance: "짜증",
  admiration: "감탄",
  approval: "수긍",
  caring: "배려",
  desire: "갈망",
  disapproval: "반대",
  disgust: "혐오",
  fear: "두려움",
  gratitude: "감사",
  grief: "비탄",
  optimism: "낙관",
  realization: "깨달음",
  remorse: "후회",
};

export function isExpressionKey(value: string): value is ExpressionKey {
  return (EXPRESSION_KEYS as readonly string[]).includes(value);
}
