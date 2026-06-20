import { describe, expect, it } from "vitest";
import {
  appendUserMessage,
  createCodingSession,
  pushCheckpoint,
  redoLastUndo,
  toolTitle,
  undoToLastCheckpoint,
} from "./codingChat";

// Characterization tests (no behavior change) for the two previously-unasserted
// exports of codingChat.ts: redoLastUndo and toolTitle. The existing
// codingChat.test.ts drives pushCheckpoint + undoToLastCheckpoint (the undo half
// of the checkpoint state machine) but never calls redoLastUndo, and never calls
// toolTitle directly. We pin the redo half and the tool-title switch here.
//
// redoLastUndo is the inverse of undoToLastCheckpoint: undo pops the last turn's
// messages off and pushes that dropped slice onto session.redoStack; redo pops
// the most-recent snapshot back off redoStack and re-appends those messages. The
// load-bearing invariants (from the source):
//   - redo restores exactly the messages undo dropped, and shrinks redoStack by 1.
//   - empty/absent redoStack OR an empty top snapshot is a no-op returning the
//     SAME session reference (no touch, no updatedAt bump).
//   - appendUserMessage resets redoStack to [] — a new user turn forfeits redo.

const NOW = "2026-06-10T00:00:00.000Z";
const LATER = "2026-06-10T01:00:00.000Z";

const baseSession = () => createCodingSession({ id: "cs1", now: NOW, providerProfileId: "p1", modelId: "m1" });

describe("redoLastUndo", () => {
  it("re-applies the most recently undone turn: messages restored, redoStack shrinks by one", () => {
    let session = baseSession();
    session = pushCheckpoint(session, { id: "cp1", label: "턴 1", now: NOW });
    session = appendUserMessage(session, { id: "u1", text: "로그인 버그 고쳐줘", now: NOW });
    expect(session.messages).toHaveLength(1);

    // undo drops the turn and parks it on redoStack
    session = undoToLastCheckpoint(session, NOW);
    expect(session.messages).toHaveLength(0);
    expect(session.redoStack).toHaveLength(1);

    // redo re-appends exactly the dropped messages, empties the redo stack
    session = redoLastUndo(session, LATER);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]!.id).toBe("u1");
    expect(session.redoStack).toHaveLength(0);
    expect(session.status).toBe("idle");
    expect(session.error).toBeUndefined();
    expect(session.updatedAt).toBe(LATER); // touched
  });

  it("is a no-op (same reference) when there is nothing to redo", () => {
    const session = baseSession();
    // fresh session: redoStack is absent/empty → identity return, no updatedAt bump
    expect(redoLastUndo(session, LATER)).toBe(session);
  });

  it("appendUserMessage clears the redoStack — a new user turn forfeits the pending redo", () => {
    let session = baseSession();
    session = pushCheckpoint(session, { id: "cp1", label: "턴 1", now: NOW });
    session = appendUserMessage(session, { id: "u1", text: "첫 턴", now: NOW });
    session = undoToLastCheckpoint(session, NOW);
    expect(session.redoStack).toHaveLength(1);

    // a brand-new user message wipes the redo history
    session = appendUserMessage(session, { id: "u2", text: "다른 작업", now: NOW });
    expect(session.redoStack).toEqual([]);

    // redo now has nothing to restore → no-op same reference
    expect(redoLastUndo(session, LATER)).toBe(session);
  });
});

describe("toolTitle", () => {
  it("renders a concise title per tool kind from its input", () => {
    expect(toolTitle("read", { path: "src/app.ts" })).toBe("읽기 src/app.ts");
    expect(toolTitle("grep", { pattern: "TODO" })).toBe('검색 "TODO"');
    expect(toolTitle("glob", { pattern: "**/*.ts" })).toBe("파일 찾기 **/*.ts");
    expect(toolTitle("write", { path: "out.md" })).toBe("파일 쓰기 out.md");
    expect(toolTitle("edit", { path: "out.md" })).toBe("수정 out.md");
    expect(toolTitle("todo", {})).toBe("할 일 목록");
  });

  it("bash: shows the command truncated to 80 chars, falling back to a label when empty", () => {
    expect(toolTitle("bash", { command: "pnpm test" })).toBe("pnpm test");
    expect(toolTitle("bash", {})).toBe("명령 실행");
    const long = "x".repeat(120);
    expect(toolTitle("bash", { command: long })).toBe("x".repeat(80));
  });

  it("coerces missing string fields to empty strings rather than 'undefined'", () => {
    expect(toolTitle("read", {})).toBe("읽기 ");
    expect(toolTitle("grep", {})).toBe('검색 ""');
  });
});
