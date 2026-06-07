import { describe, expect, it } from "vitest";
import type { CodingPacket, ConversationMessage, EventEnvelope, ProviderProfile } from "@ai-orchestrator/protocol";
import {
  activateMemoryRecord,
  createSeedMemoryRecords,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
  runMemoryReflectionWorker,
} from "./stage6Memory";

const createdAt = "2026-05-24T00:00:00.000Z";
process.env.MEMENTO_RECALL_LOG_DISABLED = "1";

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
    content: "MacBook operator authority와 DGX-02 continuity mirror 기억 trace를 보여줘",
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
  it("ships Korean default memory seeds for operator-facing recall context", () => {
    const seeds = createSeedMemoryRecords(createdAt);
    const combined = seeds.map((record) => `${record.title} ${record.content} ${record.losslessRestatement ?? ""} ${record.topic ?? ""}`).join(" ");

    expect(seeds.find((record) => record.id === "memory_seed_event_storage")?.title).toBe("이벤트 저장소 우선");
    expect(seeds.find((record) => record.id === "memory_seed_macbook_authority")?.title).toBe("MacBook 작업 권한 원본");
    expect(seeds.find((record) => record.id === "memory_seed_external_ingress_quarantine")?.title).toBe("외부 인입 격리");
    expect(combined).not.toContain("MacBook is the operator authority");
    expect(combined).not.toContain("External ingress commands");
    expect(combined).not.toContain("Event Storage first");
  });

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
    expect(inspector.contextPacket.activeRecordIds.length).toBeGreaterThan(0);
    expect(inspector.stats.relationCount).toBeGreaterThan(0);
    expect(inspector.pinnedCount).toBeGreaterThan(0);
    expect(inspector.records.some((record) => record.id === "memory_seed_macbook_authority")).toBe(true);
    expect(inspector.records.some((record) => record.id === "memory_seed_dgx02_authority")).toBe(false);
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
    expect(inspector.trace.policy.reason).toBe("미신뢰 공급자는 프로젝트/사용자 기억을 명시 선택했을 때만 조회합니다.");
    expect(inspector.trace.policy.blockedLayers).toContain("project_memory");
    const projectResults = inspector.trace.results.filter((result) => result.record.layer === "project_memory");

    expect(projectResults.every((result) => !result.usedInDecision)).toBe(true);
    expect(projectResults.map((result) => result.reason).join(" ")).not.toContain("blocked by provider trust policy");
    expect(inspector.contextPacket.blockedRecordIds.length).toBeGreaterThan(0);
  });

  it("creates remember candidates and supports pin/forget actions", () => {
    const candidates = rememberStage6Context({
      messages,
      packet,
      provider: trustedProvider,
      createdAt,
      agentId: "agent_reviewer",
    });
    const activated = activateMemoryRecord(candidates, candidates[0]!.id, createdAt);
    const pinned = pinMemoryRecord(candidates, candidates[0]!.id);
    const forgotten = forgetMemoryRecord(pinned, candidates[0]!.id, createdAt);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.tags).toEqual(
      expect.arrayContaining([
        "agent:agent_reviewer",
        `provider:${trustedProvider.id}`,
        "session:session_desktop_001",
      ]),
    );
    expect(candidates[0]?.title).toBe("대화 작업 세션");
    expect(candidates[0]?.losslessRestatement).toContain("사용자는");
    expect(candidates[0]?.losslessRestatement).not.toContain("The user worked");
    expect(candidates[1]?.title).toBe("코딩 인계 회고");
    expect(candidates[1]?.content).toContain("검증:");
    expect(candidates[1]?.content).not.toContain("verification:");
    expect(activated[0]?.activationState).toBe("active");
    expect(pinned[0]?.pinned).toBe(true);
    expect(forgotten[0]?.tombstonedAt).toBe(createdAt);
  });

  it("decays EvolveMemento importance by one tick without crossing the floor", () => {
    const records = createSeedMemoryRecords(createdAt).map((record) => ({
      ...record,
      importance: record.id === "memory_seed_event_storage" ? 0.1 : 0.5,
    }));

    const inspector = createStage6MemoryInspector({
      records,
      messages,
      packet,
      events,
      provider: trustedProvider,
      createdAt,
    });

    expect(inspector.records.find((record) => record.id === "memory_seed_event_storage")?.importance).toBe(0.1);
    expect(inspector.records.find((record) => record.id === "memory_seed_macbook_authority")?.importance).toBe(0.49);
  });

  it("reinforces records whose persons match the recall query", () => {
    const records = [
      ...createSeedMemoryRecords(createdAt),
      {
        id: "memory_seed_maomao_research",
        layer: "project_memory" as const,
        scope: "project" as const,
        kind: "context" as const,
        title: "Maomao research handoff",
        content: "Maomao tracks source-backed market research handoffs.",
        sourceChannel: "agent" as const,
        trustLevel: "trusted" as const,
        projectId: "project_ai_orchestrator_lab",
        activationState: "active" as const,
        createdAt,
        persons: ["Maomao"],
        entities: ["Research"],
        keywords: ["maomao", "research", "handoff"],
        topic: "Maomao research memory",
        losslessRestatement: "Maomao tracks source-backed market research handoffs for AI Orchestrator Lab.",
        importance: 0.5,
        entityReinforcement: 0,
        pinned: false,
      },
    ];
    const maomaoMessages: ConversationMessage[] = [
      {
        id: "message_maomao",
        sessionId: "session_desktop_001",
        role: "user",
        content: "Maomao에게 시장 조사 기억을 다시 불러와줘.",
        createdAt,
      },
    ];

    const inspector = createStage6MemoryInspector({
      records,
      messages: maomaoMessages,
      packet: { ...packet, goal: "Maomao research recall" },
      events,
      provider: trustedProvider,
      createdAt,
    });

    expect(inspector.records.find((record) => record.id === "memory_seed_maomao_research")?.entityReinforcement).toBe(0.1);
  });

  it("resolves duplicate and contradiction memory issues using runMemoryReflectionWorker", async () => {
    const duplicateRecords = [
      {
        id: "memory_seed_event_storage_1",
        layer: "project_memory" as const,
        scope: "project" as const,
        kind: "architecture" as const,
        title: "이벤트 저장소 우선",
        content: "Duplicate text 1",
        sourceChannel: "desktop" as const,
        trustLevel: "trusted" as const,
        projectId: "project_ai_orchestrator_lab",
        activationState: "active" as const,
        createdAt: "2026-05-24T00:00:00.000Z",
        pinned: false,
      },
      {
        id: "memory_seed_event_storage_2",
        layer: "project_memory" as const,
        scope: "project" as const,
        kind: "architecture" as const,
        title: "이벤트 저장소 우선",
        content: "Duplicate text 2 (newer)",
        sourceChannel: "desktop" as const,
        trustLevel: "trusted" as const,
        projectId: "project_ai_orchestrator_lab",
        activationState: "active" as const,
        createdAt: "2026-05-24T00:01:00.000Z",
        pinned: false,
      },
    ];

    const result = await runMemoryReflectionWorker({
      records: duplicateRecords,
      now: "2026-05-24T00:02:00.000Z",
    });

    expect(result.fixedCount).toBe(1);
    const older = result.resolvedRecords.find(r => r.id === "memory_seed_event_storage_1");
    const newer = result.resolvedRecords.find(r => r.id === "memory_seed_event_storage_2");
    expect(older?.activationState).toBe("inactive");
    expect(older?.tombstonedAt).toBe("2026-05-24T00:02:00.000Z");
    expect(newer?.activationState).toBe("active");
  });
});
