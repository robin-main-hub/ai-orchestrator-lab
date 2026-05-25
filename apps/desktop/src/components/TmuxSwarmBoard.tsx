import { useState } from "react";
import { LockKeyhole } from "lucide-react";
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
import type { AgentActivityStatus, AgentVisualSettings, WorkbenchAgent } from "../types";
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
}: {
  activeSessionId: string;
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  agents: WorkbenchAgent[];
  messages: ConversationMessage[];
  onApprovalQueued?: (input: TmuxApprovalQueuedInput) => void;
  packet: CodingPacket;
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
    <section className="tmux-panel" aria-label="Role-Based Tmux Agent Swarm">
      <header className="tmux-header">
        <div>
          <span>Runtime Workbench</span>
          <strong>ai-swarm</strong>
          <p>왼쪽은 지휘자 대화, 오른쪽은 agent pane별 상태와 중요 메시지를 봅니다.</p>
        </div>
        <div className="tmux-gate">
          <LockKeyhole size={15} />
          <span>Implementation Gate</span>
          <strong>Event Storage / Permission / Redaction 먼저</strong>
        </div>
      </header>
      <section className="tmux-recommendation-panel" aria-label="Orchestrator swarm recommendation">
        <div>
          <span>Orchestrator 추천 배치</span>
          <strong>{recommendation.recommendedCount}명 / 최대 10명</strong>
          <p>{recommendation.summary}</p>
        </div>
        <div className="tmux-recommendation-meter">
          <span>난이도</span>
          <strong>{recommendation.difficulty}</strong>
          <em>score {recommendation.score}</em>
        </div>
        <div className="tmux-role-chip-list">
          {recommendation.recommendedRoles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>
      </section>
      <div className="tmux-workbench">
        <section className="tmux-operator-chat">
          <header>
            <span>Operator Chat</span>
            <strong>{activeSessionId}</strong>
          </header>
          <div className="tmux-chat-stream">
            {recentMessages.map((message) => (
              <article className={message.role === "user" ? "user" : "assistant"} key={message.id}>
                <span>{message.role === "user" ? "사용자" : messageLabel(message)}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
          <div className="tmux-chat-note">
            <span>main chat stays here</span>
            <strong>small text / monitor first</strong>
          </div>
        </section>
        <section className="tmux-agent-board">
          <header>
            <span>Agent Work Status</span>
            <strong>{recommendation.recommendedCount} panes / max 10</strong>
          </header>
          <div className="tmux-agent-grid">
            {visiblePanes.map((pane) => (
              <TmuxPaneCard
                busy={busyByRole[pane.roleKey]}
                commandDraft={commandDraftByRole[pane.roleKey] ?? defaultTmuxCommandForRole(pane.roleKey)}
                key={pane.id}
                lastOutput={paneOutputByRole[pane.roleKey]}
                onCapture={() => void handleCapturePane(pane)}
                onCommandDraftChange={(value) => updateCommandDraft(pane.roleKey, value)}
                onDispatch={() => void handleDispatchPane(pane)}
                pane={{
                  ...pane,
                  state: runtimeStatusByRole[pane.roleKey] ?? (pane.agent ? (agentActivityById[pane.agent.id] ?? pane.state) : pane.state),
                }}
                timelineBlocks={timelineBlocksByRole[pane.roleKey] ?? []}
                visual={pane.agent ? agentVisualsById[pane.agent.id] : undefined}
              />
            ))}
          </div>
        </section>
      </div>
      <div className="tmux-decision-row">
        <div>
          <span>Event Storage mapping</span>
          <strong>intent / capture events ready</strong>
        </div>
        <div>
          <span>Permission + Redaction</span>
          <strong>승인 전 기록, 저장 전 제거</strong>
        </div>
        <div>
          <span>현재 서버 응답</span>
          <strong>{boardNotice}</strong>
        </div>
      </div>
      <footer className="tmux-footer">
        <span>tmux session: ai-swarm</span>
        <span>runtime backend: DGX-02 gate / 4-10 panes</span>
        <span>send-keys: server env gate + approval required</span>
      </footer>
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
