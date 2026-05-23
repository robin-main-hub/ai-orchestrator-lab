import { describe, expect, it } from "vitest";
import type { CodingPacket, ConversationMessage, EventEnvelope, ProviderProfile } from "@ai-orchestrator/protocol";
import {
  createSeedMemoryRecords,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
} from "./stage6Memory";

const createdAt = "2026-05-24T00:00:00.000Z";

const packet: CodingPacket = {
  goal: "DGX local fallback and Event Store memory",
  context: ["Desktop orchestrator"],
  decisions: ["Keep Event Store as source of truth"],
  rejectedOptions: ["Send all memory to reseller proxy"],
  constraints: ["Block untrusted provider project memory auto recall"],
  filesToInspect: ["apps/desktop/src/App.tsx"],
  implementationPlan: ["Create memory inspector"],
  verificationPlan: ["typecheck", "test"],
  reviewerNotes: ["Trace recall decisions"],
};

const messages: ConversationMessage[] = [
  {
    id: "message_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "DGX-02를 authority로 두고 기억 trace를 보여줘",
    createdAt,
  },
];

const events: EventEnvelope[] = [
  {
    id: "event_1",
    sessionId: "session_desktop_001",
    type: "memory.recall.used",
    payload: {},
    createdAt,
    source: "desktop",
    sourceTrust: "trusted",
    redacted: false,
  },
];

const trustedProvider: ProviderProfile = {
  id: "provider_trusted",
  name: "Trusted",
  kind: "openai",
  enabled: true,
  tags: [],
  trustLevel: "trusted",
};

const untrustedProvider: ProviderProfile = {
  id: "provider_untrusted",
  name: "Reseller",
  kind: "custom",
  enabled: true,
  tags: ["reseller"],
  trustLevel: "untrusted",
};

describe("stage6 memory inspector", () => {
  it("shows trusted recall as usable decision context", () => {
    const inspector = createStage6MemoryInspector({
      records: createSeedMemoryRecords(createdAt),
      messages,
      packet,
      events,
      provider: trustedProvider,
      createdAt,
    });

    expect(inspector.trace.policy.autoRecallAllowed).toBe(true);
    expect(inspector.trace.results.some((result) => result.usedInDecision)).toBe(true);
    expect(inspector.pinnedCount).toBeGreaterThan(0);
  });

  it("blocks project and user memory for untrusted providers", () => {
    const inspector = createStage6MemoryInspector({
      records: createSeedMemoryRecords(createdAt),
      messages,
      packet,
      events,
      provider: untrustedProvider,
      createdAt,
    });

    expect(inspector.trace.policy.autoRecallAllowed).toBe(false);
    expect(inspector.trace.policy.blockedLayers).toContain("project_memory");
    const projectResults = inspector.trace.results.filter((result) => result.record.layer === "project_memory");

    expect(projectResults.every((result) => !result.usedInDecision)).toBe(true);
  });

  it("creates remember candidates and supports pin/forget actions", () => {
    const candidates = rememberStage6Context({
      messages,
      packet,
      provider: trustedProvider,
      createdAt,
    });
    const pinned = pinMemoryRecord(candidates, candidates[0]!.id);
    const forgotten = forgetMemoryRecord(pinned, candidates[0]!.id, createdAt);

    expect(candidates).toHaveLength(2);
    expect(pinned[0]?.pinned).toBe(true);
    expect(forgotten[0]?.tombstonedAt).toBe(createdAt);
  });
});
