import { useEffect, useMemo, useState } from "react";
import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryRecord,
  MemoryRelation,
  ProviderProfile,
  Reflection,
} from "@ai-orchestrator/protocol";
import { DgxSimpleMemMemoryAdapter } from "@ai-orchestrator/memory";
import {
  activateMemoryRecord,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
  type Stage6MemoryInspector,
} from "../runtime/stage6Memory";
import { initialMemoryRecords } from "../seeds/memory";
import { createAdapterBackedMementoMemoryApi } from "../runtime/stage27MemoryApi";
import {
  createAgentChannelRecallQuery,
  type AgentChannelMemoryScope,
} from "../lib/agentConversationChannels";

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
  const memoryAdapterProfileId = memoryScope
    ? `desktop_dgx_simplemem_${memoryScope.recallTraceId}`
    : "desktop_dgx_simplemem";

  const memoryAdapter = useMemo(
    () =>
      new DgxSimpleMemMemoryAdapter({
        profileId: memoryAdapterProfileId,
        seedRecords: initialMemoryRecords,
      }),
    [memoryAdapterProfileId],
  );

  const memoryApi = useMemo(
    () => createAdapterBackedMementoMemoryApi({ adapter: memoryAdapter }),
    [memoryAdapter],
  );

  useEffect(() => {
    let active = true;
    setAdapterStatus("loading");
    const recallQuery = memoryScope
      ? createAgentChannelRecallQuery(memoryScope, packet.goal ?? "")
      : packet.goal ?? "";
    memoryApi
      .recall({ query: recallQuery, sessionId: memoryScope?.sessionId, limit: 50 })
      .then((results) => {
        if (!active) return;
        setMemoryRecords(results.map((result) => result.record));
        setAdapterStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setAdapterStatus("error");
      });
    return () => {
      active = false;
    };
  }, [memoryApi, memoryScope, packet.goal]);

  useEffect(() => {
    const recordIds = memoryRecords.map((record) => record.id);
    if (recordIds.length === 0) {
      setAdapterRelations(null);
      return;
    }
    memoryApi.createRelations(recordIds).then(setAdapterRelations).catch(() => {});
  }, [memoryApi, memoryRecords]);

  useEffect(() => {
    memoryApi.reflect(memoryScope?.namespace ?? "session_desktop_001").then(setAdapterReflection).catch(() => {});
  }, [memoryApi, memoryRecords, memoryScope?.namespace]);

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

  function handleRememberCurrentContext() {
    const createdAt = new Date().toISOString();
    const candidates = rememberStage6Context({
      messages,
      packet,
      provider,
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
  }

  function handlePinMemory(recordId: string) {
    setMemoryRecords((records) => pinMemoryRecord(records, recordId));
    appendEvent("memory.pin.updated", {
      recordId,
      pinned: true,
    });
  }

  function handleActivateMemory(recordId: string) {
    setMemoryRecords((records) => activateMemoryRecord(records, recordId));
    appendEvent("memory.activation.updated", {
      recordId,
      activationState: "active",
    });
  }

  function handleForgetMemory(recordId: string) {
    setMemoryRecords((records) => forgetMemoryRecord(records, recordId));
    appendEvent("memory.forget.requested", {
      recordId,
      policy: "tombstone_projection",
    });
  }

  return {
    adapterStatus,
    handleActivateMemory,
    handleForgetMemory,
    handlePinMemory,
    handleRememberCurrentContext,
    memoryInspector,
    memoryRecords,
    prependMemoryRecord,
  };
}
