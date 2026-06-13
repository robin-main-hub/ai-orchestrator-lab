import { describe, expect, it } from "vitest";
import { deriveConversationHeaderAlert } from "./conversationHeaderAlert";

describe("deriveConversationHeaderAlert", () => {
  it("평상시(ready/idle)면 undefined — 배너 미표시", () => {
    expect(
      deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "ready", selectedAgentActivity: "idle" }),
    ).toBeUndefined();
  });

  it("공급자 blocked/credential_required → rose", () => {
    expect(deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "blocked", selectedAgentActivity: "idle" })?.tone).toBe("rose");
    expect(deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "credential_required", selectedAgentActivity: "idle" })?.tone).toBe("rose");
  });

  it("공급자 needs_approval → amber + toast 가리킴", () => {
    const a = deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "needs_approval", selectedAgentActivity: "idle" });
    expect(a?.tone).toBe("amber");
    expect(a?.label).toContain("하단 승인 바");
  });

  it("에이전트 승인 대기 + pending → amber, 건수 표기", () => {
    const a = deriveConversationHeaderAlert({ pendingApprovalCount: 2, providerReadinessStatus: "ready", selectedAgentActivity: "waiting_approval" });
    expect(a?.tone).toBe("amber");
    expect(a?.label).toContain("2건");
  });

  it("에이전트 error → rose", () => {
    expect(deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "ready", selectedAgentActivity: "error" })?.tone).toBe("rose");
  });

  it("waiting_approval인데 pending이 0이면 배너 미표시(복합 가드)", () => {
    expect(
      deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "ready", selectedAgentActivity: "waiting_approval" }),
    ).toBeUndefined();
  });

  it("공급자 차단 > 에러 우선순위", () => {
    const a = deriveConversationHeaderAlert({ pendingApprovalCount: 0, providerReadinessStatus: "blocked", selectedAgentActivity: "error" });
    expect(a?.label).toContain("공급자");
  });

  it("공급자 needs_approval > 에이전트 waiting_approval 우선순위", () => {
    const a = deriveConversationHeaderAlert({ pendingApprovalCount: 2, providerReadinessStatus: "needs_approval", selectedAgentActivity: "waiting_approval" });
    expect(a?.label).toContain("공급자 승인");
  });
});
