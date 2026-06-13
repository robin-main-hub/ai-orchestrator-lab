import type { GithubContextAttachment, GithubPullRequestDetail } from "@ai-orchestrator/protocol";

/**
 * Pure helpers for D2 — turning a user-selected, server-observed GitHub PR into
 * a bounded coding-context attachment and injecting attachments into the FIRST
 * coding request only.
 *
 * Honesty invariants:
 *  - The excerpt is a deterministic slice of the real GitHub body (no LLM
 *    rewriting), so `truthStatus` stays "observed" and `summarySource` is
 *    "github_observed".
 *  - Never the whole raw body: the excerpt is capped and `truncated` is set.
 *  - Injection is bounded (maxItems / maxChars) and what gets dropped is stated,
 *    so the prompt can't silently explode or pretend to carry more than it does.
 */

const MAX_EXCERPT_CHARS = 6000;
const MAX_CONTEXT_ITEMS = 5;
const MAX_CONTEXT_CHARS = 12000;

/** stable dedup key — same repo + PR number never attaches twice */
export function prContextKey(repoFullName: string, pullNumber: number): string {
  return `gh:${repoFullName}:pull_request:${pullNumber}`;
}

export function buildPrContextAttachment(input: {
  detail: GithubPullRequestDetail;
  repoFullName: string;
  observedAt: string;
  maxExcerptChars?: number;
}): GithubContextAttachment {
  const { detail, repoFullName, observedAt } = input;
  const limit = input.maxExcerptChars ?? MAX_EXCERPT_CHARS;
  const body = typeof detail.body === "string" ? detail.body : "";
  const diffStat =
    (detail.additions !== null && detail.deletions !== null ? ` · +${detail.additions}/-${detail.deletions}` : "") +
    (detail.changedFiles !== null ? ` · 파일 ${detail.changedFiles}` : "");
  const head = [`#${detail.number} ${detail.title}`, `${detail.baseRef} ← ${detail.headRef} · ${detail.author}${diffStat}`].join("\n");
  const overBudget = body.length > limit;
  const bodyExcerpt = overBudget ? body.slice(0, limit) : body;
  const observedExcerpt = [head, bodyExcerpt].filter((part) => part.trim()).join("\n\n");
  return {
    id: prContextKey(repoFullName, detail.number),
    kind: "pull_request",
    repoFullName,
    number: detail.number,
    title: detail.title,
    url: detail.htmlUrl,
    observedAt,
    truthStatus: "observed",
    observedExcerpt,
    truncated: overBudget,
    summarySource: "github_observed",
    source: "github_api",
  };
}

/** idempotent attach — same id replaces in place (refreshes observedAt), never duplicates */
export function upsertContextAttachment(
  existing: ReadonlyArray<GithubContextAttachment>,
  next: GithubContextAttachment,
): GithubContextAttachment[] {
  return [...existing.filter((item) => item.id !== next.id), next];
}

export function removeContextAttachment(
  existing: ReadonlyArray<GithubContextAttachment>,
  id: string,
): GithubContextAttachment[] {
  return existing.filter((item) => item.id !== id);
}

export function isContextAttached(existing: ReadonlyArray<GithubContextAttachment> | undefined, id: string): boolean {
  return Boolean(existing?.some((item) => item.id === id));
}

/**
 * Build the system-context block for a coding request. Bounded by maxItems and a
 * total char budget; states how many of the attached items were actually
 * included so the model is never misled about coverage.
 */
export function buildGithubContextPrompt(
  attachments: ReadonlyArray<GithubContextAttachment> | undefined,
  opts?: { maxItems?: number; maxChars?: number },
): string | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  const maxItems = opts?.maxItems ?? MAX_CONTEXT_ITEMS;
  const maxChars = opts?.maxChars ?? MAX_CONTEXT_CHARS;
  const blocks: string[] = [];
  let used = 0;
  let included = 0;
  for (const attachment of attachments.slice(0, maxItems)) {
    const block = [
      `--- GitHub ${attachment.kind} (사용자 선택·읽기전용): ${attachment.repoFullName}#${attachment.number ?? attachment.path ?? ""} ---`,
      `제목: ${attachment.title}`,
      `URL: ${attachment.url} · 관측 ${attachment.observedAt}${attachment.truncated ? " · (본문 일부 — 원본이 더 김)" : ""}`,
      attachment.observedExcerpt,
      "--- 끝 ---",
    ].join("\n");
    if (used + block.length > maxChars && included > 0) break; // 최소 1개는 보장
    blocks.push(block);
    used += block.length;
    included += 1;
  }
  const dropped = attachments.length - included;
  const note =
    dropped > 0
      ? `(참고: 첨부된 GitHub 컨텍스트 ${attachments.length}개 중 ${included}개만 이 요청에 포함됨 — 나머지는 길이 한도로 제외)`
      : undefined;
  return [
    "사용자가 명시적으로 선택해 첨부한 GitHub 컨텍스트입니다(읽기 전용·observed). 이 내용만 근거로 삼고, 여기 없는 PR/파일 내용은 보았다고 가정하지 않습니다.",
    ...blocks,
    note,
  ]
    .filter(Boolean)
    .join("\n\n");
}
