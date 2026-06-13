import type { ModelDescriptor } from "@ai-orchestrator/protocol";

/**
 * How many characters of *injected* context (attachment bodies, GitHub excerpts)
 * a coding request may carry, scaled to the selected model.
 *
 * Why model-aware instead of a fixed small cap: large-context models can take
 * far more input, and hard-clamping injected context to a few KB makes the
 * coding surface needlessly cramped for someone pasting a sizeable doc. So:
 *   - When the model's contextWindow is known, budget a fraction of it (and
 *     NEVER exceed the window — a small model must not be over-fed).
 *   - When the model is unknown, fall back to a generous floor so a normal
 *     analysis paste is never truncated.
 *   - Always cap below the provider's per-message char limit so a single
 *     request can't blow past the wire schema.
 */

/** rough chars/token for budgeting — conservative; code/Korean skew lower */
const CHARS_PER_TOKEN = 3.5;

/** providerCompletionMessageSchema caps message content at 200_000 chars */
export const PROVIDER_MESSAGE_CHAR_CAP = 200_000;

export function modelContextCharBudget(
  model?: Pick<ModelDescriptor, "contextWindow"> | undefined,
  opts?: { fraction?: number; floorChars?: number; capChars?: number },
): number {
  const fraction = opts?.fraction ?? 0.3;
  const unknownFloor = opts?.floorChars ?? 48_000;
  const cap = opts?.capChars ?? 180_000;
  const contextWindow = model?.contextWindow;
  if (!contextWindow || contextWindow <= 0) {
    // unknown model — be generous but never exceed the provider message cap
    return Math.min(cap, unknownFloor);
  }
  // known window: a fraction of it, capped (never the whole window, leave room
  // for system prompt + history + output), and never above the provider cap.
  const budget = Math.round(contextWindow * fraction * CHARS_PER_TOKEN);
  return Math.min(cap, Math.max(0, budget));
}
