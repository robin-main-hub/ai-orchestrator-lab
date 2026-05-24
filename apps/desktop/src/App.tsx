import { useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Bot,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  MessageSquare,
  Play,
  Plus,
  Pencil,
  RadioTower,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  createCodingPacketDraft,
  createDebateRounds,
  defaultAgentProfiles,
  type DebateContext,
} from "@ai-orchestrator/agents";
import {
  MockProviderAdapter,
  createProviderProfile,
  createProviderProfileFromCredentialInput,
  createProviderRuntimeReadiness,
  createSecretVaultSnapshot,
  discoverModelsForProfile,
} from "@ai-orchestrator/providers";
import {
  appendEventToLog,
  buildMockAssistantReply,
  createCodingPacketFromConversation,
  createStage2Event,
  renderObsidianMarkdown,
} from "./runtime/stage2Runtime";
import {
  createStage3DebateSession,
  type Stage3DebateSession,
} from "./runtime/stage3Runtime";
import {
  createStage4AgentRun,
  type Stage4AgentRun,
} from "./runtime/stage4Runtime";
import {
  createStage5DgxBridge,
  mergeDgxRuntimeSnapshot,
  type Stage5DgxBridge,
} from "./runtime/stage5Runtime";
import {
  createSeedMemoryRecords,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
  type Stage6MemoryInspector,
} from "./runtime/stage6Memory";
import {
  applyStage7ProjectionStatuses,
  createStage7BackupSnapshot,
  getArtifactContent,
  getObsidianArtifact,
  type Stage7BackupSnapshot,
} from "./runtime/stage7Backup";
import {
  createStage8IngressSnapshot,
  createTelegramDemoInput,
  type Stage8IngressSnapshot,
} from "./runtime/stage8Ingress";
import {
  createStage9PermissionSnapshot,
  nextRequiredPermission,
} from "./runtime/stage9Permission";
import {
  isDgxVllmProvider,
  requestDgxVllmCompletion,
} from "./runtime/stage12DgxProvider";
import type {
  AgentProfile,
  ApprovalState,
  BackupProjection,
  CodingPacket,
  ConversationMessage,
  DebateTag,
  EventEnvelope,
  EventSource,
  MemoryRecord,
  ModelDescriptor,
  ModelDiscoverySnapshot,
  PermissionMatrixSnapshot,
  ProviderProfile,
  ProviderRuntimeReadiness,
  RuntimeSnapshot,
  SecretVaultSnapshot,
  SourceTrust,
  TerminalSlot,
} from "@ai-orchestrator/protocol";

type CenterMode = "conversation" | "debate";
type AgentActivityStatus = "idle" | "preparing" | "responding";
type WorkbenchAgent = AgentProfile;
type ModelCatalog = Record<string, ModelDescriptor[]>;

const modelWindowSize = 8;

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

const seededProviderProfiles: ProviderProfile[] = [
  new MockProviderAdapter().profile,
  createProviderProfile({
    id: "provider_dgx02_vllm",
    name: "DGX-02 vLLM",
    kind: "openai",
    baseUrl: "http://dgx-02:8001/v1",
    defaultModel: "qwen36-gio-wiki-rag-prisma",
    tags: ["dgx", "vllm", "no-auth"],
    trustLevel: "trusted",
  }),
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
  createProviderProfile({
    id: "provider_codex_oauth",
    name: "Codex OAuth Session",
    kind: "custom",
    baseUrl: "https://oauth.local/codex",
    defaultModel: "codex-session",
    tags: ["oauth", "session"],
    trustLevel: "limited",
  }),
];

function createModel(providerProfileId: string, id: string, tags: string[] = []): ModelDescriptor {
  return {
    id,
    name: id,
    providerProfileId,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsTools: tags.includes("tools"),
    tags,
  };
}

const seededModelCatalog: ModelCatalog = {
  provider_mock_local: [
    createModel("provider_mock_local", "mock-orchestrator", ["conversation", "debate"]),
    createModel("provider_mock_local", "mock-reviewer", ["review"]),
    createModel("provider_mock_local", "mock-builder", ["coding"]),
  ],
  provider_dgx02_vllm: [
    createModel("provider_dgx02_vllm", "qwen36-gio-wiki-rag-prisma", ["dgx", "vllm", "rag"]),
  ],
  provider_openai_compat: [
    "gpt-5.5-pro",
    "gpt-5.5-coder",
    "gpt-5.5-mini",
    "gpt-5.5-reasoning",
    "gpt-5.1-pro",
    "gpt-5.1-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "o4-mini",
    "o3",
    "computer-use-preview",
    "realtime-preview",
  ].map((id) => createModel("provider_openai_compat", id, ["openai"])),
  provider_reseller_custom: [
    "claude-code-compatible",
    "claude-opus-reseller",
    "claude-sonnet-reseller",
    "deepseek-r1-proxy",
    "qwen3-coder-proxy",
    "gemini-proxy",
    "kimi-k2-proxy",
    "glm-4.5-proxy",
    "grok-proxy",
  ].map((id) => createModel("provider_reseller_custom", id, ["proxy"])),
  provider_codex_oauth: [
    "codex-session",
    "codex-high",
    "codex-medium",
    "codex-low",
    "codex-review",
    "codex-apply-patch",
    "codex-browser",
    "codex-local",
    "codex-dgx",
  ].map((id) => createModel("provider_codex_oauth", id, ["oauth"])),
};

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

const seededAgentProfiles: WorkbenchAgent[] = defaultAgentProfiles.map((agent, index) => {
  const bindings: Array<Required<Pick<WorkbenchAgent, "providerProfileId" | "modelId" | "authBinding">>> = [
    {
      providerProfileId: "provider_mock_local",
      modelId: "mock-orchestrator",
      authBinding: {
        mode: "local",
        label: "local mock runtime",
        providerProfileId: "provider_mock_local",
      },
    },
    {
      providerProfileId: "provider_openai_compat",
      modelId: "gpt-5.5-pro",
      authBinding: {
        mode: "provider_profile",
        label: "API secretRef",
        providerProfileId: "provider_openai_compat",
        secretRefId: "session secret",
      },
    },
    {
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      authBinding: {
        mode: "oauth",
        label: "OAuth ref",
        providerProfileId: "provider_codex_oauth",
        oauthRef: "oauth_codex_placeholder",
      },
    },
    {
      providerProfileId: "provider_dgx02_vllm",
      modelId: "qwen36-gio-wiki-rag-prisma",
      authBinding: {
        mode: "provider_profile",
        label: "DGX-02 vLLM route",
        providerProfileId: "provider_dgx02_vllm",
      },
    },
  ];

  return {
    ...agent,
    ...bindings[index % bindings.length],
  };
});

const initialConversationMessages: ConversationMessage[] = [
  {
    id: "message_seed_user",
    sessionId: "session_desktop_001",
    role: "user",
    content: "문서에 맞춰 첫 구현 골격을 만들자. 토론으로 확대할 수 있게 경계도 살려줘.",
    createdAt: now,
  },
  {
    id: "message_seed_orchestrator",
    sessionId: "session_desktop_001",
    role: "assistant",
    content: "protocol, provider stub, agent runtime stub, desktop board를 먼저 연결하고 실제 모델 호출은 막아둔다.",
    createdAt: now,
    metadata: {
      agentName: "Orchestrator",
      providerProfileId: "provider_mock_local",
    },
  },
];

function createDesktopEvent<T>(type: string, payload: T, createdAt = new Date().toISOString()): EventEnvelope<T> {
  return createStage2Event({ type, payload, createdAt });
}

const initialEventLog: EventEnvelope[] = initialConversationMessages.map((message) =>
  createDesktopEvent(
    "conversation.message.created",
    {
      messageId: message.id,
      role: message.role,
      redaction: "applied",
    },
    message.createdAt,
  ),
);

const initialAgentRun = createStage4AgentRun({
  packet: codingPacket,
  primaryAgent: seededAgentProfiles[0],
  agents: seededAgentProfiles,
  messages: initialConversationMessages,
  events: initialEventLog,
  createdAt: now,
});

const initialDgxBridge = createStage5DgxBridge({
  run: initialAgentRun,
  runtime: runtimeSnapshot,
  createdAt: now,
});

const initialMemoryRecords = createSeedMemoryRecords(now);
const initialIngressSnapshot = createStage8IngressSnapshot(
  createTelegramDemoInput(new Date("2026-05-24T00:23:00.000+09:00").toISOString()),
);

export function App() {
  const [mode, setMode] = useState<CenterMode>("conversation");
  const [runtimeSnapshotState, setRuntimeSnapshotState] = useState<RuntimeSnapshot>(runtimeSnapshot);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>(seededProviderProfiles);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>(seededModelCatalog);
  const [modelDiscoveryByProviderId, setModelDiscoveryByProviderId] = useState<Record<string, ModelDiscoverySnapshot>>({});
  const [agents, setAgents] = useState<WorkbenchAgent[]>(seededAgentProfiles);
  const [agentActivityById, setAgentActivityById] = useState<Record<string, AgentActivityStatus>>({});
  const [modelWindowStartByAgentId, setModelWindowStartByAgentId] = useState<Record<string, number>>({});
  const [selectedAgentId, setSelectedAgentId] = useState(seededAgentProfiles[0]?.id ?? "");
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>(initialConversationMessages);
  const [eventLog, setEventLog] = useState<EventEnvelope[]>(initialEventLog);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>(initialMemoryRecords);
  const [ingressSnapshot, setIngressSnapshot] = useState<Stage8IngressSnapshot>(initialIngressSnapshot);
  const [approvalStateByItemId, setApprovalStateByItemId] = useState<Record<string, ApprovalState>>({});
  const [codingPacketState, setCodingPacketState] = useState<CodingPacket>(codingPacket);
  const [debateSession, setDebateSession] = useState<Stage3DebateSession>(() =>
    createStage3DebateSession({
      messages: initialConversationMessages,
      agents: seededAgentProfiles,
      providers: seededProviderProfiles,
      events: initialEventLog,
      runtime: runtimeSnapshot,
      createdAt: now,
    }),
  );
  const [agentRunState, setAgentRunState] = useState<Stage4AgentRun>(initialAgentRun);
  const [dgxBridgeState, setDgxBridgeState] = useState<Stage5DgxBridge>(initialDgxBridge);
  const [backupProjectionsState, setBackupProjectionsState] = useState<BackupProjection[]>(backupProjections);
  const [obsidianMarkdownPreview, setObsidianMarkdownPreview] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const activeProvider = useMemo(
    () => providerProfiles.find((profile) => profile.id === runtimeSnapshotState.activeProviderProfileId),
    [providerProfiles, runtimeSnapshotState.activeProviderProfileId],
  );
  const usedProviderIds = useMemo(
    () =>
      new Set(
        agents
          .map((agent) => agent.providerProfileId)
          .filter((providerId): providerId is string => Boolean(providerId)),
      ),
    [agents],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId],
  );
  const selectedProvider = useMemo(
    () =>
      providerProfiles.find((profile) => profile.id === selectedAgent?.providerProfileId) ??
      activeProvider ??
      providerProfiles[0],
    [activeProvider, providerProfiles, selectedAgent],
  );
  const secretVaultSnapshot = useMemo(
    () => createSecretVaultSnapshot(providerProfiles, runtimeSnapshotState.updatedAt),
    [providerProfiles, runtimeSnapshotState.updatedAt],
  );
  const providerReadiness = useMemo(
    () =>
      createProviderRuntimeReadiness({
        profile: selectedProvider,
        models: selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [],
        vault: secretVaultSnapshot,
        selectedModelId: selectedAgent?.modelId ?? selectedProvider?.defaultModel,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [modelCatalog, runtimeSnapshotState.updatedAt, secretVaultSnapshot, selectedAgent, selectedProvider],
  );
  const memoryInspector = useMemo(
    () =>
      createStage6MemoryInspector({
        records: memoryRecords,
        messages: conversationMessages,
        packet: codingPacketState,
        events: eventLog,
        provider: selectedProvider,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [codingPacketState, conversationMessages, eventLog, memoryRecords, runtimeSnapshotState.updatedAt, selectedProvider],
  );
  const backupSnapshot = useMemo(
    () =>
      createStage7BackupSnapshot({
        messages: conversationMessages,
        packet: codingPacketState,
        events: eventLog,
        projections: backupProjectionsState,
        runtime: runtimeSnapshotState,
        agentRun: agentRunState,
        memoryInspector,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [
      agentRunState,
      backupProjectionsState,
      codingPacketState,
      conversationMessages,
      eventLog,
      memoryInspector,
      runtimeSnapshotState,
    ],
  );
  const permissionSnapshot = useMemo(
    () =>
      createStage9PermissionSnapshot({
        sessionId: "session_desktop_001",
        externalApprovals: ingressSnapshot.approvals,
        terminalSlots,
        agentRun: agentRunState,
        runtime: runtimeSnapshotState,
        mobilePolicy: backupSnapshot.mobilePolicy,
        decisions: approvalStateByItemId,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [agentRunState, approvalStateByItemId, backupSnapshot.mobilePolicy, ingressSnapshot.approvals, runtimeSnapshotState],
  );

  function appendEvent<T>(
    type: string,
    payload: T,
    options?: {
      source?: EventSource;
      sourceTrust?: SourceTrust;
      correlationId?: string;
    },
  ) {
    const event = createStage2Event({
      type,
      payload,
      source: options?.source,
      sourceTrust: options?.sourceTrust,
      correlationId: options?.correlationId,
    });
    setEventLog((events) => appendEventToLog(events, event));
    return event;
  }

  async function handleSendMessageStage2() {
    const content = draftMessage.trim();
    if (!content || !selectedAgent || !selectedProvider) {
      return;
    }

    const createdAt = new Date().toISOString();
    const authLabel = selectedAgent.authBinding?.label ?? "credential pending";
    const authMode = selectedAgent.authBinding?.mode ?? "provider_profile";
    const modelId = selectedAgent.modelId ?? selectedProvider.defaultModel ?? "model pending";
    const userMessage: ConversationMessage = {
      id: `message_user_${crypto.randomUUID()}`,
      sessionId: "session_desktop_001",
      role: "user",
      content,
      createdAt,
    };

    setAgentActivity(selectedAgent.id, "preparing");
    setConversationMessages((messages) => [...messages, userMessage]);
    setDraftMessage("");
    appendEvent("conversation.message.created", {
      messageId: userMessage.id,
      role: "user",
      contentLength: content.length,
      redaction: "applied",
    });
    appendEvent(isDgxVllmProvider(selectedProvider) ? "provider.completion.dgx.requested" : "provider.completion.mocked", {
      agentId: selectedAgent.id,
      providerProfileId: selectedProvider.id,
      modelId,
      authMode,
      authLabel,
      routePreference: isDgxVllmProvider(selectedProvider) ? "server_proxy" : "mock",
    });

    let reply = "";
    let completionMetadata: Record<string, unknown> = {};
    try {
      if (isDgxVllmProvider(selectedProvider)) {
        const result = await requestDgxVllmCompletion({
          provider: selectedProvider,
          modelId,
          messages: [...conversationMessages, userMessage],
        });
        reply = result.content;
        completionMetadata = {
          endpoint: result.endpoint,
          route: result.route,
          fallbackReason: result.fallbackReason,
          usage: result.usage,
          realProviderCall: true,
        };
        appendEvent("provider.completion.dgx.succeeded", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          endpoint: result.endpoint,
          route: result.route,
          fallbackReason: result.fallbackReason,
          usage: result.usage,
        });
      } else {
        reply = buildMockAssistantReply({
          content,
          agent: selectedAgent,
          provider: selectedProvider,
        });
        completionMetadata = {
          realProviderCall: false,
        };
      }
    } catch (error) {
      reply = `DGX-02 vLLM 호출에 실패했어. ${error instanceof Error ? error.message : String(error)}`;
      completionMetadata = {
        error: error instanceof Error ? error.message : String(error),
        realProviderCall: false,
      };
      appendEvent("provider.completion.dgx.failed", {
        agentId: selectedAgent.id,
        providerProfileId: selectedProvider.id,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const assistantMessage: ConversationMessage = {
      id: `message_agent_${crypto.randomUUID()}`,
      sessionId: "session_desktop_001",
      role: "assistant",
      content: reply,
      createdAt: new Date().toISOString(),
      metadata: {
        agentName: selectedAgent.name,
        providerProfileId: selectedProvider.id,
        authMode,
        ...completionMetadata,
      },
    };

    setAgentActivity(selectedAgent.id, "responding");
    setConversationMessages((messages) => [...messages, assistantMessage]);
    appendEvent("conversation.message.created", {
      messageId: assistantMessage.id,
      role: "assistant",
      contentLength: reply.length,
      redaction: "applied",
    });
    window.setTimeout(() => {
      setAgentActivity(selectedAgent.id, "idle");
    }, 450);
  }

  function handleCreateCodingPacket() {
    const basePacket = createCodingPacketFromConversation({
      messages: conversationMessages,
      agent: selectedAgent,
      provider: selectedProvider,
    });
    const debateDecisions = debateSession.rounds
      .flatMap((round) => round.utterances)
      .filter((utterance) => utterance.tags.some((tag) => tag === "agreement" || tag === "coding_impact"))
      .map((utterance) => utterance.content)
      .slice(0, 5);
    const packet =
      mode === "debate"
        ? {
            ...basePacket,
            context: [
              ...basePacket.context,
              `Stage3 Debate: ${debateSession.summary}`,
              ...debateSession.contextPreview,
            ],
            decisions: [...debateDecisions, ...basePacket.decisions],
            reviewerNotes: [
              ...basePacket.reviewerNotes,
              `Debate ${debateSession.id}에서 ${debateSession.rounds.length}개 라운드를 반영함`,
            ],
          }
        : basePacket;

    setCodingPacketState(packet);
    appendEvent("coding_packet.created", {
      goal: packet.goal,
      contextCount: packet.context.length,
      decisionCount: packet.decisions.length,
      filesToInspect: packet.filesToInspect,
    });
  }

  function handlePromoteToDebate() {
    const session = createStage3DebateSession({
      messages: conversationMessages,
      agents,
      providers: providerProfiles,
      events: eventLog,
      runtime: runtimeSnapshotState,
    });

    setDebateSession(session);
    setMode("debate");
    appendEvent("debate.context.promoted", {
      debateId: session.id,
      participantCount: session.participants.length,
      roundCount: session.rounds.length,
      problemLength: session.problem.length,
    });
    appendEvent("debate.round.started", {
      debateId: session.id,
      roundId: session.rounds[0]?.id,
      kind: session.rounds[0]?.kind,
    });
  }

  function handleExportBackupProjections() {
    const snapshot = createStage7BackupSnapshot({
      messages: conversationMessages,
      packet: codingPacketState,
      events: eventLog,
      projections: backupProjectionsState,
      runtime: runtimeSnapshotState,
      agentRun: agentRunState,
      memoryInspector,
    });
    const obsidianArtifact = getObsidianArtifact(snapshot);
    const markdown =
      getArtifactContent(snapshot, obsidianArtifact?.id) ||
      renderObsidianMarkdown({
        messages: conversationMessages,
        packet: codingPacketState,
        events: eventLog,
      });

    setObsidianMarkdownPreview(markdown);
    setBackupProjectionsState((projections) => applyStage7ProjectionStatuses(projections, snapshot));
    appendEvent("backup.projection.generated", {
      snapshotId: snapshot.id,
      artifactCount: snapshot.artifacts.length,
      ready: snapshot.summary.ready,
      queued: snapshot.summary.queued,
      blocked: snapshot.summary.blocked,
      redacted: snapshot.summary.redacted,
    });
    appendEvent("backup.queue.updated", {
      snapshotId: snapshot.id,
      queue: snapshot.queue.map((item) => ({
        target: item.target,
        status: item.status,
        reason: item.reason,
      })),
    });
    appendEvent("mobile.projection.policy.updated", {
      snapshotId: snapshot.id,
      policy: snapshot.mobilePolicy,
    });
  }

  function handleImportTelegramIngress() {
    const receivedAt = new Date().toISOString();
    const snapshot = createStage8IngressSnapshot(createTelegramDemoInput(receivedAt));
    const normalizedEvent = snapshot.result.normalizedEvent;

    setIngressSnapshot(snapshot);
    appendEvent(
      "ingress.guard.evaluated",
      {
        snapshotId: snapshot.id,
        channel: snapshot.channel,
        accepted: snapshot.result.accepted,
        confidence: snapshot.result.confidence,
        approvalState: snapshot.result.approvalState,
        guardSteps: snapshot.result.guardSteps.map((step) => ({
          name: step.name,
          status: step.status,
        })),
      },
      {
        source: "telegram",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );

    if (!normalizedEvent) {
      appendEvent(
        "ingress.guard.blocked",
        {
          snapshotId: snapshot.id,
          reason: snapshot.result.reason,
        },
        {
          source: "telegram",
          sourceTrust: "untrusted",
          correlationId: snapshot.id,
        },
      );
      return;
    }

    const telegramMessage: ConversationMessage = {
      id: `message_telegram_${crypto.randomUUID()}`,
      sessionId: "session_desktop_001",
      role: "user",
      content: normalizedEvent.normalizedText,
      createdAt: receivedAt,
      metadata: {
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        approvalState: snapshot.result.approvalState,
        sourceTrust: normalizedEvent.sourceTrust,
      },
    };

    setConversationMessages((messages) => [...messages, telegramMessage]);
    setMemoryRecords((records) => [
      {
        id: `memory_ingress_${normalizedEvent.id}`,
        layer: "fragment",
        title: "Telegram ingress candidate",
        content: normalizedEvent.normalizedText,
        sourceChannel: "telegram",
        trustLevel: "untrusted",
        createdAt: receivedAt,
        pinned: false,
      },
      ...records,
    ]);
    appendEvent(
      "conversation.message.created",
      {
        messageId: telegramMessage.id,
        role: "user",
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        redaction: normalizedEvent.redacted ? "applied" : "none",
      },
      {
        source: "telegram",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );
    appendEvent(
      "memory.candidate.created",
      {
        recordId: `memory_ingress_${normalizedEvent.id}`,
        sourceChannel: "telegram",
        trustLevel: "untrusted",
        autoRecall: false,
      },
      {
        source: "telegram",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );

    if (snapshot.approvals.length > 0) {
      appendEvent(
        "permission.requested",
        {
          approvalIds: snapshot.approvals.map((approval) => approval.id),
          permissions: snapshot.approvals.flatMap((approval) => approval.permissions),
          channel: snapshot.channel,
        },
        {
          source: "telegram",
          sourceTrust: "untrusted",
          correlationId: snapshot.id,
        },
      );
    }
  }

  function handleResolveNextPermission(state: Extract<ApprovalState, "approved" | "rejected">) {
    const pendingItem = nextRequiredPermission(permissionSnapshot);
    if (!pendingItem) {
      return;
    }

    const decidedAt = new Date().toISOString();
    setApprovalStateByItemId((decisions) => ({
      ...decisions,
      [pendingItem.sourceItemId]: state,
    }));
    appendEvent(`permission.${state}`, {
      queueItemId: pendingItem.id,
      sourceItemId: pendingItem.sourceItemId,
      permissions: pendingItem.permissions,
      requestedBy: pendingItem.requestedBy,
    });
    appendEvent("permission.queue.updated", {
      snapshotId: permissionSnapshot.id,
      sourceItemId: pendingItem.sourceItemId,
      state,
      decidedAt,
    });

    if (state === "approved" && pendingItem.permissions.includes("remote_workspace")) {
      const bridge = createStage5DgxBridge({
        run: agentRunState,
        runtime: runtimeSnapshotState,
        approvalOverride: "approved",
        createdAt: decidedAt,
      });
      setDgxBridgeState(bridge);
      appendEvent("dgx.remote_run.approval_applied", {
        bridgeId: bridge.id,
        responseStatus: bridge.response.status,
        fallbackMode: bridge.response.fallbackMode,
      });
    }
  }

  function handleRememberCurrentContext() {
    const createdAt = new Date().toISOString();
    const candidates = rememberStage6Context({
      messages: conversationMessages,
      packet: codingPacketState,
      provider: selectedProvider,
      createdAt,
    });

    setMemoryRecords((records) => {
      const existingIds = new Set(records.map((record) => record.id));
      return [...candidates.filter((record) => !existingIds.has(record.id)), ...records];
    });
    setRuntimeSnapshotState((snapshot) => ({
      ...snapshot,
      memorySyncStatus: snapshot.dgxStatus === "online" ? "syncing" : "degraded",
      updatedAt: createdAt,
    }));
    appendEvent("memory.candidate.created", {
      recordIds: candidates.map((record) => record.id),
      count: candidates.length,
      sourceChannel: "desktop",
      trustLevel: selectedProvider?.trustLevel ?? "limited",
      providerProfileId: selectedProvider?.id,
    });
    appendEvent("memory.recall.trace.updated", {
      traceId: memoryInspector.trace.id,
      resultCount: memoryInspector.trace.results.length,
      usedCount: memoryInspector.trace.results.filter((result) => result.usedInDecision).length,
      blockedCount: memoryInspector.blockedCount,
    });
  }

  function handlePinMemory(recordId: string) {
    setMemoryRecords((records) => pinMemoryRecord(records, recordId));
    appendEvent("memory.pin.updated", {
      recordId,
      pinned: true,
    });
  }

  function handleForgetMemory(recordId: string) {
    setMemoryRecords((records) => forgetMemoryRecord(records, recordId));
    appendEvent("memory.forget.requested", {
      recordId,
      policy: "tombstone_projection",
    });
  }

  function handleCreateAgentRun() {
    const run = createStage4AgentRun({
      packet: codingPacketState,
      primaryAgent: selectedAgent,
      agents,
      messages: conversationMessages,
      events: eventLog,
    });

    setAgentRunState(run);
    const bridge = createStage5DgxBridge({
      run,
      runtime: runtimeSnapshotState,
    });
    setDgxBridgeState(bridge);
    if (selectedAgent) {
      setAgentActivity(selectedAgent.id, "preparing");
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "responding");
      }, 220);
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "idle");
      }, 900);
    }
    appendEvent("agent.run.planned", {
      runId: run.id,
      primaryAgentId: run.primaryAgentId,
      status: run.status,
      stepCount: run.steps.length,
      verifierStatus: run.verifier.status,
    });
    appendEvent("soul.summary.injected", {
      runId: run.id,
      primaryAgentId: run.primaryAgentId,
      mode: selectedAgent?.soulMode ?? "off",
    });
    appendEvent("memory.recall.used", {
      runId: run.id,
      traceCount: run.recallTrace.length,
      usedCount: run.recallTrace.filter((trace) => trace.usedInDecision).length,
      stage6TraceId: memoryInspector.trace.id,
      policy: memoryInspector.trace.policy.reason,
      blockedCount: memoryInspector.blockedCount,
    });
    appendEvent("run.replay.prepared", {
      runId: run.id,
      replayId: run.replay.id,
      eventCount: run.replay.eventIds.length,
    });
    appendEvent("dgx.remote_run.planned", {
      bridgeId: bridge.id,
      runId: run.id,
      targetNodeId: bridge.request.targetNodeId,
      responseStatus: bridge.response.status,
      fallbackMode: bridge.response.fallbackMode,
    });
    if (bridge.localFallbackEnabled) {
      appendEvent("runtime.local_fallback.ready", {
        bridgeId: bridge.id,
        reason: bridge.response.message,
        fallbackMode: bridge.response.fallbackMode,
      });
    }
  }

  function handleProbeDgx() {
    const checkedAt = new Date().toISOString();
    const authorityNodeId = runtimeSnapshotState.syncTopology.authorityNodeId;
    const serverRuntime: RuntimeSnapshot = {
      ...runtimeSnapshotState,
      status: "online",
      dgxStatus: "online",
      memorySyncStatus: "syncing",
      runtimeNodes: runtimeSnapshotState.runtimeNodes.map((node) =>
        node.id === authorityNodeId
          ? {
              ...node,
              status: "online",
              models: Array.from(
                new Set([...node.models, "remote-workspace", "event-store-authority", "qwen36-gio-wiki-rag-prisma"]),
              ),
            }
          : node,
      ),
      syncTopology: {
        ...runtimeSnapshotState.syncTopology,
        clients: runtimeSnapshotState.syncTopology.clients.map((client) =>
          client.id === authorityNodeId
            ? {
                ...client,
                status: "online",
                outboxCount: 0,
                lastSeenAt: checkedAt,
              }
            : client,
        ),
      },
      recentError: undefined,
      updatedAt: checkedAt,
    };
    const mergedRuntime = mergeDgxRuntimeSnapshot(runtimeSnapshotState, serverRuntime);
    const bridge = createStage5DgxBridge({
      run: agentRunState,
      runtime: mergedRuntime,
      createdAt: checkedAt,
    });
    const dgxProvider = providerProfiles.find((profile) => profile.id === "provider_dgx02_vllm");
    const dgxDiscovery = dgxProvider ? discoverModelsForProfile(dgxProvider, checkedAt) : undefined;

    setRuntimeSnapshotState(mergedRuntime);
    setDgxBridgeState(bridge);
    if (dgxDiscovery) {
      setModelCatalog((catalog) => ({
        ...catalog,
        [dgxDiscovery.providerProfileId]: dgxDiscovery.models,
      }));
      setModelDiscoveryByProviderId((discoveries) => ({
        ...discoveries,
        [dgxDiscovery.providerProfileId]: dgxDiscovery,
      }));
    }
    appendEvent("dgx.heartbeat.checked", {
      nodeId: bridge.heartbeat.nodeId,
      status: bridge.heartbeat.status,
      latencyMs: bridge.heartbeat.latencyMs,
    });
    appendEvent("runtime.snapshot.merged", {
      authorityNodeId,
      dgxStatus: mergedRuntime.dgxStatus,
      eventStoreMode: mergedRuntime.syncTopology.eventStoreMode,
    });
    if (dgxDiscovery) {
      appendEvent("provider.models.remote_probe.merged", {
        providerProfileId: dgxDiscovery.providerProfileId,
        source: dgxDiscovery.source,
        modelCount: dgxDiscovery.models.length,
        selectedModelId: dgxDiscovery.selectedModelId,
      });
    }
  }

  function setAgentActivity(agentId: string, status: AgentActivityStatus) {
    setAgentActivityById((currentStatus) => ({
      ...currentStatus,
      [agentId]: status,
    }));
  }

  function handleAddAgent() {
    const nextIndex = agents.length + 1;
    const occupiedProviderIds = new Set(
      agents
        .map((agent) => agent.providerProfileId)
        .filter((providerId): providerId is string => Boolean(providerId)),
    );
    const provider = providerProfiles.find((profile) => !occupiedProviderIds.has(profile.id));
    const nextAgent: WorkbenchAgent = {
      id: `agent_custom_${crypto.randomUUID()}`,
      name: `Custom Agent ${nextIndex}`,
      kind: "virtual",
      role: "builder",
      providerProfileId: provider?.id,
      modelId: provider?.defaultModel,
      soulMode: "off",
      authBinding: createAuthBinding(provider),
      enabled: true,
      permissionLevel: "read_only",
    };

    setAgents((currentAgents) => [...currentAgents, nextAgent]);
    setSelectedAgentId(nextAgent.id);
  }

  function handleRemoveAgent(agentId: string) {
    setAgents((currentAgents) => {
      if (currentAgents.length <= 1) {
        return currentAgents;
      }

      const nextAgents = currentAgents.filter((agent) => agent.id !== agentId);
      if (selectedAgentId === agentId) {
        setSelectedAgentId(nextAgents[0]?.id ?? "");
      }
      setAgentActivityById((currentStatus) => {
        const { [agentId]: _removedStatus, ...remainingStatus } = currentStatus;
        return remainingStatus;
      });
      return nextAgents;
    });
  }

  function createAuthBinding(provider?: ProviderProfile): WorkbenchAgent["authBinding"] {
    if (!provider) {
      return {
        mode: "provider_profile",
        label: "credential pending",
      };
    }

    if (provider.id === "provider_mock_local") {
      return {
        mode: "local",
        label: "local runtime",
        providerProfileId: provider.id,
      };
    }

    return {
      mode: provider.tags.includes("oauth") ? "oauth" : "provider_profile",
      label: provider.tags.includes("oauth") ? "OAuth/API profile" : "API secretRef",
      providerProfileId: provider.id,
      secretRefId: provider.secretRef?.id,
      oauthRef: provider.tags.includes("oauth") ? "oauth_pending" : undefined,
    };
  }

  function handleAddProvider() {
    const nextIndex = providerProfiles.length + 1;
    const rawInput =
      window.prompt(
        "API key / env / Claude Code JSON 붙여넣기",
        'export ANTHROPIC_BASE_URL="https://api.apikey.fun"\nexport ANTHROPIC_AUTH_TOKEN="sk-session-placeholder"',
      ) ?? "";
    const nextProvider =
      rawInput.trim().length > 0
        ? createProviderProfileFromCredentialInput({
            id: `provider_custom_${crypto.randomUUID()}`,
            rawInput,
          }).profile
        : createProviderProfile({
            id: `provider_custom_${crypto.randomUUID()}`,
            name: `Custom Provider ${nextIndex}`,
            kind: "custom",
            baseUrl: "https://api.example.local/v1",
            rawSecret: `sk-placeholder-provider-${nextIndex}`,
            defaultModel: `custom-model-${nextIndex}`,
            tags: ["custom"],
            trustLevel: "limited",
          });
    const discovery = discoverModelsForProfile(nextProvider);

    setProviderProfiles((profiles) => [...profiles, nextProvider]);
    setModelCatalog((catalog) => ({
      ...catalog,
      [nextProvider.id]: discovery.models,
    }));
    setModelDiscoveryByProviderId((current) => ({
      ...current,
      [nextProvider.id]: discovery,
    }));
    appendEvent("provider.profile.imported", {
      providerProfileId: nextProvider.id,
      kind: nextProvider.kind,
      trustLevel: nextProvider.trustLevel,
      secretRef: nextProvider.secretRef?.redactedPreview ?? "pending",
      modelCount: discovery.models.length,
    });
    appendEvent("provider.models.discovered", {
      providerProfileId: nextProvider.id,
      status: discovery.status,
      modelCount: discovery.models.length,
      source: discovery.source,
      redactionApplied: discovery.redactionApplied,
    });
  }

  function handleDiscoverProviderModels(providerId: string) {
    const provider = providerProfiles.find((profile) => profile.id === providerId);
    if (!provider) {
      return;
    }

    const discovery = discoverModelsForProfile(provider);
    setModelCatalog((catalog) => ({
      ...catalog,
      [provider.id]: discovery.models,
    }));
    setModelDiscoveryByProviderId((current) => ({
      ...current,
      [provider.id]: discovery,
    }));
    setProviderProfiles((profiles) =>
      profiles.map((profile) =>
        profile.id === provider.id
          ? {
              ...profile,
              defaultModel: discovery.selectedModelId ?? profile.defaultModel,
              modelDiscoveryEndpoint: profile.modelDiscoveryEndpoint ?? provider.modelDiscoveryEndpoint,
            }
          : profile,
      ),
    );
    appendEvent("provider.models.discovered", {
      providerProfileId: provider.id,
      status: discovery.status,
      modelCount: discovery.models.length,
      source: discovery.source,
      redactionApplied: discovery.redactionApplied,
      warnings: discovery.warnings,
    });
  }

  function handleCheckProviderVault() {
    appendEvent("secret.vault.checked", {
      snapshotId: secretVaultSnapshot.id,
      available: secretVaultSnapshot.summary.available,
      missing: secretVaultSnapshot.summary.missing,
      transient: secretVaultSnapshot.summary.transient,
      rawSecretPersisted: secretVaultSnapshot.rawSecretPersisted,
    });
    appendEvent("provider.runtime.readiness.checked", {
      readinessId: providerReadiness.id,
      providerProfileId: providerReadiness.providerProfileId,
      status: providerReadiness.status,
      executionMode: providerReadiness.executionMode,
      canRunCompletion: providerReadiness.canRunCompletion,
      canUseAutomaticMemory: providerReadiness.canUseAutomaticMemory,
      reason: providerReadiness.reason,
    });
  }

  function handleRemoveProvider(providerId: string) {
    const isInUse = agents.some((agent) => agent.providerProfileId === providerId);
    if (providerProfiles.length <= 1 || isInUse) {
      return;
    }

    setProviderProfiles((profiles) => profiles.filter((profile) => profile.id !== providerId));
    setModelCatalog((catalog) => {
      const { [providerId]: _removedModels, ...remainingCatalog } = catalog;
      return remainingCatalog;
    });
    setModelDiscoveryByProviderId((discoveries) => {
      const { [providerId]: _removedDiscovery, ...remainingDiscoveries } = discoveries;
      return remainingDiscoveries;
    });
  }

  function handleRenameProvider(providerId: string) {
    const provider = providerProfiles.find((profile) => profile.id === providerId);
    const nextName = window.prompt("Provider 이름", provider?.name ?? "");
    if (!nextName?.trim()) {
      return;
    }

    setProviderProfiles((profiles) =>
      profiles.map((profile) => (profile.id === providerId ? { ...profile, name: nextName.trim() } : profile)),
    );
  }

  function handleRenameAgent(agentId: string) {
    const agent = agents.find((profile) => profile.id === agentId);
    const nextName = window.prompt("Agent 이름", agent?.name ?? "");
    if (!nextName?.trim()) {
      return;
    }

    setAgents((currentAgents) =>
      currentAgents.map((agentProfile) =>
        agentProfile.id === agentId ? { ...agentProfile, name: nextName.trim() } : agentProfile,
      ),
    );
  }

  function handleAssignProvider(agentId: string, providerId: string) {
    const provider = providerProfiles.find((profile) => profile.id === providerId);
    const isOccupied = agents.some((agent) => agent.id !== agentId && agent.providerProfileId === providerId);
    if (!provider || isOccupied) {
      return;
    }

    setAgents((currentAgents) =>
      currentAgents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              providerProfileId: provider.id,
              modelId: modelCatalog[provider.id]?.[0]?.id ?? provider.defaultModel,
              authBinding: createAuthBinding(provider),
            }
          : agent,
      ),
    );
    setModelWindowStartByAgentId((windowStart) => ({
      ...windowStart,
      [agentId]: 0,
    }));
  }

  function handleAssignModel(agentId: string, modelId: string) {
    setAgents((currentAgents) =>
      currentAgents.map((agent) => (agent.id === agentId ? { ...agent, modelId } : agent)),
    );
  }

  function handleShiftModelWindow(agentId: string, direction: -1 | 1) {
    const agent = agents.find((candidate) => candidate.id === agentId);
    const providerId = agent?.providerProfileId;
    const models = providerId ? (modelCatalog[providerId] ?? []) : [];
    const maxStart = Math.max(models.length - modelWindowSize, 0);

    setModelWindowStartByAgentId((windowStart) => {
      const currentStart = windowStart[agentId] ?? 0;
      const nextStart = Math.min(Math.max(currentStart + direction * modelWindowSize, 0), maxStart);
      return {
        ...windowStart,
        [agentId]: nextStart,
      };
    });
  }

  return (
    <div className="app-shell">
      <RuntimeStatusBar
        onProbeDgx={handleProbeDgx}
        providerName={activeProvider?.name ?? "미선택"}
        snapshot={runtimeSnapshotState}
      />
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

          <RuntimeRailPanel onProbeDgx={handleProbeDgx} snapshot={runtimeSnapshotState} />
          <OperationsRailPanel
            backupSnapshot={backupSnapshot}
            ingressSnapshot={ingressSnapshot}
            onCheckProviderVault={handleCheckProviderVault}
            onExportBackup={handleExportBackupProjections}
            onImportTelegram={handleImportTelegramIngress}
            permissionSnapshot={permissionSnapshot}
            providerReadiness={providerReadiness}
            secretVaultSnapshot={secretVaultSnapshot}
          />

          <section className="mini-panel legacy-runtime-panel">
            <header>
              <Server size={16} />
              <span>Runtime</span>
            </header>
            <div className="runtime-node-list">
              {runtimeSnapshotState.runtimeNodes.map((node) => (
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
              {runtimeSnapshotState.localModels.map((model) => (
                <div className="local-model" key={model.id}>
                  <strong>{model.name}</strong>
                  <em className={statusTone(model.status)}>{model.runner}</em>
                </div>
              ))}
            </div>
            <div className="memory-sync-note">
              <strong>Memory Sync</strong>
              <span>Memento/장기기억과 로컬 캐시 동기화 상태</span>
              <em className={statusTone(runtimeSnapshotState.memorySyncStatus)}>{runtimeSnapshotState.memorySyncStatus}</em>
            </div>
            <div className="sync-authority-note">
              <strong>Event Store Authority</strong>
              <span>{runtimeSnapshotState.syncTopology.authorityLabel}</span>
              <em>central</em>
            </div>
            <div className="client-sync-list">
              <span>Client Sync</span>
              {runtimeSnapshotState.syncTopology.clients
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
              <button className="ghost-button" onClick={handleRememberCurrentContext} type="button">
                <Database size={16} />
                Memory
              </button>
              <button className="primary-button" onClick={handleCreateCodingPacket} type="button">
                <Send size={16} />
                Coding Packet
              </button>
            </div>
          </div>

          {mode === "conversation" ? (
            <ConversationWorkbench
              agents={agents}
              draftMessage={draftMessage}
              messages={conversationMessages}
              onBackupProjection={handleExportBackupProjections}
              onCreateAgentRun={handleCreateAgentRun}
              onCreateCodingPacket={handleCreateCodingPacket}
              onDraftMessageChange={setDraftMessage}
              onImportTelegram={handleImportTelegramIngress}
              onPromoteToDebate={handlePromoteToDebate}
              onSelectAgent={setSelectedAgentId}
              onSendMessage={handleSendMessageStage2}
              selectedAgent={selectedAgent}
              selectedAgentId={selectedAgent?.id}
              selectedProvider={selectedProvider}
            />
          ) : (
            <Stage3DebateTable onCreateCodingPacket={handleCreateCodingPacket} session={debateSession} />
          )}

          <CodingPacketPanel packet={codingPacketState} />
        </section>

        <aside className="right-rail" aria-label="모델과 에이전트 상태">
          <ProviderProfilesManagerPanel
            modelCatalog={modelCatalog}
            modelDiscoveryByProviderId={modelDiscoveryByProviderId}
            onAddProvider={handleAddProvider}
            onDiscoverModels={handleDiscoverProviderModels}
            onRenameProvider={handleRenameProvider}
            onRemoveProvider={handleRemoveProvider}
            profiles={providerProfiles}
            usedProviderIds={usedProviderIds}
          />
          <AgentStatePanel
            agents={agents}
            agentActivityById={agentActivityById}
            modelCatalog={modelCatalog}
            modelWindowStartByAgentId={modelWindowStartByAgentId}
            onAddAgent={handleAddAgent}
            onAssignModel={handleAssignModel}
            onAssignProvider={handleAssignProvider}
            onRenameAgent={handleRenameAgent}
            onRemoveAgent={handleRemoveAgent}
            onSelectAgent={setSelectedAgentId}
            onShiftModelWindow={handleShiftModelWindow}
            profiles={providerProfiles}
            selectedAgentId={selectedAgent?.id}
          />
          <MemoryInspectorPanel
            inspector={memoryInspector}
            onForget={handleForgetMemory}
            onPin={handlePinMemory}
            onRemember={handleRememberCurrentContext}
          />
        </aside>
      </main>
      <TerminalDock
        agentRun={agentRunState}
        dgxBridge={dgxBridgeState}
        events={eventLog}
        onApproveNext={() => handleResolveNextPermission("approved")}
        onCheckProviderVault={handleCheckProviderVault}
        onRejectNext={() => handleResolveNextPermission("rejected")}
        permissionSnapshot={permissionSnapshot}
        providerReadiness={providerReadiness}
        secretVaultSnapshot={secretVaultSnapshot}
        slots={terminalSlots}
      />
    </div>
  );
}

function RuntimeRailPanel({
  onProbeDgx,
  snapshot,
}: {
  onProbeDgx: () => void;
  snapshot: RuntimeSnapshot;
}) {
  const clientOutbox = snapshot.syncTopology.clients
    .filter((client) => client.syncRole === "client_replica")
    .reduce((sum, client) => sum + client.outboxCount, 0);

  return (
    <section className="mini-panel rail-panel">
      <header>
        <Server size={16} />
        <span>Systems</span>
        <button className="rail-icon-button" onClick={onProbeDgx} title="Probe DGX-02" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="rail-node-grid">
        {snapshot.runtimeNodes.map((node) => (
          <article className={node.id === "dgx-01" ? "locked" : ""} key={node.id}>
            <span>{node.label}</span>
            <strong>{node.id === "dgx-01" ? "locked" : node.isPrimary ? "main" : node.role}</strong>
            <em className={statusTone(node.status)}>{node.status}</em>
          </article>
        ))}
      </div>
      <div className="rail-stat-list">
        <div>
          <span>authority</span>
          <strong>{snapshot.syncTopology.authorityLabel}</strong>
        </div>
        <div>
          <span>local models</span>
          <strong>{snapshot.localModels.length}</strong>
        </div>
        <div>
          <span>memento</span>
          <strong className={statusTone(snapshot.memorySyncStatus)}>{snapshot.memorySyncStatus}</strong>
        </div>
        <div>
          <span>client outbox</span>
          <strong>{clientOutbox}</strong>
        </div>
        <div>
          <span>heartbeat</span>
          <strong>{snapshot.recentError ?? "connected"}</strong>
        </div>
      </div>
    </section>
  );
}

function OperationsRailPanel({
  backupSnapshot,
  ingressSnapshot,
  onCheckProviderVault,
  onExportBackup,
  onImportTelegram,
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
}: {
  backupSnapshot: Stage7BackupSnapshot;
  ingressSnapshot: Stage8IngressSnapshot;
  onCheckProviderVault: () => void;
  onExportBackup: () => void;
  onImportTelegram: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
}) {
  return (
    <section className="mini-panel rail-panel ops-rail-panel">
      <header>
        <ShieldCheck size={16} />
        <span>Ops</span>
        <div className="rail-action-row">
          <button className="rail-icon-button" onClick={onImportTelegram} title="Import Telegram" type="button">
            <Smartphone size={13} />
          </button>
          <button className="rail-icon-button" onClick={onExportBackup} title="Export Backup" type="button">
            <Archive size={13} />
          </button>
          <button className="rail-icon-button" onClick={onCheckProviderVault} title="Check Provider Vault" type="button">
            <KeyRound size={13} />
          </button>
        </div>
      </header>
      <div className="rail-stat-list">
        <div>
          <span>permission</span>
          <strong>{permissionSnapshot.summary.pending} pending</strong>
        </div>
        <div>
          <span>ingress</span>
          <strong>{ingressSnapshot.result.confidence} / {ingressSnapshot.result.approvalState}</strong>
        </div>
        <div>
          <span>backup</span>
          <strong>{backupSnapshot.summary.ready} ready / {backupSnapshot.summary.queued} queued</strong>
        </div>
        <div>
          <span>provider</span>
          <strong>{providerReadiness.status}</strong>
        </div>
        <div>
          <span>vault</span>
          <strong>{secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} available</strong>
        </div>
      </div>
    </section>
  );
}

function RuntimeStatusBar({
  onProbeDgx,
  providerName,
  snapshot,
}: {
  onProbeDgx: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
}) {
  const primaryNode = snapshot.runtimeNodes.find((node) => node.isPrimary);

  return (
    <header className="status-bar">
      <div className="status-meta">
        <span>Active: {providerName}</span>
        <span>{primaryNode?.label ?? snapshot.syncTopology.authorityLabel}: {snapshot.dgxStatus}</span>
        <span>Local: {snapshot.localModelStatus}</span>
        <span>{snapshot.recentError ?? "ready"}</span>
      </div>
      <button className="status-action" onClick={onProbeDgx} type="button">
        Probe DGX
      </button>
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

function agentRoleLabel(role: WorkbenchAgent["role"]) {
  const labels: Record<WorkbenchAgent["role"], string> = {
    architect: "설계자",
    auditor: "감사자",
    builder: "구현자",
    executor: "실행자",
    external: "외부 응대자",
    memory_curator: "기억 관리자",
    orchestrator: "지휘자",
    reviewer: "검토자",
    skeptic: "비판자",
    verifier: "검증자",
  };

  return labels[role];
}

function memoryLayerLabel(layer: MemoryRecord["layer"]) {
  const labels: Record<MemoryRecord["layer"], string> = {
    episode: "작업 에피소드",
    fragment: "짧은 기억",
    project_memory: "프로젝트 기억",
    reflection: "회고",
    user_memory: "사용자 기억",
  };

  return labels[layer];
}

function trustLevelLabel(trustLevel: MemoryRecord["trustLevel"]) {
  const labels: Record<MemoryRecord["trustLevel"], string> = {
    limited: "제한됨",
    trusted: "신뢰됨",
    untrusted: "격리됨",
  };

  return labels[trustLevel];
}

function recallReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    "blocked by provider trust policy": "프로바이더 신뢰 정책으로 보류됨",
    "low query overlap": "현재 작업과 관련도가 낮음",
    "provider pending: limited recall preview": "프로바이더가 정해지기 전이라 제한된 기억만 미리 봄",
    "provider trust allows automatic recall trace": "신뢰된 프로바이더라 관련 기억을 자동으로 불러옴",
    "query overlap and trust policy passed": "현재 작업과 관련 있고 신뢰 정책을 통과함",
    "untrusted provider: project/user memory requires explicit selection": "신뢰되지 않은 프로바이더는 프로젝트/사용자 기억을 자동으로 받지 않음",
    "untrusted memory is quarantined until pinned": "신뢰되지 않은 기억은 고정 전까지 격리됨",
  };

  return labels[reason] ?? reason;
}

function ConversationWorkbench({
  agents,
  draftMessage,
  messages,
  onBackupProjection,
  onCreateAgentRun,
  onCreateCodingPacket,
  onDraftMessageChange,
  onImportTelegram,
  onPromoteToDebate,
  onSelectAgent,
  onSendMessage,
  selectedAgent,
  selectedAgentId,
  selectedProvider,
}: {
  agents: WorkbenchAgent[];
  draftMessage: string;
  messages: ConversationMessage[];
  onBackupProjection: () => void;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onDraftMessageChange: (value: string) => void;
  onImportTelegram: () => void;
  onPromoteToDebate: () => void;
  onSelectAgent: (agentId: string) => void;
  onSendMessage: () => void;
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedProvider?: ProviderProfile;
}) {
  const authMode = selectedAgent?.authBinding?.mode ?? "provider_profile";
  const authLabel = selectedAgent?.authBinding?.label ?? "credential pending";

  return (
    <section className="workbench-panel">
      <header className="conversation-agent-bar">
        <div>
          <span>현재 대화 상대</span>
          <strong>{selectedAgent?.name ?? "봇 선택 필요"}</strong>
          <em>
            {selectedAgent?.role ?? "agent"} / {selectedProvider?.name ?? "provider pending"} /{" "}
            {selectedAgent?.modelId ?? selectedProvider?.defaultModel ?? "model pending"}
          </em>
        </div>
        <select
          aria-label="현재 대화 봇 선택"
          className="conversation-agent-select"
          onChange={(event) => onSelectAgent(event.target.value)}
          value={selectedAgentId ?? ""}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} / {agent.modelId ?? "model pending"}
            </option>
          ))}
        </select>
        <div className="credential-binding">
          <Link2 size={15} />
          <span>{authMode}</span>
          <strong>{authLabel}</strong>
        </div>
      </header>
      <div className="conversation-stream" aria-label="대화 기록" tabIndex={0}>
        {messages.map((message) => (
          <article className={`message ${message.role === "user" ? "user" : "assistant"}`} key={message.id}>
            <span>{messageLabel(message, selectedAgent)}</span>
            <p>{message.content}</p>
          </article>
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSendMessage();
        }}
      >
        <textarea
          aria-label="오케스트레이터에게 메시지 보내기"
          onChange={(event) => onDraftMessageChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSendMessage();
            }
          }}
          placeholder={`${selectedAgent?.name ?? "봇"}에게 말 걸기`}
          value={draftMessage}
        />
        <button className="primary-button" disabled={!draftMessage.trim() || !selectedAgent} type="submit">
          <Send size={16} />
          보내기
        </button>
      </form>
      <div className="action-strip">
        <button onClick={onPromoteToDebate} type="button">
          <GitBranch size={16} />
          토론 전환
        </button>
        <button onClick={onCreateCodingPacket} type="button">
          <Send size={16} />
          패킷 생성
        </button>
        <button onClick={onCreateAgentRun} type="button">
          <Play size={16} />
          실행 슬롯
        </button>
        <button onClick={onBackupProjection} type="button">
          <Archive size={16} />
          백업 상태
        </button>
        <button onClick={onImportTelegram} type="button">
          <Smartphone size={16} />
          Telegram
        </button>
      </div>
    </section>
  );
}

function messageLabel(message: ConversationMessage, selectedAgent?: WorkbenchAgent) {
  if (message.role === "user") {
    return "사용자";
  }

  const agentName = message.metadata?.agentName;
  if (typeof agentName === "string") {
    return agentName;
  }

  return selectedAgent?.name ?? "Assistant";
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

function Stage3DebateTable({
  onCreateCodingPacket,
  session,
}: {
  onCreateCodingPacket: () => void;
  session: Stage3DebateSession;
}) {
  const utterances = session.rounds.flatMap((round) =>
    round.utterances.map((utterance) => ({
      ...utterance,
      roundTitle: round.title,
      agentName: session.participants.find((participant) => participant.agentId === utterance.agentId)?.name ?? utterance.agentId,
    })),
  );

  return (
    <section className="debate-panel stage3">
      <header className="debate-context">
        <div>
          <span>Debate Context</span>
          <strong>{session.problem}</strong>
          <p>{session.summary}</p>
        </div>
        <button className="primary-button" onClick={onCreateCodingPacket} type="button">
          <Send size={15} />
          패킷 반영
        </button>
      </header>
      <div className="round-strip">
        {session.rounds.map((round) => (
          <span className={`round-chip ${round.status}`} key={round.id}>
            {round.title}
          </span>
        ))}
      </div>
      <div className="debate-workspace">
        <div className="debate-grid">
          {utterances.map((utterance) => (
            <article className="debate-card" key={utterance.id}>
              <header>
                <Bot size={16} />
                <strong>{utterance.agentName}</strong>
                <span>{utterance.roundTitle}</span>
              </header>
              <div className="debate-tags">
                {utterance.tags.map((tag) => (
                  <em className={`debate-tag ${tag}`} key={tag}>
                    {debateTagLabel(tag)}
                  </em>
                ))}
              </div>
              <p>{utterance.content}</p>
            </article>
          ))}
        </div>
        <aside className="human-peek-panel">
          <section>
            <header>
              <Activity size={15} />
              <strong>Status Hub</strong>
            </header>
            <div className="status-hub-grid">
              {session.statusHub.map((item) => (
                <div className={`status-hub-cell ${item.tone}`} key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
          <section>
            <header>
              <GitBranch size={15} />
              <strong>Human Peek</strong>
            </header>
            <div className="peek-list">
              {session.humanPeek.map((entry) => (
                <article className={`peek-row ${entry.state}`} key={entry.id}>
                  <span>{entry.kind}</span>
                  <strong>
                    {entry.actor} → {entry.target}
                  </strong>
                  <p>{entry.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function debateTagLabel(tag: DebateTag) {
  const labels: Record<DebateTag, string> = {
    agreement: "합의",
    objection: "반대",
    evidence: "근거",
    risk: "리스크",
    coding_impact: "코딩 영향",
  };

  return labels[tag];
}

function ProviderProfilesManagerPanel({
  modelCatalog,
  modelDiscoveryByProviderId,
  onAddProvider,
  onDiscoverModels,
  onRenameProvider,
  onRemoveProvider,
  profiles,
  usedProviderIds,
}: {
  modelCatalog: ModelCatalog;
  modelDiscoveryByProviderId: Record<string, ModelDiscoverySnapshot>;
  onAddProvider: () => void;
  onDiscoverModels: (providerId: string) => void;
  onRenameProvider: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  profiles: ProviderProfile[];
  usedProviderIds: Set<string>;
}) {
  return (
    <section className="side-panel">
      <header className="panel-title">
        <KeyRound size={17} />
        <h2>Provider Profiles</h2>
        <button aria-label="provider 추가" className="icon-button" onClick={onAddProvider} type="button">
          <Plus size={15} />
        </button>
      </header>
      <div className="provider-list">
        {profiles.map((profile) => {
          const isInUse = usedProviderIds.has(profile.id);
          const discovery = modelDiscoveryByProviderId[profile.id];
          const models = modelCatalog[profile.id] ?? [];
          return (
            <article className={`provider-row ${isInUse ? "in-use" : ""}`} key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <small className="provider-model-summary">
                  {models.length} models / {discovery?.status ?? "cached"} / {discovery?.source ?? "seed"}
                </small>
              </div>
              <span className={`trust ${profile.trustLevel}`}>{profile.trustLevel}</span>
              <div className="provider-actions">
                <button
                  aria-label={`${profile.name} model discovery`}
                  className="provider-discovery-button"
                  onClick={() => onDiscoverModels(profile.id)}
                  title="model discovery"
                  type="button"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  aria-label={`${profile.name} 이름 변경`}
                  className="provider-rename-button"
                  onClick={() => onRenameProvider(profile.id)}
                  title="provider 이름 변경"
                  type="button"
                >
                  <Pencil size={13} />
                </button>
                <button
                  aria-label={`${profile.name} 삭제`}
                  className="provider-remove-button"
                  disabled={isInUse || profiles.length <= 1}
                  onClick={() => onRemoveProvider(profile.id)}
                  title={isInUse ? "agent가 사용 중이라 삭제할 수 없음" : "provider 삭제"}
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AgentStatePanel({
  agents,
  agentActivityById,
  modelCatalog,
  modelWindowStartByAgentId,
  onAddAgent,
  onAssignModel,
  onAssignProvider,
  onRenameAgent,
  onRemoveAgent,
  onSelectAgent,
  onShiftModelWindow,
  profiles,
  selectedAgentId,
}: {
  agents: WorkbenchAgent[];
  agentActivityById: Record<string, AgentActivityStatus>;
  modelCatalog: ModelCatalog;
  modelWindowStartByAgentId: Record<string, number>;
  onAddAgent: () => void;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onRenameAgent: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onShiftModelWindow: (agentId: string, direction: -1 | 1) => void;
  profiles: ProviderProfile[];
  selectedAgentId?: string;
}) {
  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <Bot size={17} />
        <h2>Agents</h2>
        <button className="icon-button" onClick={onAddAgent} type="button" aria-label="봇 추가">
          <Plus size={15} />
        </button>
      </header>
      <div className="agent-list">
        {agents.map((agent) => {
          const activityStatus = agentActivityById[agent.id] ?? "idle";
          const providerModels = agent.providerProfileId ? (modelCatalog[agent.providerProfileId] ?? []) : [];
          const modelWindowStart = modelWindowStartByAgentId[agent.id] ?? 0;
          const visibleModels = providerModels.slice(modelWindowStart, modelWindowStart + modelWindowSize);
          const hasModelOverflow = providerModels.length > modelWindowSize;
          const canShiftModelsLeft = hasModelOverflow && modelWindowStart > 0;
          const canShiftModelsRight = hasModelOverflow && modelWindowStart + modelWindowSize < providerModels.length;
          const occupiedProviderIds = new Set(
            agents
              .filter((otherAgent) => otherAgent.id !== agent.id)
              .map((otherAgent) => otherAgent.providerProfileId)
              .filter((providerId): providerId is string => Boolean(providerId)),
          );
          const agentSummary = agentRoleLabel(agent.role);
          return (
            <div className={`agent-row ${agent.id === selectedAgentId ? "selected" : ""}`} key={agent.id}>
            <button className="agent-select-button" onClick={() => onSelectAgent(agent.id)} type="button">
              <span
                aria-label={`${agent.name} ${activityStatus}`}
                className={`agent-dot ${agent.enabled ? "enabled" : ""} ${activityStatus}`}
                title={activityStatus}
              />
              <strong>{agent.name}</strong>
              <span className="agent-summary-line" title={agentSummary}>
                {agentSummary}
              </span>
            </button>
            <button
              aria-label={`${agent.name} 이름 변경`}
              className="agent-rename-button"
              onClick={() => onRenameAgent(agent.id)}
              title="agent 이름 변경"
              type="button"
            >
              <Pencil size={14} />
            </button>
            <button
              aria-label={`${agent.name} 제거`}
              className="agent-remove-button"
              disabled={agents.length <= 1}
              onClick={() => onRemoveAgent(agent.id)}
              type="button"
            >
              <Trash2 size={14} />
            </button>
            <select
              aria-label={`${agent.name} provider 선택`}
              className="agent-provider-select"
              onChange={(event) => onAssignProvider(agent.id, event.target.value)}
              value={agent.providerProfileId ?? ""}
            >
              <option disabled value="">
                provider 선택
              </option>
              {profiles.map((profile) => {
                const isOccupied = occupiedProviderIds.has(profile.id);
                return (
                  <option disabled={isOccupied} key={profile.id} value={profile.id}>
                    {profile.name}{isOccupied ? " (in use)" : ""}
                  </option>
                );
              })}
            </select>
            <div className="agent-model-row">
              <button
                aria-label={`${agent.name} model 이전`}
                className="model-shift-button"
                disabled={!canShiftModelsLeft}
                onClick={() => onShiftModelWindow(agent.id, -1)}
                type="button"
              >
                <ChevronLeft size={14} />
              </button>
              <select
                aria-label={`${agent.name} model 선택`}
                className="agent-model-select"
                disabled={providerModels.length === 0}
                onChange={(event) => onAssignModel(agent.id, event.target.value)}
                value={agent.modelId ?? visibleModels[0]?.id ?? ""}
              >
                {visibleModels.length === 0 ? (
                  <option value="">model pending</option>
                ) : null}
                {visibleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button
                aria-label={`${agent.name} model 다음`}
                className="model-shift-button"
                disabled={!canShiftModelsRight}
                onClick={() => onShiftModelWindow(agent.id, 1)}
                type="button"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MemoryInspectorPanel({
  inspector,
  onForget,
  onPin,
  onRemember,
}: {
  inspector: Stage6MemoryInspector;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
  onRemember: () => void;
}) {
  const visibleTrace = inspector.trace.results.slice(0, 4);
  const visibleRecords = inspector.records.slice(0, 5);

  return (
    <section className="side-panel memory-panel">
      <header className="panel-title">
        <Database size={17} />
        <h2>Memento</h2>
        <button aria-label="현재 맥락 기억" className="icon-button" onClick={onRemember} type="button">
          <Plus size={15} />
        </button>
      </header>
      <div className="memory-policy">
        <strong>{inspector.trace.policy.autoRecallAllowed ? "자동 불러오기" : "수동 불러오기"}</strong>
        <span>{recallReasonLabel(inspector.trace.policy.reason)}</span>
      </div>
      <div className="memory-stat-grid">
        <div>
          <span>기억</span>
          <strong>{inspector.records.length}</strong>
        </div>
        <div>
          <span>고정</span>
          <strong>{inspector.pinnedCount}</strong>
        </div>
        <div>
          <span>보류</span>
          <strong>{inspector.blockedCount}</strong>
        </div>
      </div>
      <div className="recall-trace-list" aria-label="Recall Trace">
        {visibleTrace.map((result) => (
          <article className={result.usedInDecision ? "used" : "blocked"} key={result.record.id}>
            <div>
              <strong>{result.record.title}</strong>
              <span>
                {memoryLayerLabel(result.record.layer)} / 관련도 {(result.score * 100).toFixed(0)}%
              </span>
            </div>
            <em>{result.usedInDecision ? "사용됨" : "보류"}</em>
            <p>{recallReasonLabel(result.reason)}</p>
          </article>
        ))}
      </div>
      <div className="memory-record-list" aria-label="Memory Records">
        {visibleRecords.map((record) => (
          <article key={record.id}>
            <div>
              <strong>{record.title}</strong>
              <span>
                {memoryLayerLabel(record.layer)} / {trustLevelLabel(record.trustLevel)}
              </span>
            </div>
            <button
              aria-label={`${record.title} 고정`}
              className={`icon-button tiny ${record.pinned ? "active" : ""}`}
              disabled={record.pinned}
              onClick={() => onPin(record.id)}
              type="button"
            >
              <CheckCircle2 size={13} />
            </button>
            <button
              aria-label={`${record.title} 삭제`}
              className="icon-button tiny"
              onClick={() => onForget(record.id)}
              type="button"
            >
              <Trash2 size={13} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function IngressGuardPanel({
  onImportTelegram,
  snapshot,
}: {
  onImportTelegram: () => void;
  snapshot: Stage8IngressSnapshot;
}) {
  const visibleSteps = snapshot.result.guardSteps.slice(0, 7);

  return (
    <section className="side-panel ingress-panel">
      <header className="panel-title">
        <RadioTower size={17} />
        <h2>Ingress Guard</h2>
        <button aria-label="Telegram 가져오기" className="icon-button" onClick={onImportTelegram} type="button">
          <Smartphone size={15} />
        </button>
      </header>
      <div className="ingress-summary">
        <div>
          <span>channel</span>
          <strong>{snapshot.channel}</strong>
        </div>
        <div>
          <span>confidence</span>
          <strong>{snapshot.result.confidence}</strong>
        </div>
        <div>
          <span>approval</span>
          <strong>{snapshot.result.approvalState}</strong>
        </div>
      </div>
      <div className="guard-step-list" aria-label="Ingress guard steps">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <em>{step.status}</em>
            <span>{step.reason}</span>
          </article>
        ))}
      </div>
      <div className="approval-queue-list">
        <span>Approval Queue</span>
        {snapshot.approvals.length === 0 ? (
          <strong>empty</strong>
        ) : (
          snapshot.approvals.map((approval) => (
            <article key={approval.id}>
              <strong>{approval.state}</strong>
              <em>{approval.permissions.join(", ")}</em>
            </article>
          ))
        )}
      </div>
      <div className="zero-token-note">
        <span>0-token safety</span>
        <strong>
          {snapshot.zeroTokenSafety.cadence} / pending {snapshot.zeroTokenSafety.pendingCount}
        </strong>
      </div>
    </section>
  );
}

function guardStepLabel(step: Stage8IngressSnapshot["result"]["guardSteps"][number]["name"]) {
  const labels: Record<Stage8IngressSnapshot["result"]["guardSteps"][number]["name"], string> = {
    shape_unification: "Shape",
    noise_filter: "Noise",
    self_response_prevention: "Self-loop",
    debounce: "Debounce",
    pii_secret_block: "PII/Secret",
    guard_logging: "Logging",
    checklist_injection: "Checklist",
  };

  return labels[step];
}

function BackupPanel({
  onExport,
  projectionPreview,
  projections,
  snapshot,
}: {
  onExport: () => void;
  projectionPreview: string;
  projections: BackupProjection[];
  snapshot: Stage7BackupSnapshot;
}) {
  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <ShieldCheck size={17} />
        <h2>Backup</h2>
        <button aria-label="backup projection 생성" className="icon-button" onClick={onExport} type="button">
          <Archive size={15} />
        </button>
      </header>
      <div className="backup-grid">
        {projections.map((projection) => (
          <div className="backup-cell" key={projection.id}>
            <span>{projection.target}</span>
            <strong>{projection.status}</strong>
          </div>
        ))}
      </div>
      <div className="backup-summary">
        <div>
          <span>ready</span>
          <strong>{snapshot.summary.ready}</strong>
        </div>
        <div>
          <span>queued</span>
          <strong>{snapshot.summary.queued}</strong>
        </div>
        <div>
          <span>redacted</span>
          <strong>{snapshot.summary.redacted}</strong>
        </div>
      </div>
      <div className="backup-artifact-list" aria-label="Backup artifacts">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <div>
              <strong>{artifact.title}</strong>
              <span>{artifact.destination}</span>
            </div>
            <em>{artifact.status}</em>
            <small>{artifact.format} / {artifact.byteLength} bytes</small>
          </article>
        ))}
      </div>
      <div className="mobile-policy-list">
        <span>Mobile</span>
        <strong>read / approve / stop / retry</strong>
        <em>terminal, secrets, merge/push denied</em>
      </div>
      <div className="backup-preview">
        <span>Obsidian projection</span>
        <strong>{projectionPreview ? `${projectionPreview.length} chars ready` : "not rendered"}</strong>
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

function TerminalDock({
  agentRun,
  dgxBridge,
  events,
  onApproveNext,
  onCheckProviderVault,
  onRejectNext,
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
  slots,
}: {
  agentRun: Stage4AgentRun;
  dgxBridge: Stage5DgxBridge;
  events: EventEnvelope[];
  onApproveNext: () => void;
  onCheckProviderVault: () => void;
  onRejectNext: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
  slots: TerminalSlot[];
}) {
  const visibleEvents = events.slice(0, 4);
  const pendingPermission = permissionSnapshot.queue[0];

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
        <article className="dgx-bridge-card">
          <header>
            <span>DGX Bridge</span>
            <em>{dgxBridge.heartbeat.status}</em>
          </header>
          <div className="bridge-card-grid">
            <p>
              <span>authority</span>
              <strong>{dgxBridge.authorityNodeId}</strong>
            </p>
            <p>
              <span>remote</span>
              <strong>{dgxBridge.response.status}</strong>
            </p>
            <p>
              <span>fallback</span>
              <strong>{dgxBridge.localFallbackEnabled ? dgxBridge.response.fallbackMode : "none"}</strong>
            </p>
            <p>
              <span>sync</span>
              <strong>{dgxBridge.syncMode}</strong>
            </p>
          </div>
        </article>
        <article className="agent-runtime-card">
          <header>
            <span>Agent Runtime</span>
            <em>{agentRun.status}</em>
          </header>
          <div className="runtime-card-grid">
            <p>
              <span>soul</span>
              <strong>{agentRun.soulSummary}</strong>
            </p>
            <p>
              <span>memento</span>
              <strong>{agentRun.recallTrace.length} recall / {agentRun.recallTrace.filter((trace) => trace.usedInDecision).length} used</strong>
            </p>
            <p>
              <span>verifier</span>
              <strong>{agentRun.verifier.status}</strong>
            </p>
            <p>
              <span>replay</span>
              <strong>{agentRun.replay.eventIds.length} events</strong>
            </p>
          </div>
        </article>
        <article className="permission-matrix-card">
          <header>
            <span>
              <LockKeyhole size={14} />
              Permission Matrix
            </span>
            <em>{permissionSnapshot.summary.pending} pending</em>
          </header>
          <div className="permission-summary-grid">
            <p>
              <span>allow</span>
              <strong>{permissionSnapshot.summary.allowed}</strong>
            </p>
            <p>
              <span>approved</span>
              <strong>{permissionSnapshot.summary.approved}</strong>
            </p>
            <p>
              <span>deny</span>
              <strong>{permissionSnapshot.summary.denied}</strong>
            </p>
          </div>
          <div className="permission-queue-preview">
            <span>{pendingPermission ? pendingPermission.summary : "queue empty"}</span>
            <small>{pendingPermission ? pendingPermission.permissions.join(", ") : "execution stays display-only"}</small>
          </div>
          <div className="permission-actions">
            <button disabled={!pendingPermission} onClick={onApproveNext} type="button">
              approve
            </button>
            <button disabled={!pendingPermission} onClick={onRejectNext} type="button">
              reject
            </button>
          </div>
        </article>
        <article className="secret-vault-card">
          <header>
            <span>
              <KeyRound size={14} />
              Provider Vault
            </span>
            <em>{providerReadiness.status}</em>
          </header>
          <div className="vault-summary-grid">
            <p>
              <span>secret</span>
              <strong>{providerReadiness.secretAvailability}</strong>
            </p>
            <p>
              <span>models</span>
              <strong>{providerReadiness.modelCount}</strong>
            </p>
            <p>
              <span>memory</span>
              <strong>{providerReadiness.canUseAutomaticMemory ? "auto" : "manual"}</strong>
            </p>
          </div>
          <div className="vault-preview">
            <span>{providerReadiness.reason}</span>
            <small>
              vault {secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} available · raw persisted: no
            </small>
          </div>
          <div className="permission-actions">
            <button onClick={onCheckProviderVault} type="button">
              check
            </button>
          </div>
        </article>
        <article className="event-log">
          <header>
            <Activity size={15} />
            <span>이벤트 저장소</span>
          </header>
          <div className="event-log-list">
            {visibleEvents.map((event) => (
              <p key={event.id}>
                <span>{event.type}</span>
                <small>{new Date(event.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small>
              </p>
            ))}
          </div>
        </article>
      </div>
    </footer>
  );
}
