import { describe, expect, it } from "vitest";
import { createExternalIngressDemoInput, createStage8IngressSnapshot } from "./stage8Ingress";

describe("stage8 ingress guard", () => {
  it("redacts API secrets and queues dangerous requests for approval when coming from limited API channels", () => {
    const demoInput = createExternalIngressDemoInput("2026-05-24T00:00:00.000Z");
    // API 채널로 설정하여 위험 권한 차단 가드를 통과시키고, redaction 및 queued 검증
    const apiInput = { ...demoInput, channel: "api" as const };
    const snapshot = createStage8IngressSnapshot(apiInput);

    expect(snapshot.result.accepted).toBe(true);
    expect(snapshot.result.approvalState).toBe("required");
    expect(snapshot.result.confidence).toBe("low");
    expect(snapshot.result.normalizedEvent?.rawText).toBe("[QUARANTINED_RAW_PAYLOAD]");
    expect(snapshot.result.normalizedEvent?.normalizedText).toContain("[REDACTED:env_secret]");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toContain("run_safe_commands");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toContain("secret_access");
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.zeroTokenSafety.pendingCount).toBe(1);
  });

  it("blocks dangerous write/exec/secret requests from webhook channel by external_agent_isolation", () => {
    const demoInput = createExternalIngressDemoInput("2026-05-24T00:00:00.000Z");
    const snapshot = createStage8IngressSnapshot(demoInput);

    expect(snapshot.result.accepted).toBe(false);
    expect(snapshot.result.approvalState).toBe("rejected");
    expect(snapshot.result.guardSteps.find((step) => step.name === "external_agent_isolation")?.status).toBe("blocked");
  });

  it("blocks bot self responses before session handoff", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "external_bot_loop",
      channel: "external_legacy",
      authorType: "bot",
      eventType: "bot_reply",
      text: "I already answered",
      receivedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(snapshot.result.accepted).toBe(false);
    expect(snapshot.result.earlyReturn).toBe(true);
    expect(snapshot.result.guardSteps.find((step) => step.name === "self_response_prevention")?.status).toBe("blocked");
  });

  it("debounces nearby external snippets before confidence routing", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "api_input_1",
      channel: "api",
      authorType: "user",
      eventType: "message",
      text: "그리고 pnpm test 준비",
      recentTexts: ["코딩 패킷 만들어줘", "파일 수정은 승인 받고"],
      debounceWindowMs: 30_000,
      receivedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(snapshot.result.normalizedEvent?.normalizedText).toContain("코딩 패킷 만들어줘");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toContain("write_files");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toContain("run_safe_commands");
    expect(snapshot.result.guardSteps.find((step) => step.name === "debounce")?.reason).toContain("3 messages merged");
  });
});
