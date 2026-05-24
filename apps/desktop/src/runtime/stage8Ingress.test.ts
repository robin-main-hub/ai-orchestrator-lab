import { describe, expect, it } from "vitest";
import { createStage8IngressSnapshot, createTelegramDemoInput } from "./stage8Ingress";

describe("stage8 ingress guard", () => {
  it("redacts Telegram secrets and queues dangerous requests for approval", () => {
    const snapshot = createStage8IngressSnapshot(createTelegramDemoInput("2026-05-24T00:00:00.000Z"));

    expect(snapshot.result.accepted).toBe(true);
    expect(snapshot.result.approvalState).toBe("required");
    expect(snapshot.result.confidence).toBe("low");
    expect(snapshot.result.normalizedEvent?.normalizedText).toContain("[REDACTED:env_secret]");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toContain("run_safe_commands");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toContain("secret_access");
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.zeroTokenSafety.pendingCount).toBe(1);
  });

  it("blocks bot self responses before session handoff", () => {
    const snapshot = createStage8IngressSnapshot({
      id: "telegram_bot_loop",
      channel: "legacy_telegram",
      authorType: "bot",
      eventType: "bot_reply",
      text: "I already answered",
      receivedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(snapshot.result.accepted).toBe(false);
    expect(snapshot.result.earlyReturn).toBe(true);
    expect(snapshot.result.guardSteps.find((step) => step.name === "self_response_prevention")?.status).toBe("blocked");
  });
});
