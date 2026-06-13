import { describe, expect, it } from "vitest";
import { modelContextCharBudget, PROVIDER_MESSAGE_CHAR_CAP } from "./contextBudget";

describe("modelContextCharBudget — 모델 인지 입력 예산", () => {
  it("모델 미상이면 넉넉한 floor(과도 클램프 방지)", () => {
    expect(modelContextCharBudget(undefined)).toBe(48_000);
    expect(modelContextCharBudget({ contextWindow: 0 })).toBe(48_000);
  });

  it("작은 윈도우 모델은 윈도우를 넘지 않게 비례 축소", () => {
    // 8K 토큰 모델 → 0.3 * 8000 * 3.5 = 8400 chars (윈도우보다 작음)
    expect(modelContextCharBudget({ contextWindow: 8_000 })).toBe(8_400);
  });

  it("큰 컨텍스트 모델은 크게 — 단 provider 200K 한도 아래로 cap", () => {
    // 1M 토큰 → 비례값은 크지만 180K로 cap
    expect(modelContextCharBudget({ contextWindow: 1_000_000 })).toBe(180_000);
    expect(modelContextCharBudget({ contextWindow: 1_000_000 })).toBeLessThan(PROVIDER_MESSAGE_CHAR_CAP);
  });

  it("200K 토큰 모델은 충분히 크다(수만~십수만 chars)", () => {
    const budget = modelContextCharBudget({ contextWindow: 200_000 });
    expect(budget).toBeGreaterThan(48_000);
    expect(budget).toBeLessThanOrEqual(180_000);
  });

  it("옵션으로 fraction/floor/cap 조정 가능", () => {
    expect(modelContextCharBudget(undefined, { floorChars: 24_000 })).toBe(24_000);
    expect(modelContextCharBudget({ contextWindow: 1_000_000 }, { capChars: 90_000 })).toBe(90_000);
  });
});
