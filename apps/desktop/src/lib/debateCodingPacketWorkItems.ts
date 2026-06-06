import type {
  CodingPacket,
  EvidenceRef,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import { assertSafeCodingPacket, extractCodingPacketFromDebate, type DebateContext } from "@ai-orchestrator/agents";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { deriveDebateDecisionReadiness, type DebateDecisionReadiness } from "./debateDecisionReadiness";
import { sanitizePublicText } from "./publicRedaction";

export type DebateCodingPacketProjectionInput = {
  contextPackTier: string;
  session: Stage3DebateSession;
  sessionId: string;
  userPreferences?: string[];
};

export type DebateCodingPacketProjection = {
  evidenceRefs: EvidenceRef[];
  packet: CodingPacket;
  readiness: DebateDecisionReadiness;
};

export type DebateCodingPacketWorkItemsInput = {
  createdAt: string;
  ownerAgentId?: string;
  projection: DebateCodingPacketProjection;
  sessionId: string;
};

export type DebateCodingPacketWorkItems = {
  handoff: WorkItemHandoff;
  workItem: WorkItem;
};

export function createDebateCodingPacketProjection({
  contextPackTier,
  session,
  sessionId,
  userPreferences = [],
}: DebateCodingPacketProjectionInput): DebateCodingPacketProjection {
  const readiness = deriveDebateDecisionReadiness(session);
  const debateContext: DebateContext = {
    constraints: [],
    conversationSummary: session.summary,
    memoryTraceIds: [],
    openQuestions: readiness.blockers,
    problem: session.problem,
    sessionId,
    userPreferences,
  };
  const extractedPacket = extractCodingPacketFromDebate(debateContext, session.rounds);
  const packet = assertSafeCodingPacket({
    ...extractedPacket,
    context: [
      `ContextPack tier: ${sanitize(contextPackTier)}`,
      `Debate session: ${sanitize(session.id)}`,
      ...session.contextPreview.map(sanitize),
      ...extractedPacket.context,
    ],
    reviewerNotes: [
      ...extractedPacket.reviewerNotes,
      readiness.state === "ready" ? "Debate readiness: ready" : `Debate readiness: ${readiness.state}`,
      ...readiness.blockers.map((blocker) => `Blocker: ${sanitize(blocker)}`),
    ],
  });

  return {
    evidenceRefs: createDebateEvidenceRefs(session, readiness),
    packet,
    readiness,
  };
}

export function createDebateCodingPacketWorkItems({
  createdAt,
  ownerAgentId,
  projection,
  sessionId,
}: DebateCodingPacketWorkItemsInput): DebateCodingPacketWorkItems {
  const payloadRef = `coding_packet://${sessionId}`;
  const missingInfo =
    projection.packet.filesToInspect.length === 0
      ? [
          {
            id: `missing_files_${stableId(`${sessionId}:files:${createdAt}`)}`,
            label: "검토 파일",
            reason: "실행 전 명시 파일이 있으면 코딩 인계가 더 안전합니다.",
            required: false,
            status: "missing" as const,
          },
        ]
      : [];
  const workItem: WorkItem = {
    id: `work_item_packet_${stableId(`${sessionId}:packet:${createdAt}`)}`,
    sessionId,
    title: sanitize(projection.packet.goal).slice(0, 72),
    kind: "spec_doc",
    lane: "approve",
    surface: "coding_packet",
    status: projection.readiness.state === "blocked" ? "blocked" : "waiting_approval",
    summary: `${projection.packet.decisions.length} decisions / ${projection.packet.implementationPlan.length} implementation steps`,
    sourceRefs: [
      {
        source: "desktop_manual",
        observedAt: createdAt,
        title: "Debate Coding Packet",
      },
    ],
    evidenceRefs: [
      {
        id: `evidence_packet_${stableId(`${sessionId}:packet:evidence:${createdAt}`)}`,
        kind: "artifact",
        reference: payloadRef,
        summary: "Debate 결정에서 구조화된 CodingPacket 후보를 생성했습니다.",
        observedAt: createdAt,
      },
      ...projection.evidenceRefs,
    ],
    missingInfo,
    ownerAgentId,
    priority: projection.readiness.state === "ready" ? "high" : "normal",
    createdAt,
  };
  const handoff: WorkItemHandoff = {
    id: `handoff_packet_${stableId(`${sessionId}:handoff:${createdAt}`)}`,
    workItemId: workItem.id,
    targetSurface: "execution_slot",
    summary: "Coding Packet 승인 후 실행 슬롯으로 인계합니다.",
    payloadRef,
    evidenceRefs: workItem.evidenceRefs,
    missingInfo,
    approvalState: projection.readiness.state === "blocked" ? "expired" : "required",
    createdAt,
  };

  return { handoff, workItem };
}

function createDebateEvidenceRefs(session: Stage3DebateSession, readiness: DebateDecisionReadiness): EvidenceRef[] {
  const refs: EvidenceRef[] = [
    {
      id: `evidence_debate_${stableId(session.id)}`,
      kind: "event",
      reference: `debate://${session.id}`,
      title: "Debate 결정 준비도",
      summary: `${readiness.headline} · 결정 ${readiness.decisionCount}개 · 코딩 영향 ${readiness.codingImpactCount}개`,
      observedAt: session.promotedAt,
    },
  ];
  for (const utterance of session.rounds.flatMap((round) => round.utterances).filter((utterance) => utterance.decisionId).slice(0, 3)) {
    refs.push({
      id: `evidence_debate_utterance_${stableId(utterance.id)}`,
      kind: "event",
      reference: `debate://${session.id}/utterance/${utterance.id}`,
      title: "결정 발언",
      summary: sanitize(utterance.content),
      observedAt: utterance.createdAt,
    });
  }
  return refs;
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function sanitize(value: string): string {
  return sanitizePublicText(value);
}
