import { describe, expect, it } from "vitest";
import { parseConversationSlashCommand } from "./conversationSlashCommands";

describe("parseConversationSlashCommand", () => {
  it("returns null for regular chat text", () => {
    expect(parseConversationSlashCommand("안녕하세요")).toBeNull();
    expect(parseConversationSlashCommand("1/2는 0.5다")).toBeNull();
    expect(parseConversationSlashCommand("")).toBeNull();
  });

  it("parses /fork with and without a task", () => {
    expect(parseConversationSlashCommand("/fork")).toEqual({ kind: "fork", task: undefined });
    expect(parseConversationSlashCommand("/fork 로그인 버그 수정")).toEqual({
      kind: "fork",
      task: "로그인 버그 수정",
    });
  });

  it("parses mode and session commands case-insensitively", () => {
    expect(parseConversationSlashCommand("/PLAN")).toEqual({ kind: "plan" });
    expect(parseConversationSlashCommand("/build")).toEqual({ kind: "build" });
    expect(parseConversationSlashCommand("/compact")).toEqual({ kind: "compact" });
    expect(parseConversationSlashCommand("/help")).toEqual({ kind: "help" });
  });

  it("flags unknown commands with their name", () => {
    expect(parseConversationSlashCommand("/frok typo")).toEqual({ kind: "unknown", name: "frok" });
  });
});
