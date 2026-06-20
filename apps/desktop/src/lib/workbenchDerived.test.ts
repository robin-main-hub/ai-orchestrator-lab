import { describe, expect, it } from "vitest";
import type {
  CodingPacket,
  InsightFinding,
  PermissionMatrixSnapshot,
  ProviderProfile,
  ProviderRuntimeReadiness,
  RuntimeSnapshot,
  WorkItem,
} from "@ai-orchestrator/protocol";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import type { MetaOnboardingSignal, ModelCatalog, WorkbenchAgent } from "../types";
import { createInsightFindings, createMetaOnboardingSignals, statusForWorkLane } from "./workbenchDerived";

function packet(over: Partial<CodingPacket> = {}): CodingPacket {
  return {
    goal: "g",
    context: [],
    decisions: [],
    rejectedOptions: [],
    constraints: [],
    filesToInspect: [],
    implementationPlan: [],
    verificationPlan: [],
    reviewerNotes: [],
    ...over,
  };
}

function inspector(resultCount: number): Stage6MemoryInspector {
  return { trace: { results: Array.from({ length: resultCount }, () => ({})) } } as unknown as Stage6MemoryInspector;
}

function permission(pending: number): PermissionMatrixSnapshot {
  return { summary: { pending } } as unknown as PermissionMatrixSnapshot;
}

function readiness(status: string): ProviderRuntimeReadiness {
  return { status } as unknown as ProviderRuntimeReadiness;
}

function byId(findings: InsightFinding[], id: string): InsightFinding {
  const found = findings.find((finding) => finding.id === id);
  if (!found) throw new Error(`missing finding ${id}`);
  return found;
}

function metaById(signals: MetaOnboardingSignal[], id: string): MetaOnboardingSignal {
  const found = signals.find((signal) => signal.id === id);
  if (!found) throw new Error(`missing signal ${id}`);
  return found;
}

// Characterization tests for the workbench derived-signal projections (no behavior
// change). statusForWorkLane is a fixed lane→status map with a triaged fallback;
// createInsightFindings and createMetaOnboardingSignals fold snapshot counts/flags
// into six insight rows and three onboarding rows. These pin the lane map + guard
// fallback, each insight row's ok/watch/quick_win threshold and label
// interpolation, and each onboarding row's ready/partial/blocked rule plus its
// suggestion text. All pure; heavy snapshot types are minimally faked.
describe("statusForWorkLane", () => {
  it("maps each known lane to its status", () => {
    expect(statusForWorkLane("auto")).toBe("running");
    expect(statusForWorkLane("check")).toBe("drafted");
    expect(statusForWorkLane("ask")).toBe("waiting_input");
    expect(statusForWorkLane("approve")).toBe("waiting_approval");
    expect(statusForWorkLane("blocked")).toBe("blocked");
  });

  it("falls back to triaged for an unmapped lane (runtime guard)", () => {
    expect(statusForWorkLane("mystery" as WorkItem["lane"])).toBe("triaged");
  });
});

describe("createInsightFindings", () => {
  it("emits the healthy side of every threshold", () => {
    const findings = createInsightFindings({
      eventCount: 4,
      memoryInspector: inspector(3),
      packet: packet({
        verificationPlan: ["a", "b"],
        context: ["uses Protocol boundary"],
        rejectedOptions: ["dropped option"],
      }),
      permissionSnapshot: permission(0),
      providerReadiness: readiness("ready"),
    });
    expect(byId(findings, "insight_stability").status).toBe("ok");
    expect(byId(findings, "insight_stability").label).toBe("이벤트 4개");
    expect(byId(findings, "insight_testing").status).toBe("ok");
    expect(byId(findings, "insight_architecture").status).toBe("ok");
    expect(byId(findings, "insight_performance").status).toBe("ok");
    expect(byId(findings, "insight_security").status).toBe("ok");
    expect(byId(findings, "insight_tech_debt").status).toBe("ok");
  });

  it("emits the watch / quick_win side of every threshold", () => {
    const findings = createInsightFindings({
      eventCount: 0,
      memoryInspector: inspector(6),
      packet: packet({ verificationPlan: ["only one"], context: ["no boundary terms"], rejectedOptions: [] }),
      permissionSnapshot: permission(2),
      providerReadiness: readiness("ready"),
    });
    expect(byId(findings, "insight_stability").status).toBe("watch");
    expect(byId(findings, "insight_testing").status).toBe("quick_win");
    expect(byId(findings, "insight_architecture").status).toBe("watch");
    expect(byId(findings, "insight_performance").status).toBe("watch");
    expect(byId(findings, "insight_security").status).toBe("watch");
    expect(byId(findings, "insight_security").label).toBe("승인 대기 2건");
    expect(byId(findings, "insight_tech_debt").status).toBe("quick_win");
  });

  it("flags security on a blocked provider even with zero pending approvals", () => {
    const findings = createInsightFindings({
      eventCount: 1,
      memoryInspector: inspector(0),
      packet: packet(),
      permissionSnapshot: permission(0),
      providerReadiness: readiness("blocked"),
    });
    expect(byId(findings, "insight_security").status).toBe("watch");
  });

  it("matches the protocol architecture term case-insensitively", () => {
    const findings = createInsightFindings({
      eventCount: 1,
      memoryInspector: inspector(0),
      packet: packet({ context: ["PROTOCOL types pinned"] }),
      permissionSnapshot: permission(0),
      providerReadiness: readiness("ready"),
    });
    expect(byId(findings, "insight_architecture").status).toBe("ok");
  });
});

describe("createMetaOnboardingSignals", () => {
  const agents = (roles: string[]): WorkbenchAgent[] =>
    roles.map((role) => ({ role })) as unknown as WorkbenchAgent[];
  const providers = (count: number): ProviderProfile[] =>
    Array.from({ length: count }, () => ({})) as unknown as ProviderProfile[];
  const runtime = (over: Record<string, unknown>): RuntimeSnapshot => over as unknown as RuntimeSnapshot;

  it("reports the ready side of every onboarding rule", () => {
    const signals = createMetaOnboardingSignals({
      agents: agents(["verifier", "memory_curator"]),
      models: { p1: [{}, {}, {}] as never, p2: [{}, {}] as never } as unknown as ModelCatalog,
      providers: providers(3),
      runtime: runtime({ dgxStatus: "online", localModelStatus: "offline" }),
    });
    expect(metaById(signals, "meta_roles").status).toBe("ready");
    expect(metaById(signals, "meta_roles").suggestion).toBe("검증 역할 있음");
    expect(metaById(signals, "meta_engines").status).toBe("ready");
    expect(metaById(signals, "meta_engines").suggestion).toBe("공급자 3개 / 모델 5개");
    expect(metaById(signals, "meta_runtime").status).toBe("ready");
    expect(metaById(signals, "meta_runtime").suggestion).toBe("DGX-02 사용 가능");
  });

  it("reports partial roles when memory_curator is missing but keeps the verifier suggestion", () => {
    const signals = createMetaOnboardingSignals({
      agents: agents(["verifier"]),
      models: {} as unknown as ModelCatalog,
      providers: providers(2),
      runtime: runtime({ dgxStatus: "offline", localModelStatus: "offline" }),
    });
    expect(metaById(signals, "meta_roles").status).toBe("partial");
    expect(metaById(signals, "meta_roles").suggestion).toBe("검증 역할 있음");
    expect(metaById(signals, "meta_engines").status).toBe("partial");
    expect(metaById(signals, "meta_engines").suggestion).toBe("공급자 2개 / 모델 0개");
    expect(metaById(signals, "meta_runtime").status).toBe("blocked");
    expect(metaById(signals, "meta_runtime").suggestion).toBe("로컬 폴백 중심");
  });

  it("treats local-model online as a ready runtime even when DGX is offline", () => {
    const signals = createMetaOnboardingSignals({
      agents: agents([]),
      models: {} as unknown as ModelCatalog,
      providers: providers(0),
      runtime: runtime({ dgxStatus: "offline", localModelStatus: "online" }),
    });
    expect(metaById(signals, "meta_runtime").status).toBe("ready");
    // suggestion keys on dgxStatus, not the local fallback that flipped it ready
    expect(metaById(signals, "meta_runtime").suggestion).toBe("로컬 폴백 중심");
    expect(metaById(signals, "meta_roles").suggestion).toBe("검증 역할 추가 추천");
  });
});
