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

  it("실행형 디스패치가 없으면 첫 required 항목 (sourceItemId+summary만)", () => {
    expect(deriveApprovalToastItem([makeItem()])).toEqual({ sourceItemId: "source_1", summary: "MiMo 호출 승인 필요" });
  });

  it("replayKind=tmux_dispatch(자율실행) 승인을 우선 — summary는 라벨, 가짜 명령(command) 안 만듦", () => {
    // 실제 큐의 summary는 명령이 아니라 사람용 라벨이다("터미널 실행 · 사유").
    const result = deriveApprovalToastItem([
      makeItem({ id: "a1", sourceItemId: "s1", summary: "공급자 호출 · 모델 응답" }),
      makeItem({ id: "a2", sourceItemId: "s2", summary: "터미널 실행 · 빌드 검증", replayKind: "tmux_dispatch" }),
    ]);
    expect(result).toEqual({ sourceItemId: "s2", summary: "터미널 실행 · 빌드 검증" });
    expect(result).not.toHaveProperty("command"); // 정직: 큐엔 실제 명령이 없으니 command 미생성
  });

  it("action=terminal_run 승인도 실행형으로 우선 인식(라벨만)", () => {
    const result = deriveApprovalToastItem([makeItem({ sourceItemId: "s3", summary: "terminal_run from agent", action: "terminal_run" })]);
    expect(result).toEqual({ sourceItemId: "s3", summary: "terminal_run from agent" });
  });
});
