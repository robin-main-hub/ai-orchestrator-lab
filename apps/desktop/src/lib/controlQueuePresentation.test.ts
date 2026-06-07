import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import {
  controlQueueActionFeedback,
  controlQueueLaneLabel,
  controlQueueMetaItems,
  controlQueuePermissionLabel,
  controlQueueStateLabel,
  sanitizeControlQueueText,
} from "./controlQueuePresentation";

describe("controlQueuePresentation", () => {
  it("maps queue lanes and states to Korean operator labels", () => {
    expect(controlQueueLaneLabel("approve")).toBe("승인");
    expect(controlQueueLaneLabel("ask")).toBe("질문 요청");
    expect(controlQueueLaneLabel("edit")).toBe("수정 초안");
    expect(controlQueueLaneLabel("delegate")).toBe("실행 위임");
    expect(controlQueueLaneLabel("block")).toBe("차단");
    expect(controlQueueLaneLabel("archive")).toBe("거부");
    expect(controlQueueStateLabel("required")).toBe("승인 필요");
    expect(controlQueueStateLabel("approved")).toBe("승인됨");
  });

  it("uses Korean permission summaries instead of raw permission ids", () => {
    expect(controlQueuePermissionLabel("run_dangerous_commands")).toBe("위험 명령 실행");
    expect(controlQueuePermissionLabel("remote_workspace")).toBe("원격 작업공간");
    expect(controlQueuePermissionLabel("unknown_permission")).toBe("unknown permission");
  });

  it("redacts secrets, urls, local paths, and raw tool input before queue text is shown or stored", () => {
    expect(
      sanitizeControlQueueText(
        "tool input {\"cmd\":\"deploy\"} with Bearer abc123 at https://internal.example.test and /Users/robin/project using sk-live-secret API_KEY=value",
      ),
    ).toBe("도구 입력 [redacted]");
  });

  it("returns action feedback labels for each live queue action", () => {
    expect(controlQueueActionFeedback("ask")).toBe("대화 입력창에 질문 초안 생성");
    expect(controlQueueActionFeedback("edit")).toBe("작업 항목에 수정 초안 생성");
    expect(controlQueueActionFeedback("delegate")).toBe("작업 항목에 실행 위임 초안 생성");
    expect(controlQueueActionFeedback("block")).toBe("항목이 차단됩니다");
  });

  it("creates compact execution context chips for queue cards", () => {
    const item: ApprovalQueueItem = {
      id: "queue_terminal",
      sourceItemId: "permission_terminal",
      summary: "터미널 실행 승인",
      requestedBy: "agent",
      action: "terminal_run",
      reason: "tmux remote command needs approval before using Bearer abc123",
      sourceTrust: "trusted",
      permissions: ["run_safe_commands"],
      state: "required",
      costEstimateTokens: 120_000,
      replayKind: "tmux_dispatch",
      replayEndpoint: "/tmux/dispatch",
      createdAt: "2026-06-06T00:00:00.000Z",
    };

    expect(controlQueueMetaItems(item)).toEqual([
      { label: "실행", value: "터미널 실행", variant: "primary" },
      { label: "신뢰", value: "신뢰됨", variant: "success" },
      { label: "재실행", value: "tmux 재전송", variant: "primary" },
      { label: "예상", value: "120k tok", variant: "muted" },
      { label: "사유", value: "tmux remote command needs approval before using Bearer [token]", variant: "muted" },
    ]);
  });
});
