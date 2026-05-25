import { describe, expect, it } from "vitest";
import {
  debateMockDataset,
  debateMockScenarios,
  debateMockScenariosByCategory,
  debateMockTotalUtterances,
  findDebateMockScenario,
} from "./debateMockData";

/*
 * Lock the dataset's shape contract. If 니뭉 (or anyone) regenerates the
 * yaml, these tests catch silent drift in:
 *   - scenario count
 *   - tag enum (a typo'd tag would break debate-mode UI rendering)
 *   - speaker enum (must match agents/<dir>/ names exactly)
 *   - category distribution (Manus prompt promised 10/10/10/5/5/5/3/2)
 *   - safety contract (REFLECORE pseudonym + no real corp names)
 */

const VALID_TAGS = new Set([
  "agreement",
  "objection",
  "evidence",
  "risk",
  "coding_impact",
]);

const VALID_SPEAKERS = new Set([
  "orchestrator",
  "architect",
  "builder",
  "reviewer",
  "skeptic",
  "verifier",
  "memory_curator",
  "executor",
  "external",
  "auditor",
  "researcher",
  "negotiator",
  "risk_officer",
  "mediator",
  "watchdog",
  "domain_expert",
  "yohane",
]);

describe("debateMockDataset", () => {
  it("ships 50 scenarios", () => {
    expect(debateMockScenarios.length).toBe(50);
  });

  it("uses the REFLECORE alias and ko language", () => {
    expect(debateMockDataset.projectAlias).toBe("REFLECORE");
    expect(debateMockDataset.language).toBe("ko");
  });

  it("matches the promised category distribution", () => {
    expect(debateMockDataset.categoryDistribution).toMatchObject({
      product: 10,
      b2b: 10,
      code: 10,
      risk: 5,
      operations: 5,
      meta: 5,
      companion_delegation: 3,
      daily: 2,
    });

    const actual: Record<string, number> = {};
    for (const s of debateMockScenarios) {
      actual[s.category] = (actual[s.category] ?? 0) + 1;
    }
    expect(actual).toEqual(debateMockDataset.categoryDistribution);
  });

  it("every utterance tag is in the closed 5-tag enum", () => {
    for (const scenario of debateMockScenarios) {
      for (const utt of scenario.rounds) {
        expect(VALID_TAGS.has(utt.tag)).toBe(true);
      }
    }
  });

  it("every speaker maps to an agents/<dir>/ directory name", () => {
    for (const scenario of debateMockScenarios) {
      for (const utt of scenario.rounds) {
        expect(VALID_SPEAKERS.has(utt.speaker)).toBe(true);
      }
      for (const participant of scenario.participants) {
        expect(VALID_SPEAKERS.has(participant)).toBe(true);
      }
    }
  });

  it("round numbers are positive integers within 1..10", () => {
    for (const scenario of debateMockScenarios) {
      for (const utt of scenario.rounds) {
        expect(Number.isInteger(utt.round)).toBe(true);
        expect(utt.round).toBeGreaterThanOrEqual(1);
        expect(utt.round).toBeLessThanOrEqual(10);
      }
    }
  });

  it("ids are unique", () => {
    const ids = debateMockScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("safety contract — no real company / user names leak through", () => {
    // 회사 본명 / 사용자 본명이 fixture에 새지 않았는지. REFLECORE 가명만 허용.
    // Example Domain는 README/SAFETY 룰에서 "이 이름 노출 금지" 명시 컨텍스트에서만
    // 등장 — debate mock 본문에는 절대 들어가면 안 됨.
    const forbidden = ["Example Domain", "기올라이트", "지올라이트"];
    for (const scenario of debateMockScenarios) {
      const blob = [scenario.topic, scenario.context, scenario.expectedResolution]
        .concat(scenario.rounds.map((r) => r.text))
        .join(" ");
      for (const term of forbidden) {
        expect(blob.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  it("safety contract — no API key / OAuth token patterns", () => {
    const tokenPatterns = [
      /sk-[A-Za-z0-9]{16,}/,
      /sk-ant-[A-Za-z0-9-]{16,}/,
      /Bearer\s+[A-Z][A-Za-z0-9._-]{16,}/,
    ];
    for (const scenario of debateMockScenarios) {
      const blob = scenario.rounds.map((r) => r.text).join(" ");
      for (const re of tokenPatterns) {
        expect(blob).not.toMatch(re);
      }
    }
  });

  it("debateMockTotalUtterances matches sum of rounds", () => {
    const sum = debateMockScenarios.reduce((acc, s) => acc + s.rounds.length, 0);
    expect(debateMockTotalUtterances).toBe(sum);
    expect(debateMockTotalUtterances).toBeGreaterThan(0);
  });
});

describe("debateMockScenariosByCategory", () => {
  it("returns all scenarios when no category is passed", () => {
    expect(debateMockScenariosByCategory().length).toBe(50);
  });

  it("filters by a single category", () => {
    const product = debateMockScenariosByCategory("product");
    expect(product.length).toBe(10);
    for (const s of product) expect(s.category).toBe("product");
  });

  it("filters by multiple categories (union)", () => {
    const merged = debateMockScenariosByCategory("companion_delegation", "daily");
    // distribution says 3 + 2 = 5
    expect(merged.length).toBe(5);
  });

  it("preserves source order", () => {
    const all = debateMockScenariosByCategory();
    const byId = all.map((s) => s.id);
    const reSliced = debateMockScenariosByCategory("product", "b2b", "code");
    const reSlicedIds = reSliced.map((s) => s.id);
    // each reSliced id should appear in the all-array in the same order
    let cursor = -1;
    for (const id of reSlicedIds) {
      const next = byId.indexOf(id, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });
});

describe("findDebateMockScenario", () => {
  it("returns the scenario for a known id", () => {
    const first = debateMockScenarios[0]!;
    expect(findDebateMockScenario(first.id)).toBe(first);
  });

  it("returns undefined for an unknown id", () => {
    expect(findDebateMockScenario("debate_999")).toBeUndefined();
  });
});
