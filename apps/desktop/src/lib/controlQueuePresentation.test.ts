import { describe, expect, it } from "vitest";
import {
  controlQueueActionFeedback,
  controlQueueLaneLabel,
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
    expect(controlQueueActionFeedback("ask")).toBe("질문이 대화 초안으로 준비됩니다");
    expect(controlQueueActionFeedback("edit")).toBe("수정 초안이 생성됩니다");
    expect(controlQueueActionFeedback("delegate")).toBe("실행 위임안이 준비됩니다");
    expect(controlQueueActionFeedback("block")).toBe("항목이 차단됩니다");
  });
});
