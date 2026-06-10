import { describe, expect, it } from "vitest";
import { changeFromToolCall, touchesFromChanges, type WorkspaceChange } from "./workspaceChangeLedger";
import type { ToolCall } from "./codingChat";

const NOW = "2026-06-11T01:00:00.000Z";

function call(tool: ToolCall["tool"], input: Record<string, unknown>): ToolCall {
  return { id: "t1", tool, input, status: "completed" } as ToolCall;
}

describe("changeFromToolCall", () => {
  it("write — 경로/미리보기/줄수/mutating", () => {
    const change = changeFromToolCall(call("write", { path: "src/a.ts", content: "l1\nl2\nl3" }), NOW, 1);
    expect(change).toMatchObject({ kind: "write", path: "src/a.ts", lineCount: 3, mutating: true });
    expect(change!.preview).toContain("l1");
  });

  it("edit — old/new 4줄씩 -/+ 미리보기", () => {
    const change = changeFromToolCall(
      call("edit", { path: "src/b.ts", old_string: "foo", new_string: "bar" }),
      NOW,
      2,
    );
    expect(change!.kind).toBe("edit");
    expect(change!.preview).toBe("- foo\n+ bar");
    expect(change!.mutating).toBe(true);
  });

  it("read/grep는 비변경, bash는 변경, 빈 입력은 null", () => {
    expect(changeFromToolCall(call("read", { path: "x" }), NOW, 3)!.mutating).toBe(false);
    expect(changeFromToolCall(call("grep", { pattern: "p" }), NOW, 4)!.path).toBe("p");
    expect(changeFromToolCall(call("bash", { command: "pnpm test" }), NOW, 5)!.mutating).toBe(true);
    expect(changeFromToolCall(call("write", { path: "" }), NOW, 6)).toBeNull();
    expect(changeFromToolCall(call("todo", { items: [] }), NOW, 7)).toBeNull();
  });
});

describe("touchesFromChanges", () => {
  it("파일별 집계 — 최강 종류 승격, bash 제외, 최신순", () => {
    const changes: WorkspaceChange[] = [
      { id: "1", at: "2026-06-11T01:00:00Z", kind: "read", path: "a.ts", mutating: false },
      { id: "2", at: "2026-06-11T01:01:00Z", kind: "write", path: "a.ts", mutating: true },
      { id: "3", at: "2026-06-11T01:02:00Z", kind: "read", path: "b.ts", mutating: false },
      { id: "4", at: "2026-06-11T01:03:00Z", kind: "bash", path: "pnpm test", mutating: true },
    ];
    const touches = touchesFromChanges(changes);
    expect(touches).toHaveLength(2);
    expect(touches[0]!.path).toBe("b.ts");
    const a = touches.find((touch) => touch.path === "a.ts")!;
    expect(a.kind).toBe("write");
    expect(a.count).toBe(2);
  });
});
