import { describe, expect, it } from "vitest";
import {
  codingPacketSchema,
  eventEnvelopeSchema,
  providerProfileSchema,
  type CodingPacket,
} from "./index";

describe("protocol schemas", () => {
  it("validates a structured coding packet", () => {
    const packet: CodingPacket = {
      goal: "오케스트레이터 골격 생성",
      context: ["문서 기반 첫 구현"],
      decisions: ["protocol-first"],
      rejectedOptions: ["채팅 UI만 먼저 만들기"],
      constraints: ["실제 API 호출 제외"],
      filesToInspect: ["packages/protocol/src/index.ts"],
      implementationPlan: ["workspace 생성", "UI stub 구현"],
      verificationPlan: ["typecheck", "test"],
      reviewerNotes: ["secretRef 사용"],
    };

    expect(codingPacketSchema.parse(packet).goal).toBe("오케스트레이터 골격 생성");
  });

  it("keeps provider credentials behind a secret reference", () => {
    const profile = providerProfileSchema.parse({
      id: "provider_custom_reseller",
      name: "리셀러 호환 API",
      kind: "custom",
      baseUrl: "https://api.example.test",
      secretRef: {
        id: "secret_session_1",
        label: "임시 키",
        scope: "session",
        redactedPreview: "sk-...42f0",
        transient: true,
      },
      enabled: true,
      tags: ["reseller", "untrusted"],
      trustLevel: "untrusted",
    });

    expect(profile.secretRef?.redactedPreview).toBe("sk-...42f0");
    expect(JSON.stringify(profile)).not.toContain("raw");
  });

  it("requires a source trust level for persisted events", () => {
    const event = eventEnvelopeSchema.parse({
      id: "event_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { text: "토론으로 돌려봐" },
      createdAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      source: "telegram",
      sourceTrust: "untrusted",
    });

    expect(event.redacted).toBe(false);
    expect(event.sourceTrust).toBe("untrusted");
  });
});
