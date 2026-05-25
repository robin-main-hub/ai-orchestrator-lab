import { useMemo, useState } from "react";
import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryRecord,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import {
  activateMemoryRecord,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
} from "../runtime/stage6Memory";
import { initialMemoryRecords } from "../seeds/memory";

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

export function useMemoryController({
  appendEvent,
  events,
  markMemorySyncing,
  messages,
  packet,
  provider,
  runtimeUpdatedAt,
}: MemoryControllerInput) {
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>(initialMemoryRecords);

  const memoryInspector = useMemo(
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
    handleActivateMemory,
    handleForgetMemory,
    handlePinMemory,
    handleRememberCurrentContext,
    memoryInspector,
    memoryRecords,
    prependMemoryRecord,
  };
}
