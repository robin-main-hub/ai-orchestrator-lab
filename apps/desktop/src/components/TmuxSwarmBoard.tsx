import { LockKeyhole } from "lucide-react";
import type { CodingPacket, ConversationMessage } from "@ai-orchestrator/protocol";
import { messageLabel } from "../lib/uiLabels";
import type { AgentActivityStatus, AgentVisualSettings, WindowAuditItem, WorkbenchAgent } from "../types";
import { TmuxPaneCard } from "./TmuxPaneCard";
import { WindowChecklist } from "./WindowChecklist";
export function TmuxSwarmBoard({
  activeSessionId,
  agentActivityById,
  agentVisualsById,
  agents,
  messages,
  packet,
}: {
  activeSessionId: string;
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  agents: WorkbenchAgent[];
  messages: ConversationMessage[];
  packet: CodingPacket;
}) {
  const recentMessages = messages.slice(-6);
  const roleAgent = (role: WorkbenchAgent["role"]) => agents.find((agent) => agent.role === role);
  const recommendation = createTmuxSwarmRecommendation(packet, messages);
  const panes = [
    {
      id: "pane-0",
      roleKey: "discussion",
      title: "Discussion & Planning",
      role: "요구사항 / 제품 / 아키텍처 논의",
      state: "chat active",
      agent: roleAgent("orchestrator"),
      signal: "사용자와 먼저 논의하고, 바로 실행하지 않는다.",
    },
    {
      id: "pane-1",
      roleKey: "orchestrator",
      title: "Orchestrator Control",
      role: "작업 분해 / 역할 배정 / 지휘",
      state: "dispatch locked",
      agent: roleAgent("orchestrator"),
      signal: "실제 tmux send는 Permission Matrix 안정화 전까지 잠김.",
    },
    {
      id: "pane-2",
      roleKey: "status",
      title: "Status & Monitor",
      role: "진행 로그 / 테스트 / stuck run 감시",
      state: "watch only",
      signal: "Event Storage에 기록 가능한 run intent만 준비.",
    },
    {
      id: "pane-3",
      roleKey: "code",
      title: "Agent - Code Expert",
      role: "핵심 로직 / 리팩터링 / 복잡 구현",
      state: "idle",
      agent: roleAgent("builder"),
      signal: "Coding Packet이 생기면 core logic 작업 후보.",
    },
    {
      id: "pane-4",
      roleKey: "architect",
      title: "Agent - Architect",
      role: "protocol / Event Storage / 타입 경계",
      state: "ready",
      agent: roleAgent("architect"),
      signal: "ExecutionSlot / AgentSession / run event 타입 경계 담당.",
    },
    {
      id: "pane-5",
      roleKey: "frontend",
      title: "Agent - Frontend Dev",
      role: "desktop UI / Workbench / Execution Slot",
      state: "active",
      signal: "현재 tmux workbench preview를 담당.",
    },
    {
      id: "pane-6",
      roleKey: "backend",
      title: "Agent - Backend Dev",
      role: "server / sync / DGX 연결 지점",
      state: "idle",
      signal: "DGX-02만 대상. DGX-01은 잠금.",
    },
    {
      id: "pane-7",
      roleKey: "qa",
      title: "Agent - QA & Security",
      role: "테스트 / 권한 / redaction / 회귀검사",
      state: "guarding",
      agent: roleAgent("reviewer") ?? roleAgent("verifier"),
      signal: "Gemini CLI 연결 금지. Secret/command redaction 우선.",
    },
    {
      id: "pane-8",
      roleKey: "research",
      title: "Agent - Research Scout",
      role: "외부 문서 / repo / 레퍼런스 조사",
      state: recommendation.recommendedRoles.includes("research") ? "recommended" : "standby",
      agent: roleAgent("skeptic"),
      signal: "새 API/라이브러리/외부 설계 검토가 필요할 때만 투입.",
    },
    {
      id: "pane-9",
      roleKey: "memory",
      title: "Agent - Memory Curator",
      role: "Memento recall / 결정 기록 / handoff 정리",
      state: recommendation.recommendedRoles.includes("memory") ? "recommended" : "standby",
      agent: roleAgent("memory_curator"),
      signal: "장기 프로젝트, 백업, handoff가 걸리면 기억 정리 전담.",
    },
  ];
  const visiblePanes = panes.slice(0, recommendation.recommendedCount);
  const auditItems: WindowAuditItem[] = [
    {
      id: "layout",
      label: "tmux 화면",
      status: "ready",
      detail: "tmux 모드에서는 좌우 rail과 하단 dock을 밀고 중앙 workbench를 전체 화면으로 씁니다.",
    },
    {
      id: "pane-count",
      label: "4-10 pane",
      status: "ready",
      detail: `오케스트레이터가 난이도 ${recommendation.difficulty}로 보고 ${recommendation.recommendedCount}개 pane을 추천했습니다.`,
    },
    {
      id: "scripts",
      label: "실제 tmux 스크립트",
      status: "partial",
      detail: "scripts/setup-agent-swarm.sh와 swarm-send.sh는 준비됐고, 실제 dispatch는 permission 안정화 뒤 켭니다.",
    },
    {
      id: "gemini",
      label: "Gemini 연결",
      status: "blocked",
      detail: "Gemini CLI는 agy -p 설정 전까지 의도적으로 연결 금지 상태입니다.",
    },
  ];

  return (
    <section className="tmux-panel" aria-label="Role-Based Tmux Agent Swarm">
      <header className="tmux-header">
        <div>
          <span>Future Runtime Preview</span>
          <strong>ai-swarm</strong>
          <p>왼쪽은 지휘자 대화, 오른쪽은 agent pane별 상태와 중요 메시지를 본다.</p>
        </div>
        <div className="tmux-gate">
          <LockKeyhole size={15} />
          <span>Implementation Gate</span>
          <strong>이벤트 저장소 / Permission / Redaction 먼저</strong>
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
      <WindowChecklist items={auditItems} title="tmux 창 점검" />
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
                key={pane.id}
                pane={{
                  ...pane,
                  state: pane.agent ? (agentActivityById[pane.agent.id] ?? pane.state) : pane.state,
                }}
                visual={pane.agent ? agentVisualsById[pane.agent.id] : undefined}
              />
            ))}
          </div>
        </section>
      </div>
      <div className="tmux-decision-row">
        <div>
          <span>이벤트 저장소 mapping</span>
          <strong>run intent / pane status 준비</strong>
        </div>
        <div>
          <span>Permission + Redaction</span>
          <strong>실행 전 승인, 기록 전 제거</strong>
        </div>
        <div>
          <span>Gemini CLI</span>
          <strong>연결 금지 - CLI 설정 후 결정</strong>
        </div>
        <div>
          <span>첫 실제 tmux runner</span>
          <strong>미정</strong>
        </div>
        <div>
          <span>Agent profile assets</span>
          <strong>data URL 저장 / 경로 의존 없음</strong>
        </div>
      </div>
      <footer className="tmux-footer">
        <span>tmux session: ai-swarm</span>
        <span>runtime backend: local tmux / 4-10 panes</span>
        <span>real command dispatch: disabled</span>
      </footer>
    </section>
  );
}

type TmuxSwarmDifficulty = "light" | "standard" | "complex" | "critical";

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
    ["전부", 2],
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
  const baseRoles = ["discussion", "orchestrator", "status", "architect"];
  const byDifficulty: Record<TmuxSwarmDifficulty, string[]> = {
    light: ["frontend"],
    standard: ["frontend", "backend", "qa"],
    complex: ["code", "architect", "frontend", "backend", "qa"],
    critical: ["code", "architect", "frontend", "backend", "qa", "research", "memory"],
  };
  const recommendedRoles = Array.from(new Set([...baseRoles, ...byDifficulty[difficulty]])).slice(0, recommendedCount);

  return {
    difficulty,
    recommendedCount,
    recommendedRoles,
    score,
    summary:
      difficulty === "critical"
        ? "서버/권한/기억/백업/실행이 함께 걸린 작업이라 10인 편성이 안전하다."
        : difficulty === "complex"
          ? "프론트와 백엔드, 검증이 동시에 필요한 복합 작업이라 8인 편성을 추천한다."
          : difficulty === "standard"
            ? "구현과 검증이 함께 필요한 일반 작업이라 6인 편성을 추천한다."
            : "작은 수정이나 검토 중심 작업이라 4인 편성으로 충분하다.",
  };
}

