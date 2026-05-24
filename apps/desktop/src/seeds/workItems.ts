import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { DEFAULT_SESSION_ID } from "../runtime/stage2Runtime";
import { now } from "../lib/appConstants";

export const initialWorkItems: WorkItem[] = [
  {
    id: "work_item_bootstrap_event_storage",
    sessionId: DEFAULT_SESSION_ID,
    title: "DGX-02 Event Storage authority",
    kind: "review",
    lane: "check",
    status: "running",
    summary: "DGX-02 is authoritative; MacBook and Home PC keep client cache/outbox records.",
    sourceRefs: [{ source: "desktop_manual", observedAt: now, title: "PR0 authority cleanup" }],
    evidenceRefs: [
      {
        id: "evidence_authority_type",
        kind: "file_reference",
        reference: "packages/protocol/src/index.ts",
        summary: "SyncTopology uses dgx02_authoritative_with_client_cache.",
        observedAt: now,
      },
    ],
    missingInfo: [],
    priority: "high",
    createdAt: now,
  },
];

export const initialAssistantDrafts: AssistantDraft[] = [
  {
    id: "draft_bootstrap_handoff",
    workItemId: "work_item_bootstrap_event_storage",
    sessionId: DEFAULT_SESSION_ID,
    title: "Authority summary draft",
    body: "DGX-02 owns shared events; MacBook keeps a client cache/outbox and flushes after redaction.",
    targetSurface: "conversation",
    status: "ready_for_review",
    confidence: "high",
    evidenceRefs: initialWorkItems[0]?.evidenceRefs ?? [],
    missingInfo: [],
    createdAt: now,
  },
];

export const initialWorkItemHandoffs: WorkItemHandoff[] = [
  {
    id: "handoff_bootstrap_packet",
    workItemId: "work_item_bootstrap_event_storage",
    targetSurface: "coding_packet",
    summary: "Use authority model as a coding packet constraint.",
    payloadRef: "coding_packet://initial",
    evidenceRefs: initialWorkItems[0]?.evidenceRefs ?? [],
    missingInfo: [],
    approvalState: "not_required",
    createdAt: now,
  },
];
