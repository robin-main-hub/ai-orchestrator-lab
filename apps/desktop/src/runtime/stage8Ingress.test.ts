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

// Characterization tests for previously-uncovered stage8 ingress-guard branches
// (no behavior change, no network, no secret). These pin the external-ingress
// trust boundary's accept/skip decisions: the high-confidence benign accept
// path (no approval, no redaction), the noise_filter block on system events and
// on empty/whitespace text, the medium-confidence path that still requires
// approval with zero permissions, the manager self-response block, and the
// deterministic demo-input factory shape.
describe("stage8 ingress — guard accept/skip characterization", () => {
  const receivedAt = "2026-05-24T01:00:00.000Z";

  it("accepts a high-confidence benign message with no approval and no redaction", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "api_benign_1",
      channel: "api",
      authorType: "user",
      eventType: "message",
      text: "오늘 날씨 어때요",
      receivedAt,
    });

    expect(snapshot.result.accepted).toBe(true);
    expect(snapshot.result.confidence).toBe("high");
    expect(snapshot.result.approvalState).toBe("not_required");
    expect(snapshot.result.reason).toBe("high confidence external input accepted");
    expect(snapshot.result.normalizedEvent?.redacted).toBe(false);
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toEqual([]);
    expect(snapshot.approvals).toEqual([]);
    expect(snapshot.zeroTokenSafety.pendingCount).toBe(0);
    const pii = snapshot.result.guardSteps.find((step) => step.name === "pii_secret_block");
    expect(pii?.status).toBe("passed");
    expect(pii?.reason).toBe("no sensitive request detected");
    expect(snapshot.result.guardSteps.find((step) => step.name === "debounce")?.reason).toBe(
      "single message; merge window clear",
    );
  });

  it("blocks a system_event at the noise filter before model wakeup", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "api_noise_1",
      channel: "api",
      authorType: "user",
      eventType: "system_event",
      text: "heartbeat",
      receivedAt,
    });

    expect(snapshot.result.accepted).toBe(false);
    expect(snapshot.result.approvalState).toBe("rejected");
    expect(snapshot.result.earlyReturn).toBe(true);
    expect(snapshot.result.normalizedEvent).toBeUndefined();
    expect(snapshot.result.reason).toBe("blocked before session handoff");
    expect(snapshot.result.guardSteps.find((step) => step.name === "noise_filter")?.status).toBe("blocked");
  });

  it("blocks an empty/whitespace message at the noise filter", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "api_empty_1",
      channel: "api",
      authorType: "user",
      eventType: "message",
      text: "   ",
      receivedAt,
    });

    expect(snapshot.result.accepted).toBe(false);
    expect(snapshot.result.guardSteps.find((step) => step.name === "noise_filter")?.status).toBe("blocked");
  });

  it("queues a medium-confidence message for approval even with no requested permissions", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "api_medium_1",
      channel: "api",
      authorType: "user",
      eventType: "message",
      text: "이 대화 검토해줘",
      receivedAt,
    });

    expect(snapshot.result.accepted).toBe(true);
    expect(snapshot.result.confidence).toBe("medium");
    expect(snapshot.result.approvalState).toBe("required");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toEqual([]);
    expect(snapshot.result.reason).toBe("medium confidence external input queued for approval");
    const pii = snapshot.result.guardSteps.find((step) => step.name === "pii_secret_block");
    expect(pii?.status).toBe("queued");
    expect(pii?.reason).toBe("sensitive action waits for approval");
  });

  it("blocks a manager-authored message at self_response_prevention", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "legacy_manager_1",
      channel: "external_legacy",
      authorType: "manager",
      eventType: "message",
      text: "확인했습니다",
      receivedAt,
    });

    expect(snapshot.result.accepted).toBe(false);
    expect(snapshot.result.approvalState).toBe("rejected");
    expect(snapshot.result.earlyReturn).toBe(true);
    expect(snapshot.result.guardSteps.find((step) => step.name === "self_response_prevention")?.status).toBe("blocked");
  });

  it("builds a deterministic demo-input shape from receivedAt", () => {
    const first = createExternalIngressDemoInput(receivedAt);
    const second = createExternalIngressDemoInput(receivedAt);

    expect(first.id).toBe(second.id);
    expect(first.id).toContain("external_ingress_input_");
    expect(first.channel).toBe("external_legacy");
    expect(first.authorType).toBe("user");
    expect(first.eventType).toBe("message");
    expect(createExternalIngressDemoInput("2026-05-24T02:00:00.000Z").id).not.toBe(first.id);
  });
});
