import type { ApprovalReplayKind, PermissionAction } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  controlQueueActionLabel,
  controlQueueReplayLabel,
  controlQueueSourceTrustLabel,
  controlQueueSourceTrustVariant,
  formatControlQueueTokenEstimate,
} from "./controlQueuePresentation";

// Characterization tests for the five controlQueuePresentation meta helpers
// the existing controlQueuePresentation.test.ts leaves uncovered (no behavior
// change). All are pure: the module imports only protocol types + a pure
// redaction helper, no React/DOM/network. We pin the absent-input guards, the
// tabled-label hits, the `?? value.replaceAll("_", " ")` snake-case fallbacks,
// the source-trust → variant decision tree, the replay manual-vs-tabled split,
// and the token-estimate rounding boundary.

describe("controlQueueActionLabel", () => {
  it("returns the undecided placeholder for an absent action", () => {
    expect(controlQueueActionLabel(undefined)).toBe("실행 미정");
  });

  it("maps a tabled action to its Korean label", () => {
    expect(controlQueueActionLabel("git_push")).toBe("Git Push");
    expect(controlQueueActionLabel("deploy")).toBe("배포");
    expect(controlQueueActionLabel("terminal_run")).toBe("터미널 실행");
  });

  it("falls back to a de-underscored action for an untabled action", () => {
    expect(controlQueueActionLabel("some_new_effect" as PermissionAction)).toBe("some new effect");
  });
});

describe("controlQueueSourceTrustLabel", () => {
  it("returns the undecided placeholder for an absent trust", () => {
    expect(controlQueueSourceTrustLabel(undefined)).toBe("신뢰 미정");
  });

  it("maps each trust level to its Korean label", () => {
    expect(controlQueueSourceTrustLabel("trusted")).toBe("신뢰됨");
    expect(controlQueueSourceTrustLabel("limited")).toBe("제한됨");
    expect(controlQueueSourceTrustLabel("untrusted")).toBe("비신뢰");
  });
});

describe("controlQueueSourceTrustVariant", () => {
  it("maps each trust level to its meta variant and defaults to muted", () => {
    expect(controlQueueSourceTrustVariant("trusted")).toBe("success");
    expect(controlQueueSourceTrustVariant("limited")).toBe("warning");
    expect(controlQueueSourceTrustVariant("untrusted")).toBe("danger");
    expect(controlQueueSourceTrustVariant(undefined)).toBe("muted");
  });
});

describe("controlQueueReplayLabel", () => {
  it("returns the manual placeholder unless both replayKind and replayEndpoint are present", () => {
    expect(controlQueueReplayLabel({ replayKind: undefined, replayEndpoint: undefined })).toBe("수동 처리");
    expect(controlQueueReplayLabel({ replayKind: "tmux_dispatch", replayEndpoint: undefined })).toBe("수동 처리");
    expect(controlQueueReplayLabel({ replayKind: undefined, replayEndpoint: "https://x" })).toBe("수동 처리");
  });

  it("maps a tabled replay kind when both fields are present", () => {
    expect(controlQueueReplayLabel({ replayKind: "tmux_dispatch", replayEndpoint: "https://x" })).toBe("tmux 재전송");
    expect(controlQueueReplayLabel({ replayKind: "provider_completion", replayEndpoint: "https://x" })).toBe(
      "모델 재실행",
    );
  });

  it("falls back to a de-underscored kind for an untabled replay kind", () => {
    expect(
      controlQueueReplayLabel({ replayKind: "future_kind" as ApprovalReplayKind, replayEndpoint: "https://x" }),
    ).toBe("future kind");
  });
});

describe("formatControlQueueTokenEstimate", () => {
  it("returns the undecided placeholder for a non-number", () => {
    expect(formatControlQueueTokenEstimate(undefined)).toBe("토큰 미정");
  });

  it("renders sub-1000 estimates verbatim, including zero", () => {
    expect(formatControlQueueTokenEstimate(0)).toBe("0 tok");
    expect(formatControlQueueTokenEstimate(500)).toBe("500 tok");
    expect(formatControlQueueTokenEstimate(999)).toBe("999 tok");
  });

  it("rounds estimates of 1000+ to the nearest thousand", () => {
    expect(formatControlQueueTokenEstimate(1000)).toBe("1k tok");
    expect(formatControlQueueTokenEstimate(1499)).toBe("1k tok");
    expect(formatControlQueueTokenEstimate(1500)).toBe("2k tok");
  });
});
