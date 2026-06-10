import { describe, expect, it } from "vitest";
import { codexByPaneRole, unmatchedCodex } from "./personaPaneRoster";

describe("codexByPaneRole", () => {
  it("groups every matchable character under its pane workstation", () => {
    const byPane = codexByPaneRole();
    const names = (role: keyof ReturnType<typeof codexByPaneRole>) =>
      (byPane[role] ?? []).map((entry) => entry.displayName);

    // 지휘 pane: 마키마(지휘) + 쿠루미(본체/만능)
    expect(names("orchestrator")).toEqual(expect.arrayContaining(["마키마", "토키사키 쿠루미"]));
    // 검증/보안 pane: 카구야·아스카·크리스·유노·요하네
    expect(names("qa")).toEqual(
      expect.arrayContaining(["시노미야 카구야", "아스카 랑그레이", "마키세 크리스", "가사이 유노", "츠시마 요시코"]),
    );
    expect(names("code")).toEqual(expect.arrayContaining(["히라사와 유이", "렘"]));
    expect(names("research")).toEqual(expect.arrayContaining(["마오마오", "헤르타"]));
    expect(names("memory")).toEqual(["아야나미 레이"]);
    expect(names("status")).toEqual(["프리렌"]);
    expect(names("architect")).toEqual(["오시노 시노부"]);
  });

  it("leaves the unmatched four untouched for manual placement later", () => {
    const names = unmatchedCodex().map((entry) => entry.displayName);
    expect(names.sort()).toEqual(["C.C.", "니코 로빈", "스파클", "카츠라기 미사토"].sort());
  });

  it("matched + unmatched covers the whole 18-character codex exactly once", () => {
    const matched = Object.values(codexByPaneRole()).flat().length;
    expect(matched + unmatchedCodex().length).toBe(18);
  });
});
