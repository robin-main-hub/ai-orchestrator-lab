import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import {
  createConversationTurnMemoryCandidate,
  createMemoryCuratorPersistencePlan,
  getMemoryCuratorRecordsForScope,
  readMemoryCuratorLedger,
  updateMemoryCuratorLedgerRecord,
  upsertMemoryCuratorRecordOverlay,
  writeMemoryCuratorCandidate,
} from "./memoryCuratorRuntime";
import type { JsonStorageLike } from "./persistentJsonState";

const createdAt = "2026-06-06T00:00:00.000Z";
const updatedAt = "2026-06-06T00:01:00.000Z";

class MemoryStorage implements JsonStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function createRecord(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "title">): MemoryRecord {
  const { id, title, ...rest } = overrides;
  return {
    id,
    layer: "project_memory",
    scope: "project",
    kind: "decision",
    title,
    content: `${title} content`,
    sourceChannel: "desktop",
    trustLevel: "trusted",
    projectId: "project_ai_orchestrator_lab",
    activationState: "suggested",
    createdAt,
    pinned: false,
    ...rest,
  };
}

describe("memory curator runtime persistence planning", () => {
  it("대화 한 턴을 에이전트별 장기 기억 후보로 만든다", () => {
    const candidate = createConversationTurnMemoryCandidate({
      agentId: "agent_orchestrator",
      agentName: "마키마",
      assistantMessage: {
        id: "message_agent_1",
        content: "기억해둘게. 다음에는 이 기준으로 바로 이어갈게.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      createdAt: updatedAt,
      memoryScopeNamespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo",
      providerProfileId: "provider_mimo",
      recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo",
      trustLevel: "limited",
      userMessage: {
        id: "message_user_1",
        content: "마키마는 오케스트레이터 이름이고 앞으로 이 이름으로 대화해.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });

    expect(candidate).toMatchObject({
      agentId: "agent_orchestrator",
      reason: "에이전트별 대화 연속성 유지",
      status: "pending",
      targetActivationState: "active",
      record: {
        activationState: "suggested",
        kind: "workflow",
        layer: "episode",
        scope: "session",
        sessionId: "session_main",
        sourceChannel: "agent",
        title: "마키마 대화 기억 후보",
        trustLevel: "limited",
      },
    });
    expect(candidate.record.content).toContain("사용자: 마키마는 오케스트레이터 이름");
    expect(candidate.record.content).toContain("마키마: 기억해둘게");
    expect(candidate.record.tags).toEqual(
      expect.arrayContaining([
        "conversation",
        "curator-candidate",
        "agent:agent_orchestrator",
        "provider:provider_mimo",
        "recall:recall_agent_orchestrator_session_main_provider_mimo",
      ]),
    );
  });

  it("첨부 처리 계획을 대화 기억 후보 본문과 키워드에 남긴다", () => {
    const candidate = createConversationTurnMemoryCandidate({
      agentId: "agent_orchestrator",
      agentName: "마키마",
      assistantMessage: {
        id: "message_agent_attachment",
        content: "화면 구조를 기준으로 다음 수정을 이어가겠다.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      attachmentProcessingPlans: [
        {
          kind: "image",
          name: "cockpit.png",
          processingMode: "vision_candidate",
          size: 120_000,
          status: "accepted",
          storage: "metadata_only",
        },
        {
          kind: "document",
          name: "large-secret.pdf",
          processingMode: "metadata_only",
          reason: "파일 크기 제한 초과",
          size: 20_000_000,
          status: "rejected",
          storage: "metadata_only",
        },
      ],
      createdAt: updatedAt,
      providerProfileId: "provider_mimo",
      userMessage: {
        id: "message_user_attachment",
        content: "이 화면 기준으로 정리해.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });

    expect(candidate.record.content).toContain("첨부: cockpit.png(image/vision_candidate/accepted)");
    expect(candidate.record.content).toContain("large-secret.pdf(document/metadata_only/rejected)");
    expect(candidate.record.keywords).toEqual(expect.arrayContaining(["cockpit", "image", "vision_candidate"]));
    expect(candidate.record.tags).toEqual(expect.arrayContaining(["attachment", "attachment:image"]));
  });

  it("turns duplicate reflection fixes into activate and forget persistence requests", () => {
    const older = createRecord({ id: "memory_old", title: "Old duplicate", createdAt });
    const newer = createRecord({ id: "memory_new", title: "New duplicate", createdAt: updatedAt });

    const plan = createMemoryCuratorPersistencePlan(
      [older, newer],
      [
        { ...older, activationState: "inactive", tombstonedAt: updatedAt },
        { ...newer, activationState: "active", updatedAt },
      ],
    );

    expect(plan.forgetRecordIds).toEqual(["memory_old"]);
    expect(plan.activateRecordIds).toEqual(["memory_new"]);
    expect(plan.quarantineRecordIds).toEqual([]);
    expect(plan.changedRecordIds).toEqual(["memory_old", "memory_new"]);
  });

  it("turns contradiction reflection fixes into activate and quarantine persistence requests", () => {
    const winner = createRecord({ id: "memory_winner", title: "Winner", importance: 0.9 });
    const loser = createRecord({ id: "memory_loser", title: "Loser", importance: 0.2 });

    const plan = createMemoryCuratorPersistencePlan(
      [winner, loser],
      [
        { ...winner, activationState: "active", updatedAt },
        { ...loser, activationState: "quarantined", updatedAt },
      ],
    );

    expect(plan.activateRecordIds).toEqual(["memory_winner"]);
    expect(plan.quarantineRecordIds).toEqual(["memory_loser"]);
    expect(plan.forgetRecordIds).toEqual([]);
    expect(plan.changedRecordIds).toEqual(["memory_winner", "memory_loser"]);
  });

  it("scope별 curator 후보 ledger를 저장하고 다른 에이전트 방으로 새지 않게 복원한다", () => {
    const storage = new MemoryStorage();
    const makimaCandidate = createConversationTurnMemoryCandidate({
      agentId: "agent_orchestrator",
      agentName: "마키마",
      assistantMessage: {
        id: "message_agent_1",
        content: "좋아. 다음 턴부터 이 지시를 기준으로 이어갈게.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      createdAt: updatedAt,
      memoryScopeNamespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo",
      providerProfileId: "provider_mimo",
      recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo",
      userMessage: {
        id: "message_user_1",
        content: "마키마는 다음 큰 바위 순서를 계속 기억해.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });
    const shinobuCandidate = createConversationTurnMemoryCandidate({
      agentId: "agent_architect",
      agentName: "오시노 시노부",
      assistantMessage: {
        id: "message_agent_2",
        content: "설계 맥락으로 따로 보관하겠다.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      createdAt: updatedAt,
      memoryScopeNamespace: "agent:agent_architect/session:session_main/provider:provider_mimo",
      providerProfileId: "provider_mimo",
      recallTraceId: "recall_agent_architect_session_main_provider_mimo",
      userMessage: {
        id: "message_user_2",
        content: "시노부는 설계 결정을 기억해.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });

    writeMemoryCuratorCandidate({
      candidate: makimaCandidate,
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });
    writeMemoryCuratorCandidate({
      candidate: shinobuCandidate,
      scopeKey: "agent_architect::session_main::provider_mimo",
      storage,
      updatedAt,
    });

    expect(readMemoryCuratorLedger(storage)).toHaveLength(2);
    expect(
      getMemoryCuratorRecordsForScope("agent_orchestrator::session_main::provider_mimo", storage)
        .map((record) => record.title),
    ).toEqual(["마키마 대화 기억 후보"]);
    expect(
      getMemoryCuratorRecordsForScope("agent_architect::session_main::provider_mimo", storage)
        .map((record) => record.title),
    ).toEqual(["오시노 시노부 대화 기억 후보"]);
  });

  it("승인된 curator 후보는 ledger에서도 active/pinned 상태로 복원된다", () => {
    const storage = new MemoryStorage();
    const candidate = createConversationTurnMemoryCandidate({
      agentId: "agent_orchestrator",
      agentName: "마키마",
      assistantMessage: {
        id: "message_agent_approved",
        content: "이 순서를 다음 작업에서 이어가겠다.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      createdAt: updatedAt,
      memoryScopeNamespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo",
      providerProfileId: "provider_mimo",
      userMessage: {
        id: "message_user_approved",
        content: "이 큰 바위 순서를 계속 기억해.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });

    writeMemoryCuratorCandidate({
      candidate,
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });
    updateMemoryCuratorLedgerRecord({
      candidateStatus: "approved",
      recordId: candidate.record.id,
      recordPatch: {
        activationState: "active",
        lastAccessedAt: updatedAt,
        pinned: true,
        updatedAt,
      },
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });

    expect(readMemoryCuratorLedger(storage)[0]?.candidate.status).toBe("approved");
    expect(
      getMemoryCuratorRecordsForScope("agent_orchestrator::session_main::provider_mimo", storage)[0],
    ).toMatchObject({
      activationState: "active",
      pinned: true,
      updatedAt,
    });
  });

  it("거절 또는 forget 처리된 curator 후보는 재시작 복원 목록에서 빠진다", () => {
    const storage = new MemoryStorage();
    const candidate = createConversationTurnMemoryCandidate({
      agentId: "agent_orchestrator",
      agentName: "마키마",
      assistantMessage: {
        id: "message_agent_rejected",
        content: "이 내용은 오래 보관하지 않겠다.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      createdAt: updatedAt,
      providerProfileId: "provider_mimo",
      userMessage: {
        id: "message_user_rejected",
        content: "이건 임시로만 봐.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });

    writeMemoryCuratorCandidate({
      candidate,
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });
    updateMemoryCuratorLedgerRecord({
      candidateStatus: "rejected",
      recordId: candidate.record.id,
      recordPatch: {
        activationState: "inactive",
        tombstonedAt: updatedAt,
      },
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });

    expect(readMemoryCuratorLedger(storage)[0]?.candidate.status).toBe("rejected");
    expect(getMemoryCuratorRecordsForScope("agent_orchestrator::session_main::provider_mimo", storage)).toEqual([]);
  });

  it("quarantine 방식으로 거절된 curator 후보도 복원 목록에서 빠진다", () => {
    const storage = new MemoryStorage();
    const candidate = createConversationTurnMemoryCandidate({
      agentId: "agent_orchestrator",
      agentName: "마키마",
      assistantMessage: {
        id: "message_agent_quarantined",
        content: "이 기억은 충돌 가능성이 있어 보류한다.",
        createdAt: updatedAt,
        role: "assistant",
        sessionId: "session_main",
      },
      createdAt: updatedAt,
      providerProfileId: "provider_mimo",
      userMessage: {
        id: "message_user_quarantined",
        content: "이 설정은 틀렸을 수도 있어.",
        createdAt,
        role: "user",
        sessionId: "session_main",
      },
    });

    writeMemoryCuratorCandidate({
      candidate,
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });
    updateMemoryCuratorLedgerRecord({
      candidateStatus: "rejected",
      recordId: candidate.record.id,
      recordPatch: {
        activationState: "quarantined",
        updatedAt,
      },
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });

    expect(readMemoryCuratorLedger(storage)[0]?.candidate.record.activationState).toBe("quarantined");
    expect(getMemoryCuratorRecordsForScope("agent_orchestrator::session_main::provider_mimo", storage)).toEqual([]);
  });

  it("원장 밖 어댑터 레코드의 pin/forget 결정도 로컬 overlay로 영속화한다", () => {
    const storage = new MemoryStorage();
    const scopeKey = "agent_orchestrator::session_main::provider_mimo";
    const adapterRecord = createRecord({
      id: "memory_seed_external",
      title: "Adapter seed memory",
      activationState: "inactive",
    });

    upsertMemoryCuratorRecordOverlay({
      agentId: "agent_orchestrator",
      candidateStatus: "approved",
      record: adapterRecord,
      recordPatch: {
        activationState: "active",
        pinned: true,
        updatedAt,
      },
      scopeKey,
      storage,
      updatedAt,
    });

    expect(getMemoryCuratorRecordsForScope(scopeKey, storage)[0]).toMatchObject({
      id: "memory_seed_external",
      activationState: "active",
      pinned: true,
      updatedAt,
    });

    upsertMemoryCuratorRecordOverlay({
      agentId: "agent_orchestrator",
      candidateStatus: "rejected",
      record: adapterRecord,
      recordPatch: {
        activationState: "inactive",
        tombstonedAt: updatedAt,
      },
      scopeKey,
      storage,
      updatedAt,
    });

    expect(readMemoryCuratorLedger(storage)[0]?.candidate.status).toBe("rejected");
    expect(getMemoryCuratorRecordsForScope(scopeKey, storage)).toEqual([]);
  });
});
