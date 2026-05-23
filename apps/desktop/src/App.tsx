import { useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Database,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Play,
  RadioTower,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
} from "lucide-react";
import {
  createCodingPacketDraft,
  createDebateRounds,
  defaultAgentProfiles,
  type DebateContext,
} from "@ai-orchestrator/agents";
import { MockProviderAdapter, createProviderProfile } from "@ai-orchestrator/providers";
import type {
  BackupProjection,
  CodingPacket,
  ProviderProfile,
  RuntimeSnapshot,
  TerminalSlot,
} from "@ai-orchestrator/protocol";

type CenterMode = "conversation" | "debate";

const now = new Date("2026-05-24T00:20:00.000+09:00").toISOString();

const runtimeSnapshot: RuntimeSnapshot = {
  status: "degraded",
  dgxStatus: "offline",
  localModelStatus: "online",
  memorySyncStatus: "syncing",
  runtimeNodes: [
    {
      id: "dgx-01",
      label: "DGX-01",
      role: "compute",
      status: "offline",
      isPrimary: false,
      endpoint: "dgx-01",
      models: ["연결 대기"],
    },
    {
      id: "dgx-02",
      label: "DGX-02",
      role: "main_server",
      status: "offline",
      isPrimary: true,
      endpoint: "dgx-02",
      models: ["메인 서버", "원격 실행 대기"],
    },
  ],
  localModels: [
    {
      id: "mock-orchestrator",
      name: "mock-orchestrator",
      runner: "mock",
      status: "online",
      contextWindow: 128_000,
    },
  ],
  syncTopology: {
    authorityNodeId: "dgx-02",
    authorityLabel: "DGX-02",
    eventStoreMode: "server_authoritative_with_local_outbox",
    offlineWritePolicy: "append_local_outbox",
    conflictPolicy: "server_revision_lww_with_conflict_events",
    clients: [
      {
        id: "client_macbook",
        label: "MacBook",
        kind: "macbook",
        status: "online",
        syncRole: "client_replica",
        localStore: "sqlite",
        outboxCount: 0,
        lastSeenAt: now,
      },
      {
        id: "client_home_pc",
        label: "Home PC",
        kind: "desktop_pc",
        status: "degraded",
        syncRole: "client_replica",
        localStore: "sqlite",
        outboxCount: 2,
        lastSeenAt: now,
      },
      {
        id: "dgx-02",
        label: "DGX-02",
        kind: "server",
        status: "offline",
        syncRole: "authority",
        localStore: "sqlite",
        outboxCount: 0,
      },
    ],
  },
  activeProviderProfileId: "provider_mock_local",
  recentError: "dgx-02 heartbeat pending",
  updatedAt: now,
};

const providerProfiles: ProviderProfile[] = [
  new MockProviderAdapter().profile,
  createProviderProfile({
    id: "provider_openai_compat",
    name: "OpenAI 호환 프로파일",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    rawSecret: "sk-placeholder-session-key",
    defaultModel: "gpt-5.5-pro",
    tags: ["검증", "강한 모델"],
    trustLevel: "trusted",
  }),
  createProviderProfile({
    id: "provider_reseller_custom",
    name: "리셀러 호환 API",
    kind: "custom",
    baseUrl: "https://api.apikey.fun",
    rawSecret: "sk-reseller-placeholder-42f0",
    defaultModel: "claude-code-compatible",
    tags: ["임시", "주의"],
    trustLevel: "untrusted",
  }),
];

const debateContext: DebateContext = {
  sessionId: "session_desktop_001",
  problem: "AI Orchestrator Lab 초기 모노레포 골격을 구현한다.",
  conversationSummary: "문서화된 제품 방향을 유지하면서 protocol-first 구조와 데스크톱 작업판을 먼저 만든다.",
  constraints: ["실제 모델 호출 제외", "터미널 실행 제외", "API 키 원문 저장 금지"],
  openQuestions: ["Tauri 전환 시점", "DGX sync protocol 세부안"],
  userPreferences: ["한국어 UI", "작업실 같은 어두운 패널", "토론 결과는 Coding Packet으로 연결"],
  memoryTraceIds: ["trace_memory_001", "trace_review_003"],
};

const codingPacket: CodingPacket = createCodingPacketDraft(debateContext);
const debateRounds = createDebateRounds("debate_initial_skeleton");

const terminalSlots: TerminalSlot[] = [
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

const backupProjections: BackupProjection[] = [
  {
    id: "backup_obsidian",
    sessionId: "session_desktop_001",
    target: "obsidian",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_notion",
    sessionId: "session_desktop_001",
    target: "notion",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_mobile",
    sessionId: "session_desktop_001",
    target: "mobile",
    status: "failed",
    redactionApplied: true,
  },
];

const navItems = [
  { label: "세션", icon: MessageSquare, active: true },
  { label: "프로젝트", icon: LayoutDashboard, active: false },
  { label: "프로바이더", icon: KeyRound, active: false },
  { label: "채널", icon: RadioTower, active: false },
  { label: "백업", icon: Archive, active: false },
];

export function App() {
  const [mode, setMode] = useState<CenterMode>("conversation");
  const activeProvider = useMemo(
    () => providerProfiles.find((profile) => profile.id === runtimeSnapshot.activeProviderProfileId),
    [],
  );

  return (
    <div className="app-shell">
      <RuntimeStatusBar snapshot={runtimeSnapshot} providerName={activeProvider?.name ?? "미선택"} />
      <main className="workspace-grid">
        <aside className="left-rail" aria-label="오케스트레이터 네비게이션">
          <div className="brand-block">
            <div className="brand-mark">
              <Brain size={22} />
            </div>
            <div>
              <strong>AI Orchestrator Lab</strong>
              <span>desktop command room</span>
            </div>
          </div>

          <nav className="nav-stack">
            {navItems.map((item) => (
              <button className={`nav-item ${item.active ? "active" : ""}`} key={item.label} type="button">
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.active ? <ChevronRight size={16} /> : null}
              </button>
            ))}
          </nav>

          <section className="mini-panel">
            <header>
              <Server size={16} />
              <span>Runtime</span>
            </header>
            <div className="runtime-node-list">
              {runtimeSnapshot.runtimeNodes.map((node) => (
                <div className="runtime-node" key={node.id}>
                  <div>
                    <strong>{node.label}</strong>
                    {node.isPrimary ? <span>main server</span> : <span>{node.role}</span>}
                  </div>
                  <em className={statusTone(node.status)}>{node.status}</em>
                </div>
              ))}
            </div>
            <div className="local-model-list">
              <span>Local Models</span>
              {runtimeSnapshot.localModels.map((model) => (
                <div className="local-model" key={model.id}>
                  <strong>{model.name}</strong>
                  <em className={statusTone(model.status)}>{model.runner}</em>
                </div>
              ))}
            </div>
            <div className="memory-sync-note">
              <strong>Memory Sync</strong>
              <span>Memento/장기기억과 로컬 캐시 동기화 상태</span>
              <em className={statusTone(runtimeSnapshot.memorySyncStatus)}>{runtimeSnapshot.memorySyncStatus}</em>
            </div>
            <div className="sync-authority-note">
              <strong>Event Store Authority</strong>
              <span>{runtimeSnapshot.syncTopology.authorityLabel}</span>
              <em>central</em>
            </div>
            <div className="client-sync-list">
              <span>Client Sync</span>
              {runtimeSnapshot.syncTopology.clients
                .filter((client) => client.syncRole === "client_replica")
                .map((client) => (
                  <div className="client-sync-row" key={client.id}>
                    <strong>{client.label}</strong>
                    <span>{client.localStore} / outbox {client.outboxCount}</span>
                    <em className={statusTone(client.status)}>{client.status}</em>
                  </div>
                ))}
            </div>
          </section>
        </aside>

        <section className="center-board">
          <div className="board-toolbar">
            <div className="mode-switch" role="tablist" aria-label="작업 모드">
              <button
                aria-selected={mode === "conversation"}
                className={mode === "conversation" ? "active" : ""}
                onClick={() => setMode("conversation")}
                role="tab"
                type="button"
              >
                <MessageSquare size={16} />
                Conversation
              </button>
              <button
                aria-selected={mode === "debate"}
                className={mode === "debate" ? "active" : ""}
                onClick={() => setMode("debate")}
                role="tab"
                type="button"
              >
                <GitBranch size={16} />
                Debate
              </button>
            </div>
            <div className="toolbar-actions">
              <button className="ghost-button" type="button">
                <Database size={16} />
                Memory
              </button>
              <button className="primary-button" type="button">
                <Send size={16} />
                Coding Packet
              </button>
            </div>
          </div>

          {mode === "conversation" ? <ConversationWorkbench /> : <DebateTable />}

          <CodingPacketPanel packet={codingPacket} />
        </section>

        <aside className="right-rail" aria-label="모델과 에이전트 상태">
          <ProviderProfilesPanel profiles={providerProfiles} />
          <AgentStatePanel />
          <BackupPanel projections={backupProjections} />
        </aside>
      </main>
      <TerminalDock slots={terminalSlots} />
    </div>
  );
}

function RuntimeStatusBar({ snapshot, providerName }: { snapshot: RuntimeSnapshot; providerName: string }) {
  return (
    <header className="status-bar">
      <div className="status-cluster">
        <StatusPill label="DGX-01" status={snapshot.runtimeNodes.find((node) => node.id === "dgx-01")?.status ?? "offline"} />
        <StatusPill label="DGX-02 Server" status={snapshot.dgxStatus} />
        <StatusPill label="Local Model" status={snapshot.localModelStatus} />
        <StatusPill label="Memory Sync" status={snapshot.memorySyncStatus} />
        <StatusPill label="App" status={snapshot.status} />
      </div>
      <div className="status-meta">
        <span>{providerName}</span>
        <span>Data: {snapshot.syncTopology.authorityLabel} authoritative</span>
        <span>Clients: MacBook / Home PC</span>
        <span>{snapshot.recentError}</span>
      </div>
    </header>
  );
}

function StatusPill({ label, status }: { label: string; status: RuntimeSnapshot["status"] }) {
  return (
    <span className={`status-pill ${status}`}>
      <span className="dot" />
      {label}: {status}
    </span>
  );
}

function statusTone(status: RuntimeSnapshot["status"]) {
  if (status === "online") {
    return "ok";
  }
  if (status === "offline") {
    return "danger";
  }
  return "warn";
}

function ConversationWorkbench() {
  return (
    <section className="workbench-panel">
      <div className="conversation-stream">
        <article className="message user">
          <span>사용자</span>
          <p>문서에 맞춰 첫 구현 골격을 만들자. 토론으로 확대할 수 있게 경계도 살려줘.</p>
        </article>
        <article className="message assistant">
          <span>Orchestrator</span>
          <p>
            protocol, provider stub, agent runtime stub, desktop board를 먼저 연결하고 실제 모델 호출은 막아둔다.
          </p>
        </article>
      </div>
      <div className="action-strip">
        <button type="button">
          <GitBranch size={16} />
          토론 전환
        </button>
        <button type="button">
          <Send size={16} />
          패킷 생성
        </button>
        <button type="button">
          <Play size={16} />
          실행 슬롯
        </button>
        <button type="button">
          <Archive size={16} />
          백업 상태
        </button>
        <button type="button">
          <Smartphone size={16} />
          Telegram
        </button>
      </div>
    </section>
  );
}

function DebateTable() {
  const rows = [
    { agent: "Architect", tag: "근거", text: "패키지 경계가 먼저 잡혀야 DGX와 로컬 폴백이 뒤틀리지 않는다." },
    { agent: "Reviewer", tag: "리스크", text: "API 키 원문 저장과 터미널 실행은 첫 구현에서 명시적으로 막아야 한다." },
    { agent: "Orchestrator", tag: "코딩 영향", text: "결론은 Coding Packet 필드로 바로 내려갈 수 있어야 한다." },
  ];

  return (
    <section className="debate-panel">
      <div className="round-strip">
        {debateRounds.map((round) => (
          <span className={`round-chip ${round.status}`} key={round.id}>
            {round.title}
          </span>
        ))}
      </div>
      <div className="debate-grid">
        {rows.map((row) => (
          <article className="debate-card" key={`${row.agent}-${row.tag}`}>
            <header>
              <Bot size={17} />
              <strong>{row.agent}</strong>
              <span>{row.tag}</span>
            </header>
            <p>{row.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProviderProfilesPanel({ profiles }: { profiles: ProviderProfile[] }) {
  return (
    <section className="side-panel">
      <header className="panel-title">
        <KeyRound size={17} />
        <h2>Provider Profiles</h2>
      </header>
      <div className="provider-list">
        {profiles.map((profile) => (
          <article className="provider-row" key={profile.id}>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.kind} / {profile.defaultModel ?? "model pending"}</span>
            </div>
            <span className={`trust ${profile.trustLevel}`}>{profile.trustLevel}</span>
            <code>{profile.secretRef?.redactedPreview ?? "secretRef 없음"}</code>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentStatePanel() {
  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <Bot size={17} />
        <h2>Agents</h2>
      </header>
      <div className="agent-list">
        {defaultAgentProfiles.map((agent) => (
          <div className="agent-row" key={agent.id}>
            <span className={agent.enabled ? "agent-dot enabled" : "agent-dot"} />
            <strong>{agent.name}</strong>
            <span>{agent.role}</span>
            <em>soul:{agent.soulMode}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function BackupPanel({ projections }: { projections: BackupProjection[] }) {
  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <ShieldCheck size={17} />
        <h2>Backup</h2>
      </header>
      <div className="backup-grid">
        {projections.map((projection) => (
          <div className="backup-cell" key={projection.id}>
            <span>{projection.target}</span>
            <strong>{projection.status}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CodingPacketPanel({ packet }: { packet: CodingPacket }) {
  const columns = [
    ["결정", packet.decisions],
    ["제약", packet.constraints],
    ["구현", packet.implementationPlan],
    ["검증", packet.verificationPlan],
  ] as const;

  return (
    <section className="coding-packet">
      <header>
        <div>
          <span>Coding Packet</span>
          <h2>{packet.goal}</h2>
        </div>
        <button className="ghost-button" type="button">
          <CheckCircle2 size={16} />
          구조 검증
        </button>
      </header>
      <div className="packet-grid">
        {columns.map(([title, items]) => (
          <div className="packet-column" key={title}>
            <strong>{title}</strong>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TerminalDock({ slots }: { slots: TerminalSlot[] }) {
  return (
    <footer className="terminal-dock">
      <div className="dock-title">
        <Terminal size={17} />
        <strong>Terminal / Run Log</strong>
        <span>execution disabled</span>
      </div>
      <div className="slot-list">
        {slots.map((slot) => (
          <article className="terminal-slot" key={slot.id}>
            <header>
              <span>{slot.label}</span>
              <em>{slot.status}</em>
            </header>
            <p>{slot.lastCommandPreview}</p>
            <small>approval: {slot.permissionState}</small>
          </article>
        ))}
        <article className="event-log">
          <header>
            <Activity size={15} />
            <span>Event Store</span>
          </header>
          <p>{"conversation.message.created -> redaction.pending -> coding_packet.draft.created"}</p>
        </article>
      </div>
    </footer>
  );
}
