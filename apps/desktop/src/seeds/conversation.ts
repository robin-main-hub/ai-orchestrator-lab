import {
  Archive,
  Bot,
  Code2,
  FlaskConical,
  FileText,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  RadioTower,
  Repeat,
  Sparkles,
} from "lucide-react";
import {
  createCodingPacketDraft,
  createDebateRounds,
  type DebateContext,
} from "@ai-orchestrator/agents";
import type {
  BackupProjection,
  BranchExperiment,
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  TerminalSlot,
} from "@ai-orchestrator/protocol";
import { DEFAULT_SESSION_ID, createStage2Event } from "../runtime/stage2Runtime";
import { createStage4AgentRun } from "../runtime/stage4Runtime";
import { now } from "../lib/appConstants";
import type { NavItem, NavSection } from "../types";
import { seededAgentProfiles } from "./agents";

const debateContext: DebateContext = {
  sessionId: DEFAULT_SESSION_ID,
  problem: "AI Orchestrator Lab 초기 모노레포 골격을 구현한다.",
  conversationSummary: "문서화된 제품 방향을 유지하면서 protocol-first 구조와 데스크톱 작업판을 먼저 만든다.",
  constraints: ["MiMo 기본 모델 호출 경로 유지", "터미널 실행 제외", "API 키 원문 저장 금지"],
  openQuestions: ["Tauri 전환 시점", "DGX sync protocol 세부안"],
  userPreferences: ["한국어 UI", "작업실 같은 어두운 패널", "토론 결과는 Coding Packet으로 연결"],
  memoryTraceIds: ["trace_memory_001", "trace_review_003"],
};

export const codingPacket: CodingPacket = createCodingPacketDraft(debateContext);
export const debateRounds = createDebateRounds("debate_initial_skeleton");

export const terminalSlots: TerminalSlot[] = [
  {
    id: "slot_local_cli",
    label: "Local CLI",
    status: "idle",
    permissionState: "not_required",
    lastCommandPreview: "대기",
  },
  {
    id: "slot_dgx_remote",
    label: "DGX Remote",
    status: "pending_approval",
    permissionState: "required",
    lastCommandPreview: "remote workspace 연결 요청",
  },
];

export const backupProjections: BackupProjection[] = [
  {
    id: "backup_obsidian",
    sessionId: DEFAULT_SESSION_ID,
    target: "obsidian",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_notion",
    sessionId: DEFAULT_SESSION_ID,
    target: "notion",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_mobile",
    sessionId: DEFAULT_SESSION_ID,
    target: "mobile",
    status: "failed",
    redactionApplied: true,
  },
];

export const navSections: NavSection[] = [
  {
    id: "main",
    label: "메인",
    items: [
      { id: "dashboard", label: "대시보드", icon: Sparkles },
      { id: "sessions", label: "세션", icon: MessageSquare },
      { id: "projects", label: "프로젝트", icon: LayoutDashboard },
    ],
  },
  {
    id: "operations",
    label: "작전",
    items: [
      { id: "run", label: "실행", icon: Bot },
      { id: "theater", label: "작전극장", icon: Sparkles },
      { id: "coding", label: "코딩", icon: Code2 },
      { id: "research", label: "리서치", icon: FlaskConical },
      { id: "rmas", label: "목표 루프", icon: Repeat },
    ],
  },
  {
    id: "system",
    label: "시스템",
    items: [
      { id: "providers", label: "프로바이더", icon: KeyRound },
      { id: "config_files", label: "설정파일", icon: FileText },
      { id: "channels", label: "채널", icon: RadioTower },
      { id: "backup", label: "백업", icon: Archive },
      { id: "command_center", label: "어시스턴트 인박스", icon: Inbox },
    ],
  },
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);



export const initialConversationMessages: ConversationMessage[] = [
  {
    id: "message_seed_user",
    sessionId: DEFAULT_SESSION_ID,
    role: "user",
    content: "문서에 맞춰 첫 구현 골격을 만들자. 토론으로 확대할 수 있게 경계도 살려줘.",
    createdAt: now,
    metadata: {
      agentId: "agent_orchestrator",
    },
  },
  {
    id: "message_seed_orchestrator",
    sessionId: DEFAULT_SESSION_ID,
    role: "assistant",
    content: "프로토콜 계약, 모델 연결 경계, 에이전트 런타임, 데스크톱 관제판을 먼저 안전하게 연결하고 기본 대화는 MiMo Token Plan 경로로 이어간다.",
    createdAt: now,
    metadata: {
      agentId: "agent_orchestrator",
      agentName: "마키마",
      providerProfileId: "provider_mimo_token_openai",
      modelId: "mimo-v2.5-pro",
    },
  },
];

export const initialBranchExperiments: BranchExperiment[] = [
  {
    id: "branch_shadow_architect",
    sourceSessionId: DEFAULT_SESSION_ID,
    title: "대안 검토: 프로토콜 우선 구조",
    agentName: "오시노 시노부",
    status: "ready",
    summary: "메인 대화는 깨끗하게 유지하고, 프로토콜과 이벤트 저장 경계만 요약해서 채택 후보로 둔다.",
    createdAt: now,
  },
  {
    id: "branch_shadow_reviewer",
    sourceSessionId: DEFAULT_SESSION_ID,
    title: "대안 검토: 보안/권한 반대 검토",
    agentName: "시노미야 카구야",
    status: "drafting",
    summary: "권한, 마스킹, 공급자 신뢰가 흔들리는 지점을 별도 검토로 확인한다.",
    createdAt: now,
  },
];

function createDesktopEvent<T>(type: string, payload: T, createdAt = new Date().toISOString()): EventEnvelope<T> {
  return createStage2Event({ type, payload, createdAt });
}

export const initialEventLog: EventEnvelope[] = initialConversationMessages.map((message) =>
  createDesktopEvent(
    "conversation.message.created",
    {
      messageId: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      redaction: "applied",
    },
    message.createdAt,
  ),
);

export const initialAgentRun = createStage4AgentRun({
  packet: codingPacket,
  primaryAgent: seededAgentProfiles[0],
  agents: seededAgentProfiles,
  messages: initialConversationMessages,
  events: initialEventLog,
  createdAt: now,
});
