import { describe, expect, it } from "vitest";
import type { CodingPacket, EventEnvelope, PermissionMatrixSnapshot, ConversationMessage } from "@ai-orchestrator/protocol";
import { createStage6MemoryInspector } from "../runtime/stage6Memory";
import { createInsightFindings, createMetaOnboardingSignals } from "./workbenchDerived";
import { createProductionSmokePlan } from "./productionSmokePlan";
import { createSettingsDiagnostics } from "./settingsDiagnostics";

const packet: CodingPacket = {
  constraints: ["운영 표면은 한국어로 표시"],
  context: ["protocol 경계 확인"],
  decisions: ["진단 문구를 한국어로 표시"],
  filesToInspect: ["apps/desktop/src/lib/workbenchDerived.ts"],
  goal: "운영 진단 문구 한국어화",
  implementationPlan: ["테스트", "라벨 교체"],
  rejectedOptions: ["영어 진단 유지"],
  reviewerNotes: ["사용자 표면 기준"],
  verificationPlan: ["typecheck", "test"],
};

const messages: ConversationMessage[] = [
  {
    content: "운영 진단 확인",
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
    type: "runtime.ready",
  },
];

const permissionSnapshot = {
  summary: { pending: 2 },
} as PermissionMatrixSnapshot;

describe("operational copy labels", () => {
  it("uses Korean labels in production smoke and settings diagnostics", () => {
    const smokeLabels = createProductionSmokePlan({
      includeLiveProvider: true,
      includeVisual: true,
    }).items.map((item) => item.label).join("\n");
    const settingsLabels = createSettingsDiagnostics({
      agentCount: 3,
      enabledProviderCount: 1,
      memoryAdapterStatus: "ready",
      providerSmokeReadyCount: 1,
      runtimeStatus: "online",
      workerCount: 3,
    }).items.map((item) => item.label).join("\n");

    expect(smokeLabels).toContain("작업 대기열 레인 동작");
    expect(smokeLabels).toContain("토론 결정에서 코딩 패킷 생성");
    expect(smokeLabels).toContain("프로바이더 대체 경로와 실제 호출");
    expect(settingsLabels).toContain("프로바이더 호출 점검 1개 준비");
    expect(settingsLabels).toContain("런타임 온라인");
    expect(smokeLabels + settingsLabels).not.toContain("pending");
    expect(smokeLabels + settingsLabels).not.toContain("Control Queue");
    expect(smokeLabels + settingsLabels).not.toContain("Provider smoke");
    expect(smokeLabels + settingsLabels).not.toContain("Runtime online");
  });

  it("uses Korean labels in workbench insight findings", () => {
    const memoryInspector = createStage6MemoryInspector({
      events,
      messages,
      packet,
      records: [],
    });
    const labels = createInsightFindings({
      eventCount: 1,
      memoryInspector,
      packet,
      permissionSnapshot,
      providerReadiness: { status: "ready" } as never,
    }).map((finding) => finding.label).join("\n");

    expect(labels).toContain("이벤트 1개");
    expect(labels).toContain("검증 2개");
    expect(labels).toContain("프로토콜 경계");
    expect(labels).toContain("승인 대기 2건");
    expect(labels).not.toContain("events");
    expect(labels).not.toContain("checks");
    expect(labels).not.toContain("pending");
    expect(labels).not.toContain("protocol boundary");
  });

  it("uses Korean count labels in meta onboarding signals", () => {
    const signals = createMetaOnboardingSignals({
      agents: [],
      models: {
        provider_a: [
          { id: "model_a", label: "A", providerId: "provider_a" },
          { id: "model_b", label: "B", providerId: "provider_a" },
        ],
      } as never,
      providers: [{ id: "provider_a" }, { id: "provider_b" }] as never,
      runtime: {
        dgxStatus: "offline",
        localModelStatus: "online",
      } as never,
    });
    const labels = signals.map((signal) => signal.suggestion).join("\n");

    expect(labels).toContain("공급자 2개 / 모델 2개");
    expect(labels).not.toContain("providers");
    expect(labels).not.toContain("models");
  });
});
