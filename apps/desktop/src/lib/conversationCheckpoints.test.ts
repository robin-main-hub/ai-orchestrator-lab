import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import { findTurnStartIndex, rollbackToTurn } from "./conversationCheckpoints";

function message(
  id: string,
  role: "user" | "assistant",
  metadata?: Record<string, unknown>,
): ConversationMessage {
  return { id, sessionId: "session_test", role, content: id, createdAt: "2026-06-11T00:00:00.000Z", metadata };
}

const transcript: ConversationMessage[] = [
  message("u1", "user"),
  message("a1", "assistant"),
  message("u2", "user"),
  message("a2", "assistant", {
    toolCalls: [
      { tool: "write", status: "completed", input: { path: "src/app.ts" } },
      { tool: "read", status: "completed", input: { path: "src/ignored.ts" } },
      { tool: "edit", status: "denied", input: { path: "src/denied.ts" } },
      { tool: "bash", status: "completed", input: { command: "pnpm test" } },
    ],
  }),
  message("a2b", "assistant"),
];

describe("findTurnStartIndex", () => {
  it("finds the user message that started the turn", () => {
    expect(findTurnStartIndex(transcript, "a2")).toBe(2);
    expect(findTurnStartIndex(transcript, "a1")).toBe(0);
  });

  it("returns -1 for unknown or non-assistant ids", () => {
    expect(findTurnStartIndex(transcript, "nope")).toBe(-1);
    expect(findTurnStartIndex(transcript, "u2")).toBe(-1);
  });
});

describe("rollbackToTurn", () => {
  it("truncates the transcript and reports touched files from mutating tools only", () => {
    const result = rollbackToTurn(transcript, "a2");
    expect(result).not.toBeNull();
    expect(result!.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(result!.removedCount).toBe(3);
    expect(result!.touchedFiles).toEqual(["src/app.ts", "(bash) pnpm test"]);
  });

  it("does not mutate the original array", () => {
    const before = transcript.length;
    rollbackToTurn(transcript, "a2");
    expect(transcript).toHaveLength(before);
  });

  it("returns null when the assistant message is unknown", () => {
    expect(rollbackToTurn(transcript, "missing")).toBeNull();
  });
});
