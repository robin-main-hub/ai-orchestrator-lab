import { describe, expect, it } from "vitest";
import {
  badgeColorForApproval,
  badgeColorForCost,
  badgeColorForFallback,
  badgeColorForMirror,
  badgeColorForOutbox,
  badgeColorForPayload,
  badgeColorForSpeed,
  badgeColorForStatus,
  badgeColorForTrust,
  compactId,
  formatClock,
  initials,
} from "./presentation";

// Characterization tests for the operator-cockpit presentation helpers that
// the existing presentation.test.ts leaves uncovered (no behavior change):
// the nine badgeColorFor* status→BadgeColor decision trees, compactId,
// initials, and formatClock's NaN-guard. All are pure — the module imports
// only protocol types, no React, no DOM, no network. We pin each decision-tree
// branch (including the default/else arm) and the deterministic string-shaping
// branches. formatClock's valid-input path goes through toLocaleTimeString,
// which is locale/timezone-dependent, so we only pin its NaN-guard
// (invalid → verbatim) and that a valid input yields a non-empty string.

describe("badgeColorFor* decision trees", () => {
  it("badgeColorForStatus", () => {
    expect(badgeColorForStatus("working")).toBe("green");
    expect(badgeColorForStatus("waiting_approval")).toBe("yellow");
    expect(badgeColorForStatus("blocked")).toBe("red");
    expect(badgeColorForStatus("error")).toBe("red");
    expect(badgeColorForStatus("idle")).toBe("gray");
  });

  it("badgeColorForPayload", () => {
    expect(badgeColorForPayload("bound")).toBe("green");
    expect(badgeColorForPayload("expired")).toBe("red");
    expect(badgeColorForPayload("unbound")).toBe("yellow");
  });

  it("badgeColorForApproval", () => {
    expect(badgeColorForApproval("approved")).toBe("green");
    expect(badgeColorForApproval("not_required")).toBe("green");
    expect(badgeColorForApproval("required")).toBe("yellow");
    expect(badgeColorForApproval("rejected")).toBe("red");
    expect(badgeColorForApproval("expired")).toBe("red");
  });

  it("badgeColorForMirror", () => {
    expect(badgeColorForMirror("healthy")).toBe("green");
    expect(badgeColorForMirror("degraded")).toBe("yellow");
    expect(badgeColorForMirror("disconnected")).toBe("red");
  });

  it("badgeColorForFallback", () => {
    expect(badgeColorForFallback("available")).toBe("green");
    expect(badgeColorForFallback("active")).toBe("yellow");
    expect(badgeColorForFallback("none")).toBe("gray");
  });

  it("badgeColorForCost", () => {
    expect(badgeColorForCost("low")).toBe("green");
    expect(badgeColorForCost("medium")).toBe("yellow");
    expect(badgeColorForCost("high")).toBe("red");
  });

  it("badgeColorForSpeed", () => {
    expect(badgeColorForSpeed("fast")).toBe("green");
    expect(badgeColorForSpeed("average")).toBe("yellow");
    expect(badgeColorForSpeed("slow")).toBe("red");
  });

  it("badgeColorForTrust", () => {
    expect(badgeColorForTrust("trusted")).toBe("green");
    expect(badgeColorForTrust("limited")).toBe("yellow");
    expect(badgeColorForTrust("untrusted")).toBe("red");
  });

  it("badgeColorForOutbox", () => {
    expect(badgeColorForOutbox("synced")).toBe("green");
    expect(badgeColorForOutbox("pending")).toBe("yellow");
    expect(badgeColorForOutbox("failed")).toBe("red");
  });
});

describe("compactId", () => {
  it("returns short values verbatim and truncates long ones with the default keep=6", () => {
    // threshold is keep*2+3 = 15: <= 15 chars is returned as-is.
    expect(compactId("short")).toBe("short");
    expect(compactId("123456789012345")).toBe("123456789012345"); // exactly 15
    expect(compactId("12345678901234567890")).toBe("123456...567890"); // 20 → first6...last6
  });

  it("honours a custom keep width", () => {
    // threshold becomes 3*2+3 = 9.
    expect(compactId("123456789", 3)).toBe("123456789"); // exactly 9
    expect(compactId("12345678901234", 3)).toBe("123...234"); // 14 → first3...last3
  });
});

describe("initials", () => {
  it("derives uppercase initials from the first two whitespace/_/- separated tokens", () => {
    expect(initials("alice bob")).toBe("AB");
    expect(initials("memory_curator")).toBe("MC");
    expect(initials("front-end")).toBe("FE");
  });

  it("uses the first two letters when there is a single token", () => {
    expect(initials("alice")).toBe("AL");
    expect(initials("x")).toBe("X");
  });

  it("returns an empty string for an empty value", () => {
    expect(initials("")).toBe("");
  });
});

describe("formatClock", () => {
  it("returns the raw value verbatim when it is not a parseable date", () => {
    expect(formatClock("not-a-date")).toBe("not-a-date");
    expect(formatClock("")).toBe("");
  });

  it("renders a non-empty string for a valid ISO timestamp", () => {
    const out = formatClock("2026-06-20T08:30:00.000Z");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe("2026-06-20T08:30:00.000Z");
  });
});
