import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import type { CockpitNextActionItem } from "./cockpitNextActions";
import {
  COCKPIT_HEALTH_LABEL,
  deriveCockpitHealthFromSnapshot,
  deriveCockpitHealthRollup,
} from "./cockpitHealthRollup";

function action(priority: CockpitNextActionItem["priority"], id = priority): CockpitNextActionItem {
  return {
    ctaLabel: "처리",
    id,
    label: `${priority} 액션`,
    priority,
    source: "approval",
    targetSurface: "approvals",
  };
}

const base = {
  blockedCount: 0,
  approvalCount: 0,
  criticalApprovalCount: 0,
  fallbackActive: false,
  dgxMirrorOffline: false,
  nextActions: [] as CockpitNextActionItem[],
};

describe("deriveCockpitHealthRollup", () => {
  it("green when nothing needs attention", () => {
    const rollup = deriveCockpitHealthRollup(base);
    expect(rollup.level).toBe("green");
    expect(rollup.signalSummary).toBe("신호 없음");
    expect(rollup.pendingCount).toBe(0);
    expect(COCKPIT_HEALTH_LABEL[rollup.level]).toBe("정상");
  });

  it("red when a worker is blocked, with a headline that names it", () => {
    const rollup = deriveCockpitHealthRollup({ ...base, blockedCount: 2 });
    expect(rollup.level).toBe("red");
    expect(rollup.headline).toContain("2건 차단");
    expect(rollup.signalSummary).toContain("차단 2");
  });

  it("red on a high-priority action even without blocked workers", () => {
    const rollup = deriveCockpitHealthRollup({ ...base, nextActions: [action("high")] });
    expect(rollup.level).toBe("red");
    expect(rollup.topAction?.priority).toBe("high");
  });

  it("red on a critical approval or an offline DGX mirror", () => {
    expect(deriveCockpitHealthRollup({ ...base, criticalApprovalCount: 1 }).level).toBe("red");
    expect(deriveCockpitHealthRollup({ ...base, dgxMirrorOffline: true }).level).toBe("red");
  });

  it("yellow on pending approvals or active fallback (no red signals)", () => {
    expect(deriveCockpitHealthRollup({ ...base, approvalCount: 3 }).level).toBe("yellow");
    expect(deriveCockpitHealthRollup({ ...base, fallbackActive: true }).level).toBe("yellow");
  });

  it("picks the most urgent action (high over warning over normal) as topAction", () => {
    const rollup = deriveCockpitHealthRollup({
      ...base,
      blockedCount: 1,
      nextActions: [action("normal"), action("warning"), action("high")],
    });
    expect(rollup.topAction?.priority).toBe("high");
  });

  it("summarizes multiple signals compactly", () => {
    const rollup = deriveCockpitHealthRollup({ ...base, blockedCount: 1, approvalCount: 2, fallbackActive: true });
    expect(rollup.signalSummary).toBe("차단 1 · 승인 2 · 폴백 활성");
    expect(rollup.pendingCount).toBe(4);
  });
});

describe("deriveCockpitHealthFromSnapshot", () => {
  function snapshot(overrides: {
    fleet?: Array<{ status: string }>;
    approvals?: Array<{ securityRisk: string }>;
    fallbackStatus?: string;
    dgxMirrorHealth?: string;
  }): OperatorCockpitSnapshot {
    return {
      fleet: overrides.fleet ?? [],
      approvals: overrides.approvals ?? [],
      routing: { fallbackStatus: overrides.fallbackStatus ?? "inactive" },
      memory: { dgxMirrorHealth: overrides.dgxMirrorHealth ?? "healthy" },
    } as unknown as OperatorCockpitSnapshot;
  }

  it("derives the same red signal the cockpit shows from a snapshot (blocked worker)", () => {
    const rollup = deriveCockpitHealthFromSnapshot(
      snapshot({ fleet: [{ status: "blocked" }, { status: "working" }] }),
      [],
    );
    expect(rollup.level).toBe("red");
    expect(rollup.signalSummary).toContain("차단 1");
  });

  it("counts approvals and flags high-risk ones as red, plain ones as yellow", () => {
    expect(
      deriveCockpitHealthFromSnapshot(snapshot({ approvals: [{ securityRisk: "low" }] }), []).level,
    ).toBe("yellow");
    expect(
      deriveCockpitHealthFromSnapshot(snapshot({ approvals: [{ securityRisk: "high" }] }), []).level,
    ).toBe("red");
  });

  it("maps fallback active and disconnected DGX mirror to their signals", () => {
    expect(deriveCockpitHealthFromSnapshot(snapshot({ fallbackStatus: "active" }), []).level).toBe("yellow");
    expect(deriveCockpitHealthFromSnapshot(snapshot({ dgxMirrorHealth: "disconnected" }), []).level).toBe("red");
  });

  it("is green on a clean snapshot", () => {
    expect(deriveCockpitHealthFromSnapshot(snapshot({}), []).level).toBe("green");
  });
});
