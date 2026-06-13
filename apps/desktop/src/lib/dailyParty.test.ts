import { describe, expect, it } from "vitest";
import type { CodexEntry } from "./personaCodex";
import { selectDailyParty } from "./dailyParty";

const codex: CodexEntry[] = Array.from({ length: 8 }, (_, i) => ({
  personaName: `p${i}`,
  displayName: `이름${i}`,
  role: "companion",
  caption: `한 줄 ${i}`,
}));

describe("selectDailyParty", () => {
  it("rotates with the date seed (different day → different recommendation)", () => {
    const a = selectDailyParty({ codex, dateSeed: "2026-06-13", size: 3 }).map((m) => m.personaName);
    const b = selectDailyParty({ codex, dateSeed: "2026-06-14", size: 3 }).map((m) => m.personaName);
    expect(a).not.toEqual(b);
    // same day → stable
    expect(selectDailyParty({ codex, dateSeed: "2026-06-13", size: 3 }).map((m) => m.personaName)).toEqual(a);
  });

  it("puts active (hermes-bound) and recent personas first, with reasons", () => {
    const party = selectDailyParty({
      codex,
      boundPersonaNames: ["p5"],
      recentPersonaNames: ["p2"],
      dateSeed: "2026-06-13",
      size: 3,
    });
    expect(party[0]).toMatchObject({ personaName: "p5", reason: "오늘 활성" });
    expect(party[1]).toMatchObject({ personaName: "p2", reason: "최근 작전" });
    expect(party[2]?.reason).toBe("오늘의 추천");
  });

  it("dedupes and respects size", () => {
    const party = selectDailyParty({
      codex,
      boundPersonaNames: ["p1", "p1"],
      recentPersonaNames: ["p1"],
      dateSeed: "x",
      size: 2,
    });
    expect(party).toHaveLength(2);
    expect(party.filter((m) => m.personaName === "p1")).toHaveLength(1);
  });

  it("carries the codex caption as the tagline", () => {
    const party = selectDailyParty({ codex, dateSeed: "2026-06-13", size: 1 });
    expect(party[0]?.tagline).toMatch(/^한 줄 /);
  });

  it("returns empty for an empty codex", () => {
    expect(selectDailyParty({ codex: [], dateSeed: "x" })).toEqual([]);
  });
});
