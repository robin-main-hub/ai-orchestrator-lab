import type {
  CodingPacket,
  TerminalTimelineBlock,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import { sanitizePublicText } from "./publicRedaction";

export type CodingPacketExecutionSlotBlockInput = {
  createdAt: string;
  handoff: WorkItemHandoff;
  packet: CodingPacket;
  routeState?: "approved" | "pending_approval";
  sessionId: string;
  workItem?: WorkItem;
};

export function isCodingPacketExecutionHandoff(handoff: WorkItemHandoff): boolean {
  return handoff.targetSurface === "execution_slot" && Boolean(handoff.payloadRef?.startsWith("coding_packet://"));
}

export function createCodingPacketExecutionSlotBlock({
  createdAt,
  handoff,
  packet,
  routeState = "approved",
  sessionId,
  workItem,
}: CodingPacketExecutionSlotBlockInput): TerminalTimelineBlock {
  return {
    id: `tmux_handoff_${stableId(`${handoff.id}:${workItem?.id ?? "missing_work_item"}:${createdAt}`)}`,
    sessionId,
    terminalSessionId: "terminal_session_ai_swarm",
    paneId: "role:code",
    role: "code",
    host: "dgx_02",
    kind: "handoff",
    status: routeState === "pending_approval" ? "pending_approval" : "completed",
    title: "실행 슬롯 준비됨",
    summary: createExecutionSlotSummary(packet, workItem),
    approvalId: handoff.id,
    relatedEventIds: [handoff.id, ...(workItem ? [workItem.id] : [])],
    redactionApplied: true,
    createdAt,
  };
}

function createExecutionSlotSummary(packet: CodingPacket, workItem?: WorkItem): string {
  const goal = sanitize(packet.goal || workItem?.title || "CodingPacket");
  const verificationCount = packet.verificationPlan.length;
  const fileCount = packet.filesToInspect.length;
  const missingCount = workItem?.missingInfo.filter((slot) => slot.status === "missing").length ?? 0;
  return [
    goal,
    `검증 ${verificationCount}개`,
    `파일 ${fileCount}개`,
    missingCount > 0 ? `보완 슬롯 ${missingCount}개` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function sanitize(value: string): string {
  return sanitizePublicText(value).slice(0, 220);
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
