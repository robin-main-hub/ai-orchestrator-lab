import { describe, expect, it } from "vitest";
import { operatorCockpitActionLabels } from "./actionLabels";

describe("operatorCockpitActionLabels", () => {
  it("keeps all cockpit action labels explicit and unique", () => {
    const labels = Object.values(operatorCockpitActionLabels);

    expect(labels).toEqual([
      "Memory Recall 열기",
      "Provider Routing 열기",
      "Recovery & Continuity 열기",
      "Approval Evidence 미리보기",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
