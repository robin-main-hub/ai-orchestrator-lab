import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryInput,
  MemoryRecord,
  MemoryRelation,
  ProviderProfile,
  Reflection,
} from "@ai-orchestrator/protocol";
import { DgxSimpleMemMemoryAdapter, isMemoryAdapterError } from "@ai-orchestrator/memory";
import {
  activateMemoryRecord,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
  runMemoryReflectionWorker,
  type Stage6MemoryInspector,
} from "../runtime/stage6Memory";
import { initialMemoryRecords } from "../seeds/memory";
import { createAdapterBackedMementoMemoryApi } from "../runtime/stage27MemoryApi";
import {
  createAgentChannelRecallQuery,
  type AgentChannelMemoryScope,
} from "../lib/agentConversationChannels";
import {
  canCommitMemoryScopeResult,
  createMemoryControllerScopeKey,
} from "../lib/memoryControllerScope";
import { resolveScopedMemoryInspector } from "../lib/scopedMemoryInspector";
import {
  createMemoryCuratorPersistencePlan,
  mergeMemoryRecordsWithCuratorLedger,
  writeMemoryCuratorCandidate,
  type MemoryCuratorPersistencePlan,
} from "../lib/memoryCuratorRuntime";
import type { MemoryCuratorCandidate } from "../lib/memoryCuratorApproval";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type MemoryControllerInput = {
  appendEvent: AppendWorkbenchEvent;
  events: EventEnvelope[];
  markMemorySyncing: (createdAt: string) => void;
  messages: ConversationMessage[];
  packet: CodingPacket;
  provider?: ProviderProfile;
  memoryScope?: AgentChannelMemoryScope;
  runtimeUpdatedAt: string;
};

export function useMemoryController({
  appendEvent,
  events,
  markMemorySyncing,
  memoryScope,
  messages,
  packet,
  provider,
  runtimeUpdatedAt,
}: MemoryControllerInput) {
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [adapterStatus, setAdapterStatus] = useState<"loading" | "ready" | "error">("loading");
  const [adapterRelations, setAdapterRelations] = useState<MemoryRelation[] | null>(null);
  const [adapterReflection, setAdapterReflection] = useState<Reflection | null>(null);
  const memoryScopeKey = createMemoryControllerScopeKey(memoryScope);
  const memoryScopeKeyRef = useRef(memoryScopeKey);
  const appendEventRef = useRef(appendEvent);
  const markMemorySyncingRef = useRef(markMemorySyncing);
  const memoryAdapterProfileId = memoryScope
    ? `desktop_dgx_simplemem_${memoryScope.recallTraceId}`
    : "desktop_dgx_simplemem";

  useEffect(() => {
    appendEventRef.current = appendEvent;
    markMemorySyncingRef.current = markMemorySyncing;
  }, [appendEvent, markMemorySyncing]);

  const memoryAdapter = useMemo(
    () =>
      new DgxSimpleMemMemoryAdapter({
        profileId: memoryAdapterProfileId,
        seedRecords: initialMemoryRecords,
      }),
    [memoryAdapterProfileId],
  );

  const memoryApi = useMemo(
    () =>
      createAdapterBackedMementoMemoryApi({
        adapter: memoryAdapter,
        operationScope: memoryScope,
        context: {
          appendEvent: async (event) => {
            appendEventRef.current(event.type, {
              ...event.payload,
              adapterEventId: event.id,
              adapterEventCreatedAt: event.createdAt,
              memoryScope: memoryScope?.namespace,
              recallTraceId: memoryScope?.recallTraceId,
            });
          },
          onAdapterError: (error) => {
            appendEventRef.current("memory.adapter.error", {
              category: error.category,
              message: error.message,
              memoryScope: memoryScope?.namespace,
              recallTraceId: memoryScope?.recallTraceId,
            });
          },
        },
      }),
    [memoryAdapter, memoryScope],
  );

  useEffect(() => {
    memoryScopeKeyRef.current = memoryScopeKey;
    setMemoryRecords([]);
    setAdapterRelations(null);
    setAdapterReflection(null);
    setAdapterStatus("loading");
  }, [memoryScopeKey]);

  useEffect(() => {
    let active = true;
    const expectedScopeKey = memoryScopeKey;
    setAdapterStatus("loading");
    const recallQuery = memoryScope
      ? createAgentChannelRecallQuery(memoryScope, packet.goal ?? "")
      : packet.goal ?? "";
    memoryApi
      .recall({ query: recallQuery, sessionId: memoryScope?.sessionId, limit: 50 })
      .then((results) => {
        if (!active || !canCommitMemoryScopeResult({ currentScopeKey: memoryScopeKeyRef.current, expectedScopeKey })) return;
        setMemoryRecords(mergeMemoryRecordsWithCuratorLedger(
          results.map((result) => result.record),
          expectedScopeKey,
        ));
        setAdapterStatus("ready");
      })
      .catch(() => {
        if (!active || !canCommitMemoryScopeResult({ currentScopeKey: memoryScopeKeyRef.current, expectedScopeKey })) return;
        setAdapterStatus("error");
      });
    return () => {
      active = false;
    };
  }, [memoryApi, memoryScope, memoryScopeKey, packet.goal]);

  useEffect(() => {
    let active = true;
    const expectedScopeKey = memoryScopeKey;
    const recordIds = memoryRecords.map((record) => record.id);
    if (recordIds.length === 0) {
      setAdapterRelations(null);
      return () => {
        active = false;
      };
    }
    memoryApi
      .createRelations(recordIds)
      .then((relations) => {
        if (!active || !canCommitMemoryScopeResult({ currentScopeKey: memoryScopeKeyRef.current, expectedScopeKey })) return;
        setAdapterRelations(relations);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [memoryApi, memoryRecords, memoryScopeKey]);

  useEffect(() => {
    let active = true;
    const expectedScopeKey = memoryScopeKey;
    if (memoryRecords.length < 2) {
      return () => {
        active = false;
      };
    }

    const now = new Date().toISOString();
    runMemoryReflectionWorker({
      records: memoryRecords,
      sessionId: memoryScope?.sessionId,
      projectId: memoryRecords[0]?.projectId,
      now,
    }).then((result) => {
      if (!active || !canCommitMemoryScopeResult({ currentScopeKey: memoryScopeKeyRef.current, expectedScopeKey })) return;
      if (result.fixedCount === 0) return;

      const persistencePlan = createMemoryCuratorPersistencePlan(memoryRecords, result.resolvedRecords);
      setMemoryRecords(result.resolvedRecords);
      markMemorySyncingRef.current(now);
      appendEventRef.current("memory.reflection_worker.resolved", {
        fixedCount: result.fixedCount,
        changedRecordIds: persistencePlan.changedRecordIds,
        forgetRecordIds: persistencePlan.forgetRecordIds,
        activateRecordIds: persistencePlan.activateRecordIds,
        quarantineRecordIds: persistencePlan.quarantineRecordIds,
        remainingIssueCount: result.newIssues.length,
        memoryScope: memoryScope?.namespace,
        recallTraceId: memoryScope?.recallTraceId,
        sourceChannel: "desktop",
      });
      void persistMemoryCuratorPlan(persistencePlan);
    }).catch((error: unknown) => {
      appendEventRef.current("memory.reflection_worker.error", {
        message: error instanceof Error ? error.message : "unknown memory reflection worker error",
        memoryScope: memoryScope?.namespace,
        recallTraceId: memoryScope?.recallTraceId,
      });
    });

    return () => {
      active = false;
    };
  }, [memoryApi, memoryRecords, memoryScope, memoryScopeKey]);

  useEffect(() => {
    let active = true;
    const expectedScopeKey = memoryScopeKey;
    memoryApi
      .reflect(expectedScopeKey)
      .then((reflection) => {
        if (!active || !canCommitMemoryScopeResult({ currentScopeKey: memoryScopeKeyRef.current, expectedScopeKey })) return;
        setAdapterReflection(reflection);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [memoryApi, memoryRecords, memoryScopeKey]);

  const baseInspector = useMemo(
    () =>
      createStage6MemoryInspector({
        records: memoryRecords,
        messages,
        packet,
        events,
        provider,
        createdAt: runtimeUpdatedAt,
      }),
    [events, memoryRecords, messages, packet, provider, runtimeUpdatedAt],
  );

  const memoryInspector: Stage6MemoryInspector = useMemo(
    () => ({
      ...baseInspector,
      ...(adapterRelations != null ? { relations: adapterRelations } : {}),
      ...(adapterReflection != null ? { reflection: adapterReflection } : {}),
    }),
    [adapterRelations, adapterReflection, baseInspector],
  );

  function prependMemoryRecord(memoryRecord: MemoryRecord) {
    setMemoryRecords((records) => [memoryRecord, ...records]);
  }

  function handleQueueMemoryCuratorCandidate(candidate: MemoryCuratorCandidate) {
    const updatedAt = new Date().toISOString();
    writeMemoryCuratorCandidate({
      candidate,
      scopeKey: memoryScopeKeyRef.current,
      updatedAt,
    });
    setMemoryRecords((records) => {
      if (records.some((record) => record.id === candidate.record.id)) {
        return records;
      }
      return [candidate.record, ...records];
    });
    markMemorySyncing(updatedAt);
    appendEvent("memory.curator.candidate.created", {
      agentId: candidate.agentId,
      candidateId: candidate.id,
      evidenceRefs: candidate.evidenceRefs,
      memoryScope: memoryScope?.namespace,
      reason: candidate.reason,
      recallTraceId: memoryScope?.recallTraceId,
      recordId: candidate.record.id,
      targetActivationState: candidate.targetActivationState,
      trustLevel: candidate.record.trustLevel,
    });
    requestRemember(candidate.record);
  }

  function handleMemoryMutationError(operation: string, recordIds: string[], error: unknown) {
    if (isMemoryAdapterError(error) && error.category === "promotion_pending") {
      appendEvent("memory.curator.promotion.pending", {
        operation,
        recordIds,
        category: error.category,
        memoryScope: memoryScope?.namespace,
        recallTraceId: memoryScope?.recallTraceId,
      });
      return;
    }
    appendEvent("memory.curator.persistence.error", {
      operation,
      recordIds,
      message: error instanceof Error ? error.message : "unknown memory mutation error",
      memoryScope: memoryScope?.namespace,
      recallTraceId: memoryScope?.recallTraceId,
    });
  }

  function requestRemember(record: MemoryRecord) {
    const input: MemoryInput = {
      layer: record.layer,
      scope: record.scope,
      kind: record.kind,
      title: record.title,
      content: record.content,
      sourceChannel: record.sourceChannel,
      trustLevel: record.trustLevel,
      projectId: record.projectId,
      sessionId: record.sessionId,
      tags: record.tags,
    };
    void memoryApi.remember(input).catch((error: unknown) => {
      handleMemoryMutationError("remember", [record.id], error);
    });
  }

  function persistMemoryCuratorPlan(plan: MemoryCuratorPersistencePlan) {
    if (plan.activateRecordIds.length > 0) {
      void memoryApi.activateMemories(plan.activateRecordIds).catch((error: unknown) => {
        handleMemoryMutationError("activate", plan.activateRecordIds, error);
      });
    }
    for (const recordId of plan.forgetRecordIds) {
      void memoryApi.forget(recordId).catch((error: unknown) => {
        handleMemoryMutationError("forget", [recordId], error);
      });
    }
    if (plan.quarantineRecordIds.length > 0) {
      appendEvent("memory.quarantine.requested", {
        recordIds: plan.quarantineRecordIds,
        policy: "reflection_worker",
        memoryScope: memoryScope?.namespace,
        recallTraceId: memoryScope?.recallTraceId,
      });
    }
  }

  function handleRememberCurrentContext() {
    const createdAt = new Date().toISOString();
    const candidates = rememberStage6Context({
      messages,
      packet,
      provider,
      agentId: memoryScope?.agentId,
      sessionId: memoryScope?.sessionId,
      createdAt,
    });

    setMemoryRecords((records) => {
      const existingIds = new Set(records.map((record) => record.id));
      return [...candidates.filter((record) => !existingIds.has(record.id)), ...records];
    });
    markMemorySyncing(createdAt);
    appendEvent("memory.candidate.created", {
      recordIds: candidates.map((record) => record.id),
      count: candidates.length,
      memoryScope: memoryScope?.namespace,
      recallTraceId: memoryScope?.recallTraceId,
      sourceChannel: "desktop",
      trustLevel: provider?.trustLevel ?? "limited",
      providerProfileId: provider?.id,
    });
    appendEvent("memory.recall.trace.updated", {
      traceId: memoryScope?.recallTraceId ?? memoryInspector.trace.id,
      memoryScope: memoryScope?.namespace,
      resultCount: memoryInspector.trace.results.length,
      usedCount: memoryInspector.trace.results.filter((result) => result.usedInDecision).length,
      blockedCount: memoryInspector.blockedCount,
    });
    for (const candidate of candidates) {
      requestRemember(candidate);
    }
  }

  async function createScopedMemoryInspector(
    targetScope: AgentChannelMemoryScope,
    scopedMessages: ConversationMessage[],
    scopedProvider = provider,
  ): Promise<Stage6MemoryInspector> {
    return resolveScopedMemoryInspector({
      currentInspector: memoryInspector,
      currentScope: memoryScope,
      targetScope,
      recallRecords: async (scope) => {
        const scopedAdapter = new DgxSimpleMemMemoryAdapter({
          profileId: `desktop_dgx_simplemem_${scope.recallTraceId}`,
          seedRecords: initialMemoryRecords,
        });
        const scopedApi = createAdapterBackedMementoMemoryApi({
          adapter: scopedAdapter,
          operationScope: scope,
          context: {
            appendEvent: async (event) => {
              appendEventRef.current(event.type, {
                ...event.payload,
                adapterEventId: event.id,
                adapterEventCreatedAt: event.createdAt,
                memoryScope: scope.namespace,
                recallTraceId: scope.recallTraceId,
              });
            },
            onAdapterError: (error) => {
              appendEventRef.current("memory.adapter.error", {
                category: error.category,
                message: error.message,
                memoryScope: scope.namespace,
                recallTraceId: scope.recallTraceId,
              });
            },
          },
        });
        const recallQuery = createAgentChannelRecallQuery(scope, packet.goal ?? "");
        const results = await scopedApi.recall({ query: recallQuery, sessionId: scope.sessionId, limit: 50 });
        return mergeMemoryRecordsWithCuratorLedger(
          results.map((result) => result.record),
          createMemoryControllerScopeKey(scope),
        );
      },
      messages: scopedMessages,
      packet,
      events,
      provider: scopedProvider,
      createdAt: runtimeUpdatedAt,
    });
  }

  function handlePinMemory(recordId: string) {
    setMemoryRecords((records) => pinMemoryRecord(records, recordId));
    appendEvent("memory.pin.updated", {
      recordId,
      pinned: true,
    });
    void memoryApi.pin(recordId).catch((error: unknown) => {
      handleMemoryMutationError("pin", [recordId], error);
    });
  }

  function handleActivateMemory(recordId: string) {
    setMemoryRecords((records) => activateMemoryRecord(records, recordId));
    appendEvent("memory.activation.updated", {
      recordId,
      activationState: "active",
    });
    void memoryApi.activateMemories([recordId]).catch((error: unknown) => {
      handleMemoryMutationError("activate", [recordId], error);
    });
  }

  function handleForgetMemory(recordId: string) {
    setMemoryRecords((records) => forgetMemoryRecord(records, recordId));
    appendEvent("memory.forget.requested", {
      recordId,
      policy: "tombstone_projection",
    });
    void memoryApi.forget(recordId).catch((error: unknown) => {
      handleMemoryMutationError("forget", [recordId], error);
    });
  }

  return {
    adapterStatus,
    createScopedMemoryInspector,
    handleActivateMemory,
    handleForgetMemory,
    handlePinMemory,
    handleQueueMemoryCuratorCandidate,
    handleRememberCurrentContext,
    memoryInspector,
    memoryRecords,
    prependMemoryRecord,
  };
}
