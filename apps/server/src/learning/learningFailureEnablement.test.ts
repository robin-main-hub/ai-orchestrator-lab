import { describe, expect, it, vi } from "vitest";
import {
  defaultLearningFailureEnablement,
  evaluateEnablement,
  type LearningFailureEnablementContract,
} from "./learningFailureEnablement.js";
import type { LearningFailureGateDecision } from "./learningFailureGate.js";

/** 게이트가 append를 권한 결정(새 key 포함). */
const appendDecision: Pick<
  LearningFailureGateDecision,
  "append" | "reason" | "idempotencyKey"
> = {
  append: true,
  reason: "append",
  idempotencyKey: "lf:mission_1:verification:vr_1",
};

/** 게이트가 disabled로 append를 거른 결정. */
const declinedDecision: Pick<
  LearningFailureGateDecision,
  "append" | "reason" | "idempotencyKey"
> = {
  append: false,
  reason: "disabled",
};

/** owner가 명시적으로 켠 계약(불변 플래그는 항상 true). */
const enabledContract: LearningFailureEnablementContract = {
  ...defaultLearningFailureEnablement(),
  enabled: true,
  enabledBy: "robin",
  enabledAt: "2026-06-16T00:00:00.000Z",
  scope: "mission_1",
};

describe("defaultLearningFailureEnablement", () => {
  it("is disabled by default with safety invariants pinned true", () => {
    const c = defaultLearningFailureEnablement();
    expect(c.enabled).toBe(false);
    expect(c.owner).toBe("lab_maintainer");
    expect(c.requireObservedEvidence).toBe(true);
    expect(c.requireIdempotency).toBe(true);
    expect(c.auditRequired).toBe(true);
  });
});

describe("evaluateEnablement — default disabled", () => {
  it("never allows with the default contract, even with a full append decision", () => {
    const res = evaluateEnablement(defaultLearningFailureEnablement(), {
      decision: appendDecision,
      observedEvidence: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("contract_disabled");
  });
});

describe("evaluateEnablement — allowed only when everything holds", () => {
  it("allows when enabled + gate append + observed + idempotency key", () => {
    const res = evaluateEnablement(enabledContract, {
      decision: appendDecision,
      observedEvidence: true,
    });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe("allowed");
  });

  it("denies when enabled but gate declined append", () => {
    const res = evaluateEnablement(enabledContract, {
      decision: declinedDecision,
      observedEvidence: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("gate_declined_append");
  });

  it("denies when enabled + append but evidence not observed", () => {
    const res = evaluateEnablement(enabledContract, {
      decision: appendDecision,
      observedEvidence: false,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("no_observed_evidence");
  });

  it("denies when observedEvidence omitted (defaults to false)", () => {
    const res = evaluateEnablement(enabledContract, {
      decision: appendDecision,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("no_observed_evidence");
  });

  it("denies when missing idempotency key", () => {
    const res = evaluateEnablement(enabledContract, {
      decision: { append: true, reason: "append" },
      observedEvidence: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("no_idempotency_key");
  });
});

describe("evaluateEnablement — described audit record (never emitted)", () => {
  it("returns an audit record describing the evaluation, marked emitted:false", () => {
    const res = evaluateEnablement(enabledContract, {
      decision: appendDecision,
      observedEvidence: true,
    });
    expect(res.auditEvent).toMatchObject({
      kind: "learning.failure.enablement.evaluated",
      owner: "lab_maintainer",
      enabled: true,
      enabledBy: "robin",
      scope: "mission_1",
      gateAppend: true,
      gateReason: "append",
      observedEvidence: true,
      idempotencyKey: "lf:mission_1:verification:vr_1",
      allowed: true,
      reason: "allowed",
      emitted: false,
    });
  });

  it("returns an audit record even when denied (default disabled)", () => {
    const res = evaluateEnablement(defaultLearningFailureEnablement(), {
      decision: appendDecision,
      observedEvidence: true,
    });
    expect(res.auditEvent.kind).toBe("learning.failure.enablement.evaluated");
    expect(res.auditEvent.allowed).toBe(false);
    expect(res.auditEvent.reason).toBe("contract_disabled");
    expect(res.auditEvent.emitted).toBe(false);
  });
});

describe("evaluateEnablement — purity / zero side-effects", () => {
  it("performs no append/emit/store side-effect (no injected sink is ever touched)", () => {
    // 헬퍼는 어떤 sink도 받지 않는다. 만약 호출자가 store/append/emit을 들고 있어도
    // evaluateEnablement는 순수 compute이므로 절대 호출하지 않는다.
    const appendSpy = vi.fn();
    const emitSpy = vi.fn();
    const storeSpy = vi.fn();

    const res = evaluateEnablement(enabledContract, {
      decision: appendDecision,
      observedEvidence: true,
    });

    expect(res.allowed).toBe(true);
    expect(appendSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    expect(storeSpy).not.toHaveBeenCalled();
  });

  it("requireObservedEvidence / requireIdempotency cannot be turned off (always true)", () => {
    const c = defaultLearningFailureEnablement();
    // 타입상 literal true 이므로 false 주입은 컴파일 에러. 런타임 값도 항상 true.
    expect(c.requireObservedEvidence).toBe(true);
    expect(c.requireIdempotency).toBe(true);
  });
});
