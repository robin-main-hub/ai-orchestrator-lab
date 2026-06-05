import { useState, type Dispatch, type SetStateAction } from "react";
import { Terminal } from "lucide-react";
import type {
  ApprovalRequest,
  CodingPacket,
  ConversationMessage,
  TerminalTimelineBlock,
  TmuxPaneRole,
} from "@ai-orchestrator/protocol";
import {
  requestTmuxCapture,
  requestTmuxDispatch,
  type DesktopTmuxDispatchRequest,
} from "../runtime/stage33TmuxServer";
import type { AgentActivityStatus, AgentVisualSettings, WorkbenchAgent } from "../types";
import { StatusBadge } from "@/ui/status-badge";
import { TmuxPaneCard } from "./TmuxPaneCard";
import { makeSyntheticBlock } from "./TmuxPaneTimeline";
import {
  compactTmuxPreview,
  formatTmuxDifficultyLabel,
  formatTmuxPaneCountLabel,
  sanitizeTmuxWorkbenchText,
  tmuxPaneRoleLabel,
  tmuxWorkbenchCopy,
  type TmuxWorkbenchDifficulty,
} from "../lib/tmuxWorkbenchPresentation";

type TmuxPaneDefinition = {
  id: string;
  roleKey: TmuxPaneRole;
  title: string;
  role: string;
  state: string;
  agent?: WorkbenchAgent;
  signal: string;
};

type PaneBusyState = "capture" | "dispatch";

export type TmuxApprovalQueuedInput = {
  approval: ApprovalRequest;
  request: DesktopTmuxDispatchRequest;
};

export function TmuxSwarmBoard({
  activeSessionId,
  agentActivityById,
  agentVisualsById,
  agents,
  messages,
  onApprovalQueued,
  packet,
  commandDrafts,
  onCommandDraftChange,
  statuses,
  onStatusChange,
  outputs,
  onOutputChange,
  timelineBlocks,
  onTimelineBlocksChange,
}: {
  activeSessionId: string;
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  agents: WorkbenchAgent[];
  messages: ConversationMessage[];
  onApprovalQueued?: (input: TmuxApprovalQueuedInput) => void;
  packet: CodingPacket;
  commandDrafts: Record<string, string>;
  onCommandDraftChange: Dispatch<SetStateAction<Record<string, string>>>;
  statuses: Record<string, string>;
  onStatusChange: Dispatch<SetStateAction<Record<string, string>>>;
  outputs: Record<string, string>;
  onOutputChange: Dispatch<SetStateAction<Record<string, string>>>;
  timelineBlocks: Record<string, TerminalTimelineBlock[]>;
  onTimelineBlocksChange: Dispatch<SetStateAction<Record<string, TerminalTimelineBlock[]>>>;
}) {
  const roleAgent = (role: WorkbenchAgent["role"]) => agents.find((agent) => agent.role === role);
  const recommendation = createTmuxSwarmRecommendation(packet, messages);
  const [busyByRole, setBusyByRole] = useState<Record<string, PaneBusyState | undefined>>({});
  const [boardNotice, setBoardNotice] = useState<string>(tmuxWorkbenchCopy.gatedNotice);
  const panes = createTmuxPanes(roleAgent, recommendation);
  const visiblePanes = panes.slice(0, recommendation.recommendedCount);

  function appendBlock(roleKey: TmuxPaneRole, block: TerminalTimelineBlock) {
    onTimelineBlocksChange((current) => ({
      ...current,
      [roleKey]: [...(current[roleKey] ?? []), block],
    }));
  }

  function updateCommandDraft(role: TmuxPaneRole, value: string) {
    onCommandDraftChange((current) => ({
      ...current,
      [role]: value,
    }));
  }

  async function handleCapturePane(pane: TmuxPaneDefinition) {
    setBusyByRole((current) => ({ ...current, [pane.roleKey]: "capture" }));
    onStatusChange((current) => ({ ...current, [pane.roleKey]: "capturing" }));
    try {
      const result = await requestTmuxCapture({
        request: {
          id: `tmux_capture_${pane.roleKey}_${Date.now()}`,
          sessionId: activeSessionId,
          terminalSessionId: "terminal_session_ai_swarm",
          role: pane.roleKey,
          host: "dgx_02",
          paneId: `role:${pane.roleKey}`,
          lines: 120,
          tmuxSessionName: "ai-swarm",
          createdAt: new Date().toISOString(),
        },
      });
      onStatusChange((current) => ({ ...current, [pane.roleKey]: result.status }));
      onOutputChange((current) => ({
        ...current,
        [pane.roleKey]: compactTmuxPreview(result.payload?.outputPreview || result.reason),
      }));
      appendBlock(
        pane.roleKey,
        makeSyntheticBlock({
          paneId: `role:${pane.roleKey}`,
          role: pane.roleKey,
          host: "dgx_02",
          sessionId: activeSessionId,
          terminalSessionId: "terminal_session_ai_swarm",
          kind: "capture",
          status: result.status === "captured" ? "completed" : "stale",
          title: `${pane.title} capture`,
          summary: result.reason,
          outputPreview: result.payload?.outputPreview,
        }),
      );
      setBoardNotice(sanitizeTmuxWorkbenchText(`${pane.title}: ${result.reason}`));
    } catch (error) {
      const message = sanitizeTmuxWorkbenchText(error instanceof Error ? error.message : String(error));
      onStatusChange((current) => ({ ...current, [pane.roleKey]: "capture failed" }));
      onOutputChange((current) => ({ ...current, [pane.roleKey]: message }));
      setBoardNotice(`${pane.title}: capture 실패 - ${message}`);
    } finally {
      setBusyByRole((current) => ({ ...current, [pane.roleKey]: undefined }));
    }
  }

  async function handleDispatchPane(pane: TmuxPaneDefinition) {
    const commandPreview = (commandDrafts[pane.roleKey] || defaultTmuxCommandForRole(pane.roleKey)).trim();
    const request: DesktopTmuxDispatchRequest = {
      id: `tmux_dispatch_${pane.roleKey}_${Date.now()}`,
      sessionId: activeSessionId,
      terminalSessionId: "terminal_session_ai_swarm",
      role: pane.roleKey,
      host: "dgx_02",
      paneId: `role:${pane.roleKey}`,
      commandPreview,
      approvalState: "required",
      dispatchMode: "execute_if_approved",
      tmuxSessionName: "ai-swarm",
      createdAt: new Date().toISOString(),
    };

    setBusyByRole((current) => ({ ...current, [pane.roleKey]: "dispatch" }));
    onStatusChange((current) => ({ ...current, [pane.roleKey]: "dispatching" }));
    try {
      const result = await requestTmuxDispatch({ request });
      onStatusChange((current) => ({ ...current, [pane.roleKey]: result.dispatch.status }));
      onOutputChange((current) => ({
        ...current,
        [pane.roleKey]: result.approval
          ? sanitizeTmuxWorkbenchText(`승인 대기: ${result.approval.reason}`)
          : sanitizeTmuxWorkbenchText(`${result.dispatch.status}: ${result.dispatch.reason}`),
      }));
      // Intent → optional approval gate → dispatch outcome
      appendBlock(
        pane.roleKey,
        makeSyntheticBlock({
          paneId: `role:${pane.roleKey}`,
          role: pane.roleKey,
          host: "dgx_02",
          sessionId: activeSessionId,
          terminalSessionId: "terminal_session_ai_swarm",
          kind: "command_intent",
          status: "planned",
          title: commandPreview || `${pane.title} intent`,
          summary: `의도: ${commandPreview}`,
        }),
      );
      if (result.approval) {
        appendBlock(
          pane.roleKey,
          makeSyntheticBlock({
            paneId: `role:${pane.roleKey}`,
            role: pane.roleKey,
            host: "dgx_02",
            sessionId: activeSessionId,
            terminalSessionId: "terminal_session_ai_swarm",
            kind: "approval",
            status: "pending_approval",
            title: "approval 대기",
            summary: result.approval.reason,
            approvalId: result.approval.id,
          }),
        );
        onApprovalQueued?.({ approval: result.approval, request });
      } else {
        appendBlock(
          pane.roleKey,
          makeSyntheticBlock({
            paneId: `role:${pane.roleKey}`,
            role: pane.roleKey,
            host: "dgx_02",
            sessionId: activeSessionId,
            terminalSessionId: "terminal_session_ai_swarm",
            kind: "dispatch",
            status:
              result.dispatch.status === "recorded"
                ? "completed"
                : result.dispatch.status === "blocked"
                  ? "blocked"
                  : result.dispatch.status === "pending_approval"
                    ? "pending_approval"
                    : "failed",
            title: `${pane.title} dispatch`,
            summary: result.dispatch.reason,
          }),
        );
      }
      setBoardNotice(sanitizeTmuxWorkbenchText(`${pane.title}: ${result.dispatch.reason}`));
    } catch (error) {
      const message = sanitizeTmuxWorkbenchText(error instanceof Error ? error.message : String(error));
      onStatusChange((current) => ({ ...current, [pane.roleKey]: "dispatch failed" }));
      onOutputChange((current) => ({ ...current, [pane.roleKey]: message }));
      setBoardNotice(`${pane.title}: dispatch 실패 - ${message}`);
    } finally {
      setBusyByRole((current) => ({ ...current, [pane.roleKey]: undefined }));
    }
  }

  return (
    <section
      aria-label={tmuxWorkbenchCopy.kicker}
      className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100 focus:outline-none"
      data-focus-id="tmux-swarm-board-container"
      tabIndex={-1}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-amber-400" />
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {tmuxWorkbenchCopy.kicker}
            </span>
            <h1 className="text-sm font-medium text-zinc-100">ai-swarm</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            {formatTmuxPaneCountLabel(visiblePanes.length)}
          </span>
          <span>{formatTmuxDifficultyLabel(recommendation.difficulty)}</span>
        </div>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-2 md:px-6">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">
            {tmuxWorkbenchCopy.recommendationLabel}
          </div>
          <p className="truncate text-xs text-zinc-200">{recommendation.summary}</p>
        </div>
        <div className="flex flex-wrap gap-1 sm:ml-auto">
          {recommendation.recommendedRoles.map((role) => (
            <StatusBadge variant="muted" size="sm" key={role}>
              {tmuxPaneRoleLabel(role)}
            </StatusBadge>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiblePanes.map((pane) => (
            <TmuxPaneCard
              busy={busyByRole[pane.roleKey]}
              commandDraft={commandDrafts[pane.roleKey] ?? defaultTmuxCommandForRole(pane.roleKey)}
              key={pane.id}
              lastOutput={outputs[pane.roleKey]}
              onCapture={() => void handleCapturePane(pane)}
              onCommandDraftChange={(value) => updateCommandDraft(pane.roleKey, value)}
              onDispatch={() => void handleDispatchPane(pane)}
              pane={{
                ...pane,
                state:
                  statuses[pane.roleKey] ??
                  (pane.agent ? agentActivityById[pane.agent.id] ?? pane.state : pane.state),
              }}
              timelineBlocks={timelineBlocks[pane.roleKey] ?? []}
              visual={pane.agent ? agentVisualsById[pane.agent.id] : undefined}
            />
          ))}
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/60 bg-zinc-900/30 p-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2">
          <Terminal className="h-4 w-4 shrink-0 text-zinc-500" />
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
            {sanitizeTmuxWorkbenchText(boardNotice)}
          </p>
          <span className="hidden text-[10px] text-zinc-500 sm:inline">
            세션 {activeSessionId.slice(-12)}
          </span>
        </div>
      </footer>
    </section>
  );
}

type TmuxSwarmDifficulty = TmuxWorkbenchDifficulty;

function createTmuxPanes(
  roleAgent: (role: WorkbenchAgent["role"]) => WorkbenchAgent | undefined,
  recommendation: ReturnType<typeof createTmuxSwarmRecommendation>,
): TmuxPaneDefinition[] {
  return [
    {
      id: "pane-0",
      roleKey: "discussion",
      title: "논의와 계획",
      role: "요구사항 / 제품 / 아키텍처 논의",
      state: "chat active",
      agent: roleAgent("orchestrator"),
      signal: "사용자와 먼저 논의하고, 바로 실행하지 않습니다.",
    },
    {
      id: "pane-1",
      roleKey: "orchestrator",
      title: "오케스트레이터 지휘",
      role: "작업 분해 / 역할 배정 / 지휘",
      state: "dispatch gated",
      agent: roleAgent("orchestrator"),
      signal: "실제 tmux send는 승인과 서버 env gate 이후에만 열립니다.",
    },
    {
      id: "pane-2",
      roleKey: "status",
      title: "상태 감시",
      role: "진행 로그 / 테스트 / stuck run 감시",
      state: "watch only",
      signal: "Event Storage에 기록 가능한 run intent와 capture 상태를 봅니다.",
    },
    {
      id: "pane-3",
      roleKey: "code",
      title: "코드 작업자",
      role: "핵심 로직 / 리팩터링 / 복잡 구현",
      state: "idle",
      agent: roleAgent("builder"),
      signal: "Coding Packet이 생기면 core logic 작업 후보가 됩니다.",
    },
    {
      id: "pane-4",
      roleKey: "architect",
      title: "설계 작업자",
      role: "protocol / Event Storage / 타입 경계",
      state: "ready",
      agent: roleAgent("architect"),
      signal: "ExecutionSlot / AgentSession / run event 타입 경계를 담당합니다.",
    },
    {
      id: "pane-5",
      roleKey: "frontend",
      title: "프론트 작업자",
      role: "desktop UI / Workbench / Execution Slot",
      state: "active",
      signal: "현재 tmux workbench와 approval UX wiring을 담당합니다.",
    },
    {
      id: "pane-6",
      roleKey: "backend",
      title: "백엔드 작업자",
      role: "server / sync / DGX 연결 지점",
      state: "idle",
      signal: "DGX-02가 main server입니다. DGX-01은 locked 상태로 둡니다.",
    },
    {
      id: "pane-7",
      roleKey: "qa",
      title: "검증과 보안",
      role: "테스트 / 권한 / redaction / 회귀검사",
      state: "guarding",
      agent: roleAgent("reviewer") ?? roleAgent("verifier"),
      signal: "Secret, command, approval, event 기록 회귀를 우선 확인합니다.",
    },
    {
      id: "pane-8",
      roleKey: "research",
      title: "조사 작업자",
      role: "외부 문서 / repo / 레퍼런스 조사",
      state: recommendation.recommendedRoles.includes("research") ? "recommended" : "standby",
      agent: roleAgent("skeptic"),
      signal: "새 API나 라이브러리 검토가 필요할 때만 투입합니다.",
    },
    {
      id: "pane-9",
      roleKey: "memory",
      title: "기억 관리자",
      role: "Memento recall / 결정 기록 / handoff 정리",
      state: recommendation.recommendedRoles.includes("memory") ? "recommended" : "standby",
      agent: roleAgent("memory_curator"),
      signal: "장기 프로젝트, 백업, handoff가 걸리면 기억 정리를 전담합니다.",
    },
  ];
}

function createTmuxSwarmRecommendation(packet: CodingPacket, messages: ConversationMessage[]) {
  const text = [
    packet.goal,
    ...packet.context,
    ...packet.decisions,
    ...packet.constraints,
    ...packet.implementationPlan,
    ...packet.verificationPlan,
    ...messages.slice(-6).map((message) => message.content),
  ]
    .join(" ")
    .toLowerCase();
  const keywordWeights: Array<[string, number]> = [
    ["tmux", 2],
    ["dgx", 2],
    ["server", 1],
    ["permission", 2],
    ["redaction", 2],
    ["보안", 2],
    ["백업", 1],
    ["provider", 1],
    ["프로바이더", 1],
    ["memory", 1],
    ["memento", 1],
    ["event", 1],
    ["테스트", 1],
    ["끝까지", 2],
    ["완성", 2],
  ];
  const score =
    2 +
    packet.implementationPlan.length +
    packet.verificationPlan.length +
    packet.constraints.length +
    keywordWeights.reduce((total, [keyword, weight]) => total + (text.includes(keyword) ? weight : 0), 0);
  const difficulty: TmuxSwarmDifficulty =
    score >= 15 ? "critical" : score >= 10 ? "complex" : score >= 6 ? "standard" : "light";
  const recommendedCount = difficulty === "critical" ? 10 : difficulty === "complex" ? 8 : difficulty === "standard" ? 6 : 4;
  const baseRoles: TmuxPaneRole[] = ["discussion", "orchestrator", "status", "architect"];
  const byDifficulty: Record<TmuxSwarmDifficulty, TmuxPaneRole[]> = {
    light: ["frontend"],
    standard: ["frontend", "backend", "qa"],
    complex: ["code", "architect", "frontend", "backend", "qa"],
    critical: ["code", "architect", "frontend", "backend", "qa", "research", "memory"],
  };
  const recommendedRoles = Array.from(new Set<TmuxPaneRole>([...baseRoles, ...byDifficulty[difficulty]])).slice(
    0,
    recommendedCount,
  );

  return {
    difficulty,
    recommendedCount,
    recommendedRoles,
    score,
    summary:
      difficulty === "critical"
        ? "서버, 권한, 기억, 백업, 실행이 함께 걸린 작업이라 10명 구성이 안전합니다."
        : difficulty === "complex"
          ? "프론트와 백엔드, 검증이 동시에 필요한 복합 작업이라 8명 구성을 추천합니다."
          : difficulty === "standard"
            ? "구현과 검증이 함께 필요한 일반 작업이라 6명 구성을 추천합니다."
            : "작은 수정이나 검토 중심 작업이라 4명 구성으로 충분합니다.",
  };
}

function defaultTmuxCommandForRole(role: TmuxPaneRole) {
  const prompts: Record<TmuxPaneRole, string> = {
    discussion: "echo 'Discuss requirement first. No direct execution.'",
    orchestrator: "codex 'Break down the current request into role-based tasks. Do not execute commands.'",
    status: "git status --short",
    code: "codex 'Inspect the current Coding Packet and propose implementation steps.'",
    architect: "codex 'Review protocol and event boundaries for the current task.'",
    frontend: "codex 'Review the desktop tmux workbench UI and propose the next UI patch.'",
    backend: "codex 'Review the server tmux gate and identify missing safety checks.'",
    qa: "corepack pnpm typecheck && corepack pnpm test",
    research: "codex 'Collect references needed for the current implementation decision.'",
    memory: "codex 'Extract durable decisions from the current session for Memento.'",
  };
  return prompts[role];
}
