import { describe, expect, it } from "vitest";
import { operatorCockpitActionLabels } from "./actionLabels";

describe("operatorCockpitActionLabels", () => {
  it("keeps all cockpit action labels explicit and unique", () => {
    const labels = Object.values(operatorCockpitActionLabels);

    expect(labels).toEqual([
      "기억 근거 열기",
      "모델 경로 열기",
      "복구 상태 열기",
      "승인 근거 미리보기",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
