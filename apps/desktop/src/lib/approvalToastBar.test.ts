import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { deriveApprovalToastItem } from "./approvalToastBar";

function makeItem(overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem {
  return {
    id: "approval_1",
    sourceItemId: "source_1",
    summary: "MiMo 호출 승인 필요",
    requestedBy: "agent",
    permissions: ["run_safe_commands"],
    state: "required",
    createdAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveApprovalToastItem", () => {
  it("빈 큐면 undefined(바 숨김)", () => {
    expect(deriveApprovalToastItem([])).toBeUndefined();
  });

  it("required가 없으면 undefined", () => {
    expect(
      deriveApprovalToastItem([makeItem({ state: "approved" }), makeItem({ state: "rejected" })]),
    ).toBeUndefined();
  });

  it("실행형 디스패치가 없으면 첫 required 항목, command 없음", () => {
    expect(deriveApprovalToastItem([makeItem()])).toEqual({
      command: undefined,
      sourceItemId: "source_1",
      summary: "MiMo 호출 승인 필요",
    });
  });

  it("replayKind=tmux_dispatch(자율실행) 승인을 우선하고 summary를 명령으로 노출", () => {
    const result = deriveApprovalToastItem([
      makeItem({ id: "a1", sourceItemId: "s1", summary: "provider 승인" }),
      makeItem({ id: "a2", sourceItemId: "s2", summary: "pnpm test", replayKind: "tmux_dispatch" }),
    ]);
    expect(result).toEqual({ command: "pnpm test", sourceItemId: "s2", summary: "pnpm test" });
  });

  it("action=terminal_run 승인도 실행형으로 인식", () => {
    const result = deriveApprovalToastItem([makeItem({ sourceItemId: "s3", summary: "git status", action: "terminal_run" })]);
    expect(result?.command).toBe("git status");
  });
});
