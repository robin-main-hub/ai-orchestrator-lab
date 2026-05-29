import { useState } from "react";
import { LockKeyhole, MessageSquare, GitBranch, Terminal, Lock } from "lucide-react";
import type {
  ApprovalRequest,
  CodingPacket,
  ConversationMessage,
  TerminalTimelineBlock,
  TmuxPaneRole,
} from "@ai-orchestrator/protocol";
import { messageLabel } from "../lib/uiLabels";
import {
  requestTmuxCapture,
  requestTmuxDispatch,
  type DesktopTmuxDispatchRequest,
} from "../runtime/stage33TmuxServer";
import { ClusterLocksDashboard } from "./ClusterLocksDashboard";
import type { AgentActivityStatus, AgentVisualSettings, WorkbenchAgent, CenterMode } from "../types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/ui/status-badge";
import { TmuxPaneCard } from "./TmuxPaneCard";
import { makeSyntheticBlock } from "./TmuxPaneTimeline";

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
  mode,
  onChangeMode,
}: {
  activeSessionId: string;
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  agents: WorkbenchAgent[];
  messages: ConversationMessage[];
  onApprovalQueued?: (input: TmuxApprovalQueuedInput) => void;
  packet: CodingPacket;
  mode: CenterMode;
  onChangeMode: (mode: CenterMode) => void;
}) {
  const recentMessages = messages.slice(-6);
  const roleAgent = (role: WorkbenchAgent["role"]) => agents.find((agent) => agent.role === role);
  const recommendation = createTmuxSwarmRecommendation(packet, messages);
  const [commandDraftByRole, setCommandDraftByRole] = useState<Record<string, string>>({});
  const [runtimeStatusByRole, setRuntimeStatusByRole] = useState<Record<string, string>>({});
  const [paneOutputByRole, setPaneOutputByRole] = useState<Record<string, string>>({});
  const [busyByRole, setBusyByRole] = useState<Record<string, PaneBusyState | undefined>>({});
  const [timelineBlocksByRole, setTimelineBlocksByRole] = useState<
    Record<string, TerminalTimelineBlock[]>
  >({});
  const [boardNotice, setBoardNotice] = useState(
    "DGX-02 tmux 게이트 준비됨. 실제 send-keys는 서버 env gate와 승인 이후에만 실행됩니다.",
  );
  const [showLocksDashboard, setShowLocksDashboard] = useState(false);
  const panes = createTmuxPanes(roleAgent, recommendation);
  const visiblePanes = panes.slice(0, recommendation.recommendedCount);

  function appendBlock(roleKey: TmuxPaneRole, block: TerminalTimelineBlock) {
    setTimelineBlocksByRole((current) => ({
      ...current,
      [roleKey]: [...(current[roleKey] ?? []), block],
    }));
  }

  function updateCommandDraft(role: TmuxPaneRole, value: string) {
    setCommandDraftByRole((current) => ({
      ...current,
      [role]: value,
    }));
  }

  async function handleCapturePane(pane: TmuxPaneDefinition) {
    setBusyByRole((current) => ({ ...current, [pane.roleKey]: "capture" }));
    setRuntimeStatusByRole((current) => ({ ...current, [pane.roleKey]: "capturing" }));
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
      setRuntimeStatusByRole((current) => ({ ...current, [pane.roleKey]: result.status }));
      setPaneOutputByRole((current) => ({
        ...current,
        [pane.roleKey]: result.payload?.outputPreview || result.reason,
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
      setBoardNotice(`${pane.title}: ${result.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeStatusByRole((current) => ({ ...current, [pane.roleKey]: "capture failed" }));
      setPaneOutputByRole((current) => ({ ...current, [pane.roleKey]: message }));
      setBoardNotice(`${pane.title}: capture 실패 - ${message}`);
    } finally {
      setBusyByRole((current) => ({ ...current, [pane.roleKey]: undefined }));
    }
  }

  async function handleDispatchPane(pane: TmuxPaneDefinition) {
    const commandPreview = (commandDraftByRole[pane.roleKey] || defaultTmuxCommandForRole(pane.roleKey)).trim();
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
    setRuntimeStatusByRole((current) => ({ ...current, [pane.roleKey]: "dispatching" }));
    try {
      const result = await requestTmuxDispatch({ request });
      setRuntimeStatusByRole((current) => ({ ...current, [pane.roleKey]: result.dispatch.status }));
      setPaneOutputByRole((current) => ({
        ...current,
        [pane.roleKey]: result.approval
          ? `승인 대기: ${result.approval.reason}`
          : `${result.dispatch.status}: ${result.dispatch.reason}`,
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
      setBoardNotice(`${pane.title}: ${result.dispatch.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeStatusByRole((current) => ({ ...current, [pane.roleKey]: "dispatch failed" }));
      setPaneOutputByRole((current) => ({ ...current, [pane.roleKey]: message }));
      setBoardNotice(`${pane.title}: dispatch 실패 - ${message}`);
    } finally {
      setBusyByRole((current) => ({ ...current, [pane.roleKey]: undefined }));
    }
  }

  return (
    <section
      aria-label="Role-Based Tmux Agent Swarm"
      className="flex h-full flex-col bg-background"
    >
      {/* ── Top header (v0 h-10) ───────────────────────────────── */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card/30 px-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">Runtime Workbench</span>
          <span className="text-xs font-medium text-foreground">ai-swarm</span>
          <span className="text-[10px] text-muted-foreground">
            {recommendation.recommendedCount} / {recommendation.recommendedCount === 10 ? "10" : "max 10"}
          </span>
           <StatusBadge variant="warning" size="sm">
             <LockKeyhole className="h-2.5 w-2.5" />
             gate
           </StatusBadge>
          <button
            onClick={() => setShowLocksDashboard(true)}
            className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-semibold rounded bg-muted/40 hover:bg-muted/80 border border-border/15 transition-all text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Lock className="h-2.5 w-2.5 text-primary" />
            분산 락 모니터
          </button>
        </div>

        {/* Center: Mode Switching tabs (renders even in tmux fullscreen header) */}
        <div className="flex items-center gap-0.5 bg-muted/20 p-0.5 rounded-md border border-border/30 h-8 select-none">
          <button
            className={cn(
              "inline-flex items-center justify-center h-7 gap-1.5 px-3 text-[11px] font-medium transition-all rounded-sm border border-transparent cursor-pointer",
              mode === "conversation"
                ? "text-foreground bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-transparent"
            )}
            onClick={() => onChangeMode("conversation")}
            type="button"
          >
            <MessageSquare className="h-3 w-3" />
            Conversation
          </button>
          <button
            className={cn(
              "inline-flex items-center justify-center h-7 gap-1.5 px-3 text-[11px] font-medium transition-all rounded-sm border border-transparent cursor-pointer",
              mode === "debate"
                ? "text-foreground bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-transparent"
            )}
            onClick={() => onChangeMode("debate")}
            type="button"
          >
            <GitBranch className="h-3 w-3" />
            Debate
          </button>
          <button
            className={cn(
              "inline-flex items-center justify-center h-7 gap-1.5 px-3 text-[11px] font-medium transition-all rounded-sm border border-transparent cursor-pointer",
              mode === "tmux"
                ? "text-foreground bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-transparent"
            )}
            onClick={() => onChangeMode("tmux")}
            type="button"
          >
            <Terminal className="h-3 w-3" />
            Tmux
          </button>
        </div>

        <span className="text-xs text-muted-foreground">
          {visiblePanes.length} panes · 난이도 {recommendation.difficulty} · score{" "}
          {recommendation.score}
        </span>
      </header>

      {/* ── Recommendation strip ───────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/20 px-4 py-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Orchestrator 추천
          </div>
          <p className="truncate text-xs text-foreground">{recommendation.summary}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          {recommendation.recommendedRoles.map((role) => (
             <StatusBadge variant="muted" size="sm" key={role}>
               {role}
             </StatusBadge>
          ))}
        </div>
      </div>

      {/* ── Main: operator chat (left) + pane grid (right) ─────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Operator Chat */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border bg-card/20">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-xs font-medium text-foreground">Operator Chat</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {activeSessionId.slice(-12)}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {recentMessages.map((message) => (
              <div
                className="rounded-lg border border-border bg-card p-3"
                key={message.id}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      message.role === "user"
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {message.role === "user" ? "사용자" : messageLabel(message)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-foreground">{message.content}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-4 py-2 text-[10px]">
            <div className="text-muted-foreground">tmux session: ai-swarm</div>
            <div className="text-muted-foreground">
              runtime backend: DGX-02 gate / 4-10 panes
            </div>
            <div className="text-muted-foreground">
              send-keys: server env gate + approval required
            </div>
          </div>
        </div>

        {/* Agent Pane Grid */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-xs font-medium text-foreground">
              Agent Work Status
            </span>
            <span className="text-[10px] text-muted-foreground">
              {recommendation.recommendedCount} panes / max 10
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visiblePanes.map((pane) => (
                <TmuxPaneCard
                  busy={busyByRole[pane.roleKey]}
                  commandDraft={
                    commandDraftByRole[pane.roleKey] ??
                    defaultTmuxCommandForRole(pane.roleKey)
                  }
                  key={pane.id}
                  lastOutput={paneOutputByRole[pane.roleKey]}
                  onCapture={() => void handleCapturePane(pane)}
                  onCommandDraftChange={(value) =>
                    updateCommandDraft(pane.roleKey, value)
                  }
                  onDispatch={() => void handleDispatchPane(pane)}
                  pane={{
                    ...pane,
                    state:
                      runtimeStatusByRole[pane.roleKey] ??
                      (pane.agent
                        ? agentActivityById[pane.agent.id] ?? pane.state
                        : pane.state),
                  }}
                  timelineBlocks={timelineBlocksByRole[pane.roleKey] ?? []}
                  visual={
                    pane.agent ? agentVisualsById[pane.agent.id] : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom status bar (v0 h-8) ─────────────────────────── */}
      <footer className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-card/30 px-4 text-[10px]">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">Event Storage</span>
          <span className="text-foreground">intent / capture events ready</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">Permission + Redaction</span>
          <span className="text-foreground">승인 전 기록, 저장 전 제거</span>
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <span className="text-muted-foreground">서버 응답</span>
          <span className="truncate text-foreground">{boardNotice}</span>
        </div>
      </footer>
      <ClusterLocksDashboard open={showLocksDashboard} onClose={() => setShowLocksDashboard(false)} />
    </section>
  );
}

type TmuxSwarmDifficulty = "light" | "standard" | "complex" | "critical";

function createTmuxPanes(
  roleAgent: (role: WorkbenchAgent["role"]) => WorkbenchAgent | undefined,
  recommendation: ReturnType<typeof createTmuxSwarmRecommendation>,
): TmuxPaneDefinition[] {
  return [
    {
      id: "pane-0",
      roleKey: "discussion",
      title: "Discussion & Planning",
      role: "요구사항 / 제품 / 아키텍처 논의",
      state: "chat active",
      agent: roleAgent("orchestrator"),
      signal: "사용자와 먼저 논의하고, 바로 실행하지 않습니다.",
    },
    {
      id: "pane-1",
      roleKey: "orchestrator",
      title: "Orchestrator Control",
      role: "작업 분해 / 역할 배정 / 지휘",
      state: "dispatch gated",
      agent: roleAgent("orchestrator"),
      signal: "실제 tmux send는 승인과 서버 env gate 이후에만 열립니다.",
    },
    {
      id: "pane-2",
      roleKey: "status",
      title: "Status & Monitor",
      role: "진행 로그 / 테스트 / stuck run 감시",
      state: "watch only",
      signal: "Event Storage에 기록 가능한 run intent와 capture 상태를 봅니다.",
    },
    {
      id: "pane-3",
      roleKey: "code",
      title: "Agent - Code Expert",
      role: "핵심 로직 / 리팩터링 / 복잡 구현",
      state: "idle",
      agent: roleAgent("builder"),
      signal: "Coding Packet이 생기면 core logic 작업 후보가 됩니다.",
    },
    {
      id: "pane-4",
      roleKey: "architect",
      title: "Agent - Architect",
      role: "protocol / Event Storage / 타입 경계",
      state: "ready",
      agent: roleAgent("architect"),
      signal: "ExecutionSlot / AgentSession / run event 타입 경계를 담당합니다.",
    },
    {
      id: "pane-5",
      roleKey: "frontend",
      title: "Agent - Frontend Dev",
      role: "desktop UI / Workbench / Execution Slot",
      state: "active",
      signal: "현재 tmux workbench와 approval UX wiring을 담당합니다.",
    },
    {
      id: "pane-6",
      roleKey: "backend",
      title: "Agent - Backend Dev",
      role: "server / sync / DGX 연결 지점",
      state: "idle",
      signal: "DGX-02가 main server입니다. DGX-01은 locked 상태로 둡니다.",
    },
    {
      id: "pane-7",
      roleKey: "qa",
      title: "Agent - QA & Security",
      role: "테스트 / 권한 / redaction / 회귀검사",
      state: "guarding",
      agent: roleAgent("reviewer") ?? roleAgent("verifier"),
      signal: "Secret, command, approval, event 기록 회귀를 우선 확인합니다.",
    },
    {
      id: "pane-8",
      roleKey: "research",
      title: "Agent - Research Scout",
      role: "외부 문서 / repo / 레퍼런스 조사",
      state: recommendation.recommendedRoles.includes("research") ? "recommended" : "standby",
      agent: roleAgent("skeptic"),
      signal: "새 API나 라이브러리 검토가 필요할 때만 투입합니다.",
    },
    {
      id: "pane-9",
      roleKey: "memory",
      title: "Agent - Memory Curator",
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
