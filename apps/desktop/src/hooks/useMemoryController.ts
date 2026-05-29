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

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type MemoryControllerInput = {
  appendEvent: AppendWorkbenchEvent;
  events: EventEnvelope[];
  markMemorySyncing: (createdAt: string) => void;
  messages: ConversationMessage[];
  packet: CodingPacket;
  provider?: ProviderProfile;
  runtimeUpdatedAt: string;
};

const defaultSessionId = "session_desktop_001";

export function useMemoryController({
  appendEvent,
  events,
  markMemorySyncing,
  messages,
  packet,
  provider,
  runtimeUpdatedAt,
}: MemoryControllerInput) {
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [adapterStatus, setAdapterStatus] = useState<"loading" | "ready" | "error">("loading");
  const [adapterRelations, setAdapterRelations] = useState<MemoryRelation[] | null>(null);
  const [adapterReflection, setAdapterReflection] = useState<Reflection | null>(null);

  const memoryAdapter = useMemo(
    () =>
      new DgxSimpleMemMemoryAdapter({
        profileId: "desktop_dgx_simplemem",
        seedRecords: initialMemoryRecords,
      }),
    [],
  );

  const memoryApi = useMemo(
    () => createAdapterBackedMementoMemoryApi({ adapter: memoryAdapter }),
    [memoryAdapter],
  );

  useEffect(() => {
    setAdapterStatus("loading");
    memoryApi
      .recall({ query: packet.goal ?? "", limit: 50 })
      .then((results) => {
        setMemoryRecords(results.map((r) => r.record));
        setAdapterStatus("ready");
      })
      .catch(() => setAdapterStatus("error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryApi]);

  useEffect(() => {
    const ids = memoryRecords.map((r) => r.id);
    if (ids.length === 0) return;
    memoryApi.createRelations(ids).then(setAdapterRelations).catch(() => {});
  }, [memoryApi, memoryRecords]);

  useEffect(() => {
    memoryApi.reflect(defaultSessionId).then(setAdapterReflection).catch(() => {});
  }, [memoryApi, memoryRecords]);

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
    [baseInspector, adapterRelations, adapterReflection],
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
      sourceChannel: "desktop",
      trustLevel: provider?.trustLevel ?? "limited",
      providerProfileId: provider?.id,
    });
    appendEvent("memory.recall.trace.updated", {
      traceId: memoryInspector.trace.id,
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
