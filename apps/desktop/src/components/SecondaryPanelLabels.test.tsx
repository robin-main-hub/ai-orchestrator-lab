import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfile, CodingPacket, ConversationMessage, EventEnvelope } from "@ai-orchestrator/protocol";
import { createStage4AgentRun } from "../runtime/stage4Runtime";
import { createStage6MemoryInspector } from "../runtime/stage6Memory";
import { createExternalIngressDemoInput, createStage8IngressSnapshot } from "../runtime/stage8Ingress";
import type { WorkbenchAgent } from "../types";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import { AutonomySlider } from "./AutonomySlider";
import { CodingPacketPanel } from "./CodingPacketPanel";
import { IngressGuardPanel } from "./IngressGuardPanel";
import { ProjectRailPanel } from "./ProjectRailPanel";
import { TerminalDock } from "./TerminalDock";

const packet: CodingPacket = {
  constraints: ["비밀값 원문 저장 금지"],
  context: ["대화에서 토론으로 승격"],
  decisions: ["작업 영수증을 남긴다"],
  filesToInspect: ["apps/desktop/src/App.tsx"],
  goal: "보조 패널 한국어화",
  implementationPlan: ["라벨 정리", "테스트 추가"],
  rejectedOptions: ["영어 표면 방치"],
  reviewerNotes: ["사용자 화면 기준"],
  verificationPlan: ["typecheck", "test"],
};

const agent: WorkbenchAgent = {
  configSource: "internal",
  enabled: true,
  id: "agent_orchestrator",
  kind: "virtual",
  name: "마키마",
  permissionLevel: "read_only",
  role: "orchestrator",
  soulMode: "summary",
};

const agents: AgentProfile[] = [agent];

const messages: ConversationMessage[] = [
  {
    content: "한국어 라벨 확인",
    createdAt: "2026-06-06T00:00:00.000Z",
    id: "message_1",
    role: "user",
    sessionId: "session_desktop_001",
  },
];

const events: EventEnvelope[] = [
  {
    createdAt: "2026-06-06T00:00:00.000Z",
    id: "event_1",
    payload: {},
    redacted: false,
    sessionId: "session_desktop_001",
    source: "desktop",
    sourceTrust: "trusted",
    type: "coding_packet.created",
  },
];

describe("secondary panel labels", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("uses Korean labels in agent settings and autonomy controls", () => {
    const html = renderToStaticMarkup(
      <>
        <AgentSettingsPanel
          agent={agent}
          onClearAvatar={vi.fn()}
          onClose={vi.fn()}
          onUpdateAgent={vi.fn()}
          onUploadAvatar={vi.fn()}
          visual={{}}
        />
        <AutonomySlider initialLevel={3} />
      </>,
    );

    expect(html).toContain("에이전트 설정");
    expect(html).toContain("역할 선택");
    expect(html).toContain("제안만");
    expect(html).not.toContain("Agent Settings");
    expect(html).not.toContain("Agent profile settings");
    expect(html).not.toContain("Suggest only");
    expect(html).not.toContain("Execute with approval");
  });

  it("uses Korean labels in project, ingress, terminal, and coding packet panels", () => {
    const agentRun = createStage4AgentRun({
      agents,
      createdAt: "2026-06-06T00:00:00.000Z",
      events,
      messages,
      packet,
      primaryAgent: agent,
    });
    const memoryInspector = createStage6MemoryInspector({
      events,
      messages,
      packet,
      records: [],
    });
    const ingressSnapshot = createStage8IngressSnapshot({
      ...createExternalIngressDemoInput("2026-06-06T00:00:00.000Z"),
      channel: "api",
    });

    const html = renderToStaticMarkup(
      <>
        <ProjectRailPanel
          agentRun={agentRun}
          branchExperiments={[]}
          eventCount={events.length}
          insightFindings={[]}
          memoryInspector={memoryInspector}
          metaOnboardingSignals={[]}
          onCreateAgentRun={vi.fn()}
          onCreateCodingPacket={vi.fn()}
          onRunMetaOnboarding={vi.fn()}
          packet={packet}
          reviewMode="quick"
          sessionId="session_desktop_001"
        />
        <IngressGuardPanel onImportExternalIngress={vi.fn()} snapshot={ingressSnapshot} />
        <TerminalDock
          agentRun={agentRun}
          dgxBridge={{
            authorityNodeId: "dgx-02",
            heartbeat: { checkedAt: "2026-06-06T00:00:00.000Z", latencyMs: 12, status: "connected" },
            localFallbackEnabled: false,
            response: { fallbackMode: "none", status: "ready" },
            syncMode: "mirror",
          } as never}
          events={events}
          eventSyncState={{
            lastSyncedAt: "2026-06-06T00:00:00.000Z",
            outboxCount: 0,
            serverRevision: 1,
            status: "synced",
          }}
          onApproveNext={vi.fn()}
          onCheckProviderVault={vi.fn()}
          onRejectNext={vi.fn()}
          onReplayEvents={vi.fn()}
          onSyncEvents={vi.fn()}
          permissionSnapshot={{
            allowedOrigins: [],
            auditLog: [],
            queue: [],
            summary: { allowed: 1, approved: 0, denied: 0, expired: 0, pending: 0, required: 0 },
          } as never}
          providerReadiness={{
            canUseAutomaticMemory: true,
            modelCount: 1,
            reason: "준비됨",
            secretAvailability: "available",
            status: "ready",
          } as never}
          secretVaultSnapshot={{ entries: [], summary: { available: 0, missing: 0, total: 0 } } as never}
          slots={[]}
        />
        <CodingPacketPanel
          insightFindings={[]}
          onReviewModeChange={vi.fn()}
          packet={packet}
          reviewMode="quick"
        />
      </>,
    );

    expect(html).toContain("프로젝트");
    expect(html).toContain("개요");
    expect(html).toContain("인입 보호");
    expect(html).toContain("터미널 / 실행 로그");
    expect(html).toContain("코딩 패킷");
    expect(html).toContain("리뷰");
    expect(html).not.toContain("Project");
    expect(html).not.toContain("Overview");
    expect(html).not.toContain("Ingress Guard");
    expect(html).not.toContain("Terminal / Run Log");
    expect(html).not.toContain("Coding Packet");
    expect(html).not.toContain("Review");
  });
});
