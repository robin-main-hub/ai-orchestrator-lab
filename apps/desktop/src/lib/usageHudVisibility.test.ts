import { describe, expect, it } from "vitest";
import { shouldShowUsageHud } from "./usageHudVisibility";

const NOW = 1_000_000;

describe("shouldShowUsageHud", () => {
  it("턴이 없으면 숨김", () => {
    expect(shouldShowUsageHud({ activity: "idle", contextPercent: 0, now: NOW, turns: 0 })).toBe(false);
  });

  it("턴 진행 중이면 표시", () => {
    expect(shouldShowUsageHud({ activity: "responding", contextPercent: 30, now: NOW, turns: 3 })).toBe(true);
    expect(shouldShowUsageHud({ activity: "tooling", contextPercent: 30, now: NOW, turns: 3 })).toBe(true);
    expect(shouldShowUsageHud({ activity: "capturing", contextPercent: 30, now: NOW, turns: 1 })).toBe(true);
  });

  it("idle이어도 컨텍스트 80% 이상이면 표시(경고)", () => {
    expect(shouldShowUsageHud({ activity: "idle", contextPercent: 85, now: NOW, turns: 5 })).toBe(true);
  });

  it("idle + 저컨텍스트 + 타임스탬프 없음이면 숨김", () => {
    expect(shouldShowUsageHud({ activity: "idle", contextPercent: 30, now: NOW, turns: 4 })).toBe(false);
  });

  it("lastTurnCompletedAt 잔상: 5초 이내 표시, 이후 숨김", () => {
    expect(shouldShowUsageHud({ activity: "idle", contextPercent: 30, lastTurnCompletedAt: NOW - 3_000, now: NOW, turns: 2 })).toBe(true);
    expect(shouldShowUsageHud({ activity: "idle", contextPercent: 30, lastTurnCompletedAt: NOW - 6_000, now: NOW, turns: 2 })).toBe(false);
  });
});
