import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { isAutoApprovableCommand, type SafeCommandVerdict } from "./safeCommandPolicy";

/**
 * Honest evidence for a single approval item — the SINGLE source of truth for
 * what the UI may show and what the safe-subset bulk-approve (task C) may act on.
 *
 * The cardinal rule: a command is shown ONLY when the item carries a real
 * `commandPreview`. The human-readable `summary` is a label, never a command, so
 * it is never treated as one. Items without a real command resolve to `cost`
 * (provider token estimate) or `none`.
 *
 *   - command : terminal/tmux item with a real redaction-safe commandPreview.
 *               `safe` is the safeCommandPolicy verdict — the gate for any
 *               automated/bulk approval (analyzable ⇔ a command string exists).
 *   - cost    : provider_completion item — model call with a token estimate, no
 *               shell command. Bulk-approval must NOT treat this as safe.
 *   - none    : everything else (merge/rollback/secret/external/run-step) — no
 *               command preview available at this layer.
 */
export type ApprovalEvidence =
  | { kind: "command"; commandPreview: string; safe: SafeCommandVerdict }
  | { kind: "cost"; costEstimateTokens: number }
  | { kind: "none" };

export function deriveApprovalEvidence(item: ApprovalQueueItem): ApprovalEvidence {
  const command = typeof item.commandPreview === "string" ? item.commandPreview.trim() : "";
  if (command) {
    return { kind: "command", commandPreview: command, safe: isAutoApprovableCommand(command) };
  }
  if (item.action === "provider_completion" && typeof item.costEstimateTokens === "number") {
    return { kind: "cost", costEstimateTokens: item.costEstimateTokens };
  }
  return { kind: "none" };
}

/**
 * The exact predicate task C's "안전 검증 항목 승인" uses: an item is eligible for
 * safe-subset bulk approval only if it has a REAL command AND that command is
 * auto-approvable under safeCommandPolicy. No commandPreview ⇒ never eligible.
 */
export function isSafeSubsetApprovable(item: ApprovalQueueItem): boolean {
  const evidence = deriveApprovalEvidence(item);
  return evidence.kind === "command" && evidence.safe.allowed;
}

export type SafeSubsetPartition = {
  /** required items that are safe to auto-approve in bulk (real safe command) */
  approvable: ApprovalQueueItem[];
  /** required items deliberately left out (no command, unsafe command, or non-command effect) */
  excluded: ApprovalQueueItem[];
};

/**
 * Splits the pending (required) queue into the safe-subset bulk-approve target
 * and everything excluded. This is the data the "안전 검증 항목 승인" affordance
 * shows as "대상 N · 제외 M". Resolved (non-required) items are ignored entirely
 * so the counts reflect only what an operator could act on right now.
 */
export function partitionSafeSubset(queue: ReadonlyArray<ApprovalQueueItem>): SafeSubsetPartition {
  const pending = queue.filter((item) => item.state === "required");
  const approvable: ApprovalQueueItem[] = [];
  const excluded: ApprovalQueueItem[] = [];
  for (const item of pending) {
    (isSafeSubsetApprovable(item) ? approvable : excluded).push(item);
  }
  return { approvable, excluded };
}
