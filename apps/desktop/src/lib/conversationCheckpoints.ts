import type { ConversationMessage } from "@ai-orchestrator/protocol";

/**
 * Turn-level rollback for the conversation workbench (item 9).
 *
 * Non-destructive by design: rollback only truncates the transcript back to
 * the start of the turn and reports which workspace files that turn's tool
 * calls touched — it never reverts files on disk (the Diff panel + git are
 * the recovery path for file contents).
 */

export type TurnRollbackResult = {
  /** transcript truncated to just before the turn's user message */
  messages: ConversationMessage[];
  removedCount: number;
  /** workspace paths touched by tool calls inside the removed turn */
  touchedFiles: string[];
};

/**
 * Index of the user message that started the turn containing the given
 * assistant message. Walks backwards past delegation/assistant/tool entries.
 * Returns -1 when the assistant message is unknown or has no user turn.
 */
export function findTurnStartIndex(
  messages: ReadonlyArray<ConversationMessage>,
  assistantMessageId: string,
): number {
  const assistantIndex = messages.findIndex(
    (message) => message.id === assistantMessageId && message.role === "assistant",
  );
  if (assistantIndex === -1) return -1;
  for (let index = assistantIndex; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") return index;
  }
  return -1;
}

function collectTouchedFiles(removed: ReadonlyArray<ConversationMessage>): string[] {
  const files = new Set<string>();
  for (const message of removed) {
    const toolCalls = message.metadata?.toolCalls;
    if (!Array.isArray(toolCalls)) continue;
    for (const call of toolCalls) {
      if (!call || typeof call !== "object") continue;
      const record = call as { tool?: unknown; status?: unknown; input?: unknown };
      if (record.status !== "completed") continue;
      if (record.tool !== "write" && record.tool !== "edit" && record.tool !== "bash") continue;
      const input = (record.input ?? {}) as Record<string, unknown>;
      const path = typeof input.path === "string" ? input.path.trim() : "";
      if (path) files.add(path);
      else if (record.tool === "bash" && typeof input.command === "string") {
        files.add(`(bash) ${input.command.slice(0, 80)}`);
      }
    }
  }
  return Array.from(files);
}

/** null when the assistant message (or its user turn) cannot be located */
export function rollbackToTurn(
  messages: ReadonlyArray<ConversationMessage>,
  assistantMessageId: string,
): TurnRollbackResult | null {
  const startIndex = findTurnStartIndex(messages, assistantMessageId);
  if (startIndex === -1) return null;
  const removed = messages.slice(startIndex);
  return {
    messages: messages.slice(0, startIndex),
    removedCount: removed.length,
    touchedFiles: collectTouchedFiles(removed),
  };
}
