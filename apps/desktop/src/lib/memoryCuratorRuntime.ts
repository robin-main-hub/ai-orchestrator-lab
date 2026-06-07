import type { ConversationMessage, SourceTrust, MemoryRecord } from "@ai-orchestrator/protocol";
import {
  createMemoryCuratorCandidate,
  type MemoryCuratorCandidate,
} from "./memoryCuratorApproval";
import type { AttachmentProcessingPlan } from "./attachmentProcessing";
import {
  readJsonState,
  writeJsonState,
  type JsonStorageLike,
} from "./persistentJsonState";

export type MemoryCuratorPersistencePlan = {
  activateRecordIds: string[];
  changedRecordIds: string[];
  forgetRecordIds: string[];
  quarantineRecordIds: string[];
};

export type MemoryCuratorLedgerEntry = {
  candidate: MemoryCuratorCandidate;
  scopeKey: string;
  updatedAt: string;
};

export type MemoryCuratorRecordOverlayInput = {
  agentId: string;
  candidateStatus?: MemoryCuratorCandidate["status"];
  record: MemoryRecord;
  recordPatch: Partial<MemoryRecord>;
  scopeKey: string;
  storage?: JsonStorageLike;
  updatedAt: string;
};

export const memoryCuratorLedgerStorageKey = "ai-orchestrator.memory-curator-ledger.v1";

export type ConversationTurnMemoryCandidateInput = {
  agentId: string;
  agentName: string;
  assistantMessage: Pick<ConversationMessage, "content" | "createdAt" | "id" | "role" | "sessionId">;
  attachmentProcessingPlans?: AttachmentProcessingPlan[];
  createdAt: string;
  memoryScopeNamespace?: string;
  projectId?: string;
  providerProfileId?: string;
  recallTraceId?: string;
  trustLevel?: SourceTrust;
  userMessage: Pick<ConversationMessage, "content" | "createdAt" | "id" | "role" | "sessionId">;
};

const defaultProjectId = "project_ai_orchestrator_lab";

export function createMemoryCuratorPersistencePlan(
  beforeRecords: MemoryRecord[],
  afterRecords: MemoryRecord[],
): MemoryCuratorPersistencePlan {
  const beforeById = new Map(beforeRecords.map((record) => [record.id, record]));
  const activateRecordIds: string[] = [];
  const changedRecordIds: string[] = [];
  const forgetRecordIds: string[] = [];
  const quarantineRecordIds: string[] = [];

  for (const after of afterRecords) {
    const before = beforeById.get(after.id);
    if (!before) continue;

    const becameTombstoned = !before.tombstonedAt && Boolean(after.tombstonedAt);
    const activationChanged = before.activationState !== after.activationState;
    const updated = before.updatedAt !== after.updatedAt;

    if (becameTombstoned) {
      forgetRecordIds.push(after.id);
    }
    if (after.activationState === "active" && before.activationState !== "active" && !after.tombstonedAt) {
      activateRecordIds.push(after.id);
    }
    if (after.activationState === "quarantined" && before.activationState !== "quarantined" && !after.tombstonedAt) {
      quarantineRecordIds.push(after.id);
    }
    if (becameTombstoned || activationChanged || updated) {
      changedRecordIds.push(after.id);
    }
  }

  return {
    activateRecordIds,
    changedRecordIds,
    forgetRecordIds,
    quarantineRecordIds,
  };
}

export function readMemoryCuratorLedger(storage?: JsonStorageLike): MemoryCuratorLedgerEntry[] {
  return readJsonState(
    memoryCuratorLedgerStorageKey,
    [],
    parseMemoryCuratorLedger,
    storage,
  );
}

export function writeMemoryCuratorCandidate({
  candidate,
  scopeKey,
  storage,
  updatedAt,
}: {
  candidate: MemoryCuratorCandidate;
  scopeKey: string;
  storage?: JsonStorageLike;
  updatedAt: string;
}): MemoryCuratorLedgerEntry[] {
  const current = readMemoryCuratorLedger(storage);
  const nextEntry: MemoryCuratorLedgerEntry = { candidate, scopeKey, updatedAt };
  const next = [
    nextEntry,
    ...current.filter((entry) => entry.candidate.id !== candidate.id),
  ].slice(0, 200);
  writeJsonState(memoryCuratorLedgerStorageKey, next, storage);
  return next;
}

export function updateMemoryCuratorLedgerRecord({
  candidateStatus,
  recordId,
  recordPatch,
  scopeKey,
  storage,
  updatedAt,
}: {
  candidateStatus?: MemoryCuratorCandidate["status"];
  recordId: string;
  recordPatch: Partial<MemoryRecord>;
  scopeKey?: string;
  storage?: JsonStorageLike;
  updatedAt: string;
}): MemoryCuratorLedgerEntry[] {
  const current = readMemoryCuratorLedger(storage);
  const next = current.map((entry) => {
    if (entry.candidate.record.id !== recordId) return entry;
    if (scopeKey && entry.scopeKey !== scopeKey) return entry;
    return {
      ...entry,
      candidate: {
        ...entry.candidate,
        ...(candidateStatus ? { status: candidateStatus } : {}),
        record: {
          ...entry.candidate.record,
          ...recordPatch,
        },
      },
      updatedAt,
    };
  });
  writeJsonState(memoryCuratorLedgerStorageKey, next, storage);
  return next;
}

export function upsertMemoryCuratorRecordOverlay({
  agentId,
  candidateStatus,
  record,
  recordPatch,
  scopeKey,
  storage,
  updatedAt,
}: MemoryCuratorRecordOverlayInput): MemoryCuratorLedgerEntry[] {
  const current = readMemoryCuratorLedger(storage);
  const patchedRecord: MemoryRecord = {
    ...record,
    ...recordPatch,
  };
  const targetActivationState: MemoryCuratorCandidate["targetActivationState"] =
    patchedRecord.activationState === "quarantined" ? "quarantined" : "active";
  let updatedExisting = false;
  const patched: MemoryCuratorLedgerEntry[] = current.map((entry) => {
    if (entry.scopeKey !== scopeKey || entry.candidate.record.id !== record.id) return entry;
    updatedExisting = true;
    return {
      ...entry,
      candidate: {
        ...entry.candidate,
        ...(candidateStatus ? { status: candidateStatus } : {}),
        record: patchedRecord,
        targetActivationState,
      },
      updatedAt,
    };
  });

  const next: MemoryCuratorLedgerEntry[] = updatedExisting
    ? patched
    : [
      {
        candidate: {
          ...createMemoryCuratorCandidate({
            agentId,
            createdAt: record.createdAt,
            reason: "기억 관리자 수동 결정 overlay",
            record: patchedRecord,
          }),
          ...(candidateStatus ? { status: candidateStatus } : {}),
          targetActivationState,
        },
        scopeKey,
        updatedAt,
      },
      ...patched,
    ];

  const trimmed = next.slice(0, 200);
  writeJsonState(memoryCuratorLedgerStorageKey, trimmed, storage);
  return trimmed;
}

export function getMemoryCuratorRecordsForScope(
  scopeKey: string,
  storage?: JsonStorageLike,
): MemoryRecord[] {
  return readMemoryCuratorLedger(storage)
    .filter((entry) => entry.scopeKey === scopeKey)
    .filter((entry) => entry.candidate.status !== "rejected")
    .map((entry) => entry.candidate.record)
    .filter((record) => !record.tombstonedAt && record.activationState !== "quarantined");
}

export function mergeMemoryRecordsWithCuratorLedger(
  records: MemoryRecord[],
  scopeKey: string,
  storage?: JsonStorageLike,
): MemoryRecord[] {
  const recordIds = new Set(records.map((record) => record.id));
  const ledgerRecords = getMemoryCuratorRecordsForScope(scopeKey, storage)
    .filter((record) => !recordIds.has(record.id));
  return [...ledgerRecords, ...records];
}

export function createConversationTurnMemoryCandidate({
  agentId,
  agentName,
  assistantMessage,
  attachmentProcessingPlans = [],
  createdAt,
  memoryScopeNamespace,
  projectId = defaultProjectId,
  providerProfileId,
  recallTraceId,
  trustLevel = "limited",
  userMessage,
}: ConversationTurnMemoryCandidateInput): MemoryCuratorCandidate {
  const attachmentSummary = summarizeAttachmentPlansForMemory(attachmentProcessingPlans);
  const userText = `사용자: ${userMessage.content}`;
  const assistantText = `${agentName}: ${assistantMessage.content}`;
  const attachmentText = attachmentSummary ? `첨부: ${attachmentSummary}` : undefined;
  const memoryContent = [userText, assistantText, attachmentText].filter(Boolean).join("\n");
  const keywordSource = [
    userMessage.content,
    assistantMessage.content,
    agentName,
    attachmentProcessingPlans.map((plan) => `${plan.name} ${plan.kind} ${plan.processingMode} ${plan.status}`).join(" "),
  ].join(" ");
  const record: MemoryRecord = {
    id: `memory_conversation_turn_${stableId(`${agentId}:${userMessage.id}:${assistantMessage.id}`)}`,
    activationState: "suggested",
    content: compactMemoryText(memoryContent),
    createdAt,
    entityReinforcement: 0,
    importance: 0.55,
    kind: "workflow",
    keywords: uniqueWords(keywordSource).slice(0, 12),
    layer: "episode",
    losslessRestatement: compactMemoryText(
      `${createdAt} ${agentName} 대화에서 사용자는 ${userMessage.content} 라고 말했고 에이전트는 ${assistantMessage.content} 라고 답했다.`,
    ),
    pinned: false,
    projectId,
    scope: "session",
    sessionId: userMessage.sessionId,
    sourceChannel: "agent",
    tags: [
      "conversation",
      "curator-candidate",
      attachmentProcessingPlans.length > 0 ? "attachment" : undefined,
      ...uniqueAttachmentKinds(attachmentProcessingPlans).map((kind) => `attachment:${kind}`),
      `agent:${agentId}`,
      providerProfileId ? `provider:${providerProfileId}` : undefined,
      recallTraceId ? `recall:${recallTraceId}` : undefined,
      memoryScopeNamespace ? `scope:${memoryScopeNamespace}` : undefined,
    ].filter((value): value is string => Boolean(value)),
    title: `${agentName} 대화 기억 후보`,
    topic: "Agent conversation continuity",
    trustLevel,
  };

  return createMemoryCuratorCandidate({
    agentId,
    createdAt,
    reason: "에이전트별 대화 연속성 유지",
    record,
  });
}

function summarizeAttachmentPlansForMemory(plans: AttachmentProcessingPlan[]): string | undefined {
  if (plans.length === 0) return undefined;
  return plans
    .slice(0, 6)
    .map((plan) => {
      const suffix = plan.reason ? ` · ${plan.reason}` : "";
      return `${plan.name}(${plan.kind}/${plan.processingMode}/${plan.status})${suffix}`;
    })
    .join("; ");
}

function uniqueAttachmentKinds(plans: AttachmentProcessingPlan[]): string[] {
  return Array.from(new Set(plans.map((plan) => plan.kind)));
}

function compactMemoryText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

function uniqueWords(value: string): string[] {
  const seen = new Set<string>();
  const words = value
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  for (const word of words) {
    seen.add(word);
  }
  return Array.from(seen);
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function parseMemoryCuratorLedger(value: unknown): MemoryCuratorLedgerEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("invalid memory curator ledger");
  }
  return value
    .map((entry) => parseMemoryCuratorLedgerEntry(entry))
    .filter((entry): entry is MemoryCuratorLedgerEntry => Boolean(entry));
}

function parseMemoryCuratorLedgerEntry(value: unknown): MemoryCuratorLedgerEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as { candidate?: unknown }).candidate;
  const scopeKey = (value as { scopeKey?: unknown }).scopeKey;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  if (!candidate || typeof candidate !== "object") return undefined;
  const record = (candidate as { record?: unknown }).record;
  const candidateId = (candidate as { id?: unknown }).id;
  if (!record || typeof record !== "object" || typeof candidateId !== "string") return undefined;
  if (typeof scopeKey !== "string" || typeof updatedAt !== "string") return undefined;
  return value as MemoryCuratorLedgerEntry;
}
