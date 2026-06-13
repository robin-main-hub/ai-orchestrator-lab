import type { GithubContextAttachment } from "@ai-orchestrator/protocol";
import { buildGithubContextPrompt } from "./githubContext";

/**
 * Single source of truth for what extra system context a coding provider request
 * carries. Extracted from CodingWorkbench's `complete` so the first-request-only
 * injection contract can be proven deterministically (D2.5 smoke):
 *
 *   - Attachment bodies + GitHub context are injected on the FIRST request only
 *     (requestSeq === 1). Later tool rounds get a short attachment ref and NO
 *     GitHub excerpt — so a multi-round tool loop never repeats the bodies and
 *     the token budget can't explode.
 *   - GitHub context itself is bounded inside buildGithubContextPrompt
 *     (maxItems / maxChars + an explicit "dropped" note).
 */

export type CodingProviderMessage = { role: "user" | "assistant" | "system"; content: string };

export function assembleCodingRequestMessages(input: {
  messages: CodingProviderMessage[];
  requestSeq: number;
  /** attachmentDelivery.firstRequestContext — full bodies, first request only */
  attachmentFirstContext?: string;
  /** attachmentDelivery.followupContext — short ref, later rounds */
  attachmentFollowupContext?: string;
  githubContext?: GithubContextAttachment[];
  githubContextOpts?: { maxItems?: number; maxChars?: number };
}): CodingProviderMessage[] {
  const isFirst = input.requestSeq === 1;
  const attachmentContext = isFirst ? input.attachmentFirstContext : input.attachmentFollowupContext;
  const githubContext = isFirst ? buildGithubContextPrompt(input.githubContext, input.githubContextOpts) : undefined;
  const extra = [attachmentContext, githubContext].filter((value): value is string => Boolean(value));
  return extra.length > 0
    ? [...input.messages, ...extra.map((content) => ({ role: "system" as const, content }))]
    : input.messages;
}

/**
 * Redacted trace payload for a GitHub context attach. Carries only references
 * and observation metadata — never the bounded body excerpt, the token, or
 * request headers — so a private-repo body never lands in the event log.
 */
export function buildGithubContextTracePayload(attachment: GithubContextAttachment): Record<string, unknown> {
  return {
    repoFullName: attachment.repoFullName,
    kind: attachment.kind,
    number: attachment.number,
    title: attachment.title,
    url: attachment.url,
    observedAt: attachment.observedAt,
    truncated: attachment.truncated,
    truthStatus: attachment.truthStatus,
    summarySource: attachment.summarySource,
  };
}
