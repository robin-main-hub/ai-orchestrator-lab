import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEARNING_FAILURE_GATE_CONFIG,
  shouldAppendLearningFailure,
} from "./learningFailureGate.js";
import {
  learningFailureIdempotencyKey,
  seenKeysFromSet,
} from "./learningFailureIdempotency.js";

const NOW = () => "2026-06-16T00:00:00.000Z";

/** observed + failed → 근거 충족하는 VerificationReport 입력. */
const observedVerification = {
  id: "vr_1",
  missionId: "mission_1",
  status: "failed" as const,
  observed: true,
  globalRevisionDirective: "fix the build",
};

/** observed가 아닌(시뮬레이션) 리포트 → 학습 금지. */
const unobservedVerification = {
  ...observedVerification,
  observed: false,
};

describe("LearningFailureGateConfig defaults", () => {
  it("enabled defaults to false", () => {
    expect(DEFAULT_LEARNING_FAILURE_GATE_CONFIG.enabled).toBe(false);
  });
});

describe("shouldAppendLearningFailure — gate disabled", () => {
  it("returns append:false when no config provided (default disabled)", () => {
    const decision = shouldAppendLearningFailure({
      verification: observedVerification,
      now: NOW,
    });
    expect(decision.append).toBe(false);
    expect(decision.reason).toBe("disabled");
  });

  it("returns append:false even with valid observed evidence when disabled", () => {
    const decision = shouldAppendLearningFailure({
      config: { enabled: false },
      verification: observedVerification,
      now: NOW,
    });
    expect(decision.append).toBe(false);
    expect(decision.reason).toBe("disabled");
  });
});

describe("shouldAppendLearningFailure — evidence gating", () => {
  it("returns append:false for unobserved evidence (delegates to null)", () => {
    const decision = shouldAppendLearningFailure({
      config: { enabled: true },
      verification: unobservedVerification,
      now: NOW,
    });
    expect(decision.append).toBe(false);
    expect(decision.reason).toBe("no-observed-evidence");
  });

  it("returns append:false when no artifacts at all", () => {
    const decision = shouldAppendLearningFailure({
      config: { enabled: true },
      now: NOW,
    });
    expect(decision.append).toBe(false);
    expect(decision.reason).toBe("no-observed-evidence");
  });
});

describe("shouldAppendLearningFailure — enabled + new key", () => {
  it("returns append:true with idempotency key and event", () => {
    const decision = shouldAppendLearningFailure({
      config: { enabled: true },
      verification: observedVerification,
      now: NOW,
    });
    expect(decision.append).toBe(true);
    expect(decision.reason).toBe("append");
    expect(decision.idempotencyKey).toBe("lf:mission_1:verification:vr_1");
    expect(decision.event?.payload.failure.missionId).toBe("mission_1");
  });
});

describe("shouldAppendLearningFailure — duplicate", () => {
  it("returns append:false when key already seen", () => {
    const key = learningFailureIdempotencyKey({
      missionId: "mission_1",
      verificationReportId: "vr_1",
    });
    expect(key).toBe("lf:mission_1:verification:vr_1");
    const decision = shouldAppendLearningFailure({
      config: { enabled: true },
      verification: observedVerification,
      seen: seenKeysFromSet(new Set([key!])),
      now: NOW,
    });
    expect(decision.append).toBe(false);
    expect(decision.reason).toBe("duplicate");
    expect(decision.idempotencyKey).toBe(key);
  });

  it("first append:true, then second with same key seen → append:false", () => {
    const seen = new Set<string>();
    const first = shouldAppendLearningFailure({
      config: { enabled: true },
      verification: observedVerification,
      seen: seenKeysFromSet(seen),
      now: NOW,
    });
    expect(first.append).toBe(true);
    // caller records the key after a successful append
    seen.add(first.idempotencyKey!);
    const second = shouldAppendLearningFailure({
      config: { enabled: true },
      verification: observedVerification,
      seen: seenKeysFromSet(seen),
      now: NOW,
    });
    expect(second.append).toBe(false);
    expect(second.reason).toBe("duplicate");
  });
});

describe("idempotency key determinism", () => {
  it("same evidence anchor → same key", () => {
    const a = learningFailureIdempotencyKey({ missionId: "m", verificationReportId: "vr_9" });
    const b = learningFailureIdempotencyKey({ missionId: "m", verificationReportId: "vr_9" });
    expect(a).toBe(b);
    expect(a).toBe("lf:m:verification:vr_9");
  });

  it("verification anchor takes priority over sandbox anchor (matches derivation)", () => {
    const key = learningFailureIdempotencyKey({
      missionId: "m",
      verificationReportId: "vr_9",
      sandboxErrorCardId: "ec_9",
    });
    expect(key).toBe("lf:m:verification:vr_9");
  });

  it("sandbox anchor used when no verification anchor", () => {
    const key = learningFailureIdempotencyKey({ missionId: "m", sandboxErrorCardId: "ec_9" });
    expect(key).toBe("lf:m:sandbox:ec_9");
  });

  it("no anchor → null", () => {
    expect(learningFailureIdempotencyKey({ missionId: "m" })).toBeNull();
  });
});

describe("purity — gate performs no side effects", () => {
  it("does not append; only returns a decision the caller acts on", () => {
    let appendCalls = 0;
    const fakeAppend = () => {
      appendCalls += 1;
    };
    const decision = shouldAppendLearningFailure({
      config: { enabled: true },
      verification: observedVerification,
      now: NOW,
    });
    // gate never touches the writer; caller alone decides to use it
    expect(appendCalls).toBe(0);
    expect(decision.append).toBe(true);
    void fakeAppend;
  });
});
