import { describe, expect, it } from "vitest";
import { deriveEmptyConversationHint } from "./emptyConversationHint";

describe("deriveEmptyConversationHint", () => {
  it("공급자 미준비면 연결 힌트(amber)", () => {
    const hint = deriveEmptyConversationHint({ agentName: "마키마", hasMemoryRecords: false, providerReady: false });
    expect(hint.tone).toBe("amber");
    expect(hint.suggestion).toContain("공급자");
    expect(hint.detail).toContain("API 키");
  });

  it("승인 대기면 toast 바를 가리킴(amber, 액션 중복 안 함)", () => {
    const hint = deriveEmptyConversationHint({ agentName: "마키마", hasMemoryRecords: false, pendingApprovalCount: 2, providerReady: true });
    expect(hint.tone).toBe("amber");
    expect(hint.detail).toContain("하단 승인 바");
    expect(hint.detail).toContain("2건");
  });

  it("에이전트 승인 대기 상태", () => {
    const hint = deriveEmptyConversationHint({ agentName: "렘", hasMemoryRecords: false, providerReady: true, selectedAgentActivity: "waiting_approval" });
    expect(hint.tone).toBe("amber");
    expect(hint.suggestion).toContain("렘");
  });

  it("기억이 있으면 이어가기(cyan)", () => {
    const hint = deriveEmptyConversationHint({ agentName: "마키마", hasMemoryRecords: true, providerReady: true });
    expect(hint.tone).toBe("cyan");
    expect(hint.suggestion).toContain("이어서");
  });

  it("기본은 첫 대화(neutral)", () => {
    const hint = deriveEmptyConversationHint({ agentName: "마키마", hasMemoryRecords: false, providerReady: true });
    expect(hint.tone).toBe("neutral");
    expect(hint.suggestion).toContain("첫 말");
  });

  it("공급자 > 승인 우선순위", () => {
    const hint = deriveEmptyConversationHint({ agentName: "마키마", hasMemoryRecords: true, pendingApprovalCount: 3, providerReady: false });
    expect(hint.suggestion).toContain("공급자");
  });

  it("승인 > 기억 우선순위", () => {
    const hint = deriveEmptyConversationHint({ agentName: "마키마", hasMemoryRecords: true, pendingApprovalCount: 1, providerReady: true });
    expect(hint.detail).toContain("하단 승인 바");
  });
});
