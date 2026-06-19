import { describe, expect, it } from "vitest";
import type { CodingPacket, ConversationMessage, EventEnvelope, MemoryRecord, ProviderProfile } from "@ai-orchestrator/protocol";
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

// Characterization tests for previously-uncovered stage6 memory mutator and
// reflection-worker branches (no behavior change, no network, no secret).
// These pin: the pin/activate mutation shape plus the unknown-id no-op for all
// three record mutators, the forget tombstone that leaves siblings untouched,
// the reflection worker's contradiction resolution (importance picks the active
// winner and quarantines the loser), and the worker's clean no-issue passthrough.
describe("stage6 memory — mutators & reflection-worker characterization", () => {
  const twoRecords: MemoryRecord[] = [
    {
      id: "rec_a",
      layer: "episode",
      scope: "session",
      kind: "workflow",
      title: "A",
      content: "alpha",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      createdAt,
      activationState: "suggested",
      pinned: false,
    },
    {
      id: "rec_b",
      layer: "episode",
      scope: "session",
      kind: "workflow",
      title: "B",
      content: "bravo",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      createdAt,
      activationState: "suggested",
      pinned: false,
    },
  ];

  it("pins and activates a matched record while leaving siblings untouched", () => {
    const at = "2026-05-24T03:00:00.000Z";
    const pinned = pinMemoryRecord(twoRecords, "rec_a", at);
    const activated = activateMemoryRecord(twoRecords, "rec_a", at);

    expect(pinned.find((r) => r.id === "rec_a")).toMatchObject({
      pinned: true,
      activationState: "active",
      lastAccessedAt: at,
      updatedAt: at,
    });
    expect(pinned.find((r) => r.id === "rec_b")).toMatchObject({ pinned: false, activationState: "suggested" });
    expect(pinned.find((r) => r.id === "rec_b")?.updatedAt).toBeUndefined();

    expect(activated.find((r) => r.id === "rec_a")).toMatchObject({
      activationState: "active",
      lastAccessedAt: at,
      updatedAt: at,
    });
    expect(activated.find((r) => r.id === "rec_a")?.pinned).toBe(false);
  });

  it("returns the records unchanged when no id matches the mutator", () => {
    const at = "2026-05-24T03:30:00.000Z";

    expect(pinMemoryRecord(twoRecords, "missing", at).some((r) => r.pinned)).toBe(false);
    expect(activateMemoryRecord(twoRecords, "missing", at).every((r) => r.activationState === "suggested")).toBe(true);
    expect(forgetMemoryRecord(twoRecords, "missing", at).every((r) => !r.tombstonedAt)).toBe(true);
  });

  it("tombstones the forgotten record and leaves the other in place", () => {
    const at = "2026-05-24T04:00:00.000Z";
    const forgotten = forgetMemoryRecord(twoRecords, "rec_b", at);

    expect(forgotten.find((r) => r.id === "rec_b")).toMatchObject({
      activationState: "inactive",
      tombstonedAt: at,
    });
    expect(forgotten.find((r) => r.id === "rec_a")).toMatchObject({
      activationState: "suggested",
    });
    expect(forgotten.find((r) => r.id === "rec_a")?.tombstonedAt).toBeUndefined();
  });

  it("resolves a contradiction by importance: higher-importance wins active, loser is quarantined", async () => {
    const now = "2026-05-24T05:00:00.000Z";
    const contradictingRecords: MemoryRecord[] = [
      {
        id: "mem_conflict_block",
        layer: "reflection",
        scope: "project",
        kind: "decision",
        title: "Provider forwarding rule block",
        content: "block deny automatic memory forwarding reseller provider policy never",
        sourceChannel: "desktop",
        trustLevel: "trusted",
        createdAt: now,
        tags: ["provider", "memory", "forwarding"],
        activationState: "active",
        importance: 0.8,
        pinned: false,
      },
      {
        id: "mem_conflict_allow",
        layer: "reflection",
        scope: "project",
        kind: "context",
        title: "Provider forwarding rule open",
        content: "allow enable automatic memory forwarding reseller provider policy always auto",
        sourceChannel: "desktop",
        trustLevel: "trusted",
        createdAt: now,
        tags: ["provider", "memory", "forwarding"],
        activationState: "suggested",
        importance: 0.3,
        pinned: false,
      },
    ];

    const result = await runMemoryReflectionWorker({ records: contradictingRecords, now });

    expect(result.fixedCount).toBe(1);
    const winner = result.resolvedRecords.find((r) => r.id === "mem_conflict_block");
    const loser = result.resolvedRecords.find((r) => r.id === "mem_conflict_allow");
    expect(winner).toMatchObject({ activationState: "active", updatedAt: now });
    expect(loser).toMatchObject({ activationState: "quarantined", updatedAt: now });
  });

  it("passes through cleanly with no fixes when there are no duplicate or contradiction issues", async () => {
    const now = "2026-05-24T06:00:00.000Z";
    const singleRecord: MemoryRecord[] = [
      {
        id: "mem_solo",
        layer: "project_memory",
        scope: "project",
        kind: "architecture",
        title: "Solo record",
        content: "single trusted note with no peers",
        sourceChannel: "desktop",
        trustLevel: "trusted",
        createdAt: now,
        activationState: "active",
        pinned: false,
      },
    ];

    const result = await runMemoryReflectionWorker({ records: singleRecord, now });

    expect(result.fixedCount).toBe(0);
    expect(result.resolvedRecords).toHaveLength(1);
    expect(result.resolvedRecords[0]?.activationState).toBe("active");
    expect(result.newIssues).toHaveLength(0);
  });
});
