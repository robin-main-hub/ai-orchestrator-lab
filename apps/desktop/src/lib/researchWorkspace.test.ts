import { describe, expect, it } from "vitest";
import {
  buildResearchNote,
  combineResearchReport,
  safeHeredocMarker,
  safeNotePath,
  slugifyNoteName,
} from "./researchWorkspace";

describe("safeNotePath (경로 인젝션/탈출 방어)", () => {
  it("research/ 아래 단일 .md 슬러그로 정규화", () => {
    expect(safeNotePath("opencode 정리")).toEqual({ ok: true, path: "research/opencode-정리.md" });
    expect(safeNotePath("research/sub/dir/note.md")).toEqual({ ok: true, path: "research/note.md" });
  });
  it("상위 탈출·절대경로·홈 경로를 거부", () => {
    expect(safeNotePath("../../etc/passwd").ok).toBe(false);
    expect(safeNotePath("/root/.ssh/id").ok).toBe(false);
    expect(safeNotePath("C:/Windows/x").ok).toBe(false);
    expect(safeNotePath("~/secret").ok).toBe(false);
    expect(safeNotePath("   ").ok).toBe(false);
  });
});

describe("slugifyNoteName", () => {
  it("위험문자 제거 + 길이 제한 + 빈값 폴백", () => {
    expect(slugifyNoteName('a"; rm -rf ~ #.md')).toBe("a-rm-rf");
    expect(slugifyNoteName("!!!")).toBe("note");
    expect(slugifyNoteName("x".repeat(100)).length).toBeLessThanOrEqual(64);
  });
});

describe("safeHeredocMarker", () => {
  it("본문에 등장하지 않는 마커를 만든다", () => {
    const marker = safeHeredocMarker("내용에 __ORCH_NOTE__ 가 들어있음", "seed1");
    expect("내용에 __ORCH_NOTE__ 가 들어있음".includes(marker)).toBe(false);
  });
});

describe("노트/보고서 빌더", () => {
  it("개별 노트에 임무·헤더 포함", () => {
    const note = buildResearchNote({ topic: "T", agentName: "마오마오", task: "검색", body: "본문", createdAt: "2026" });
    expect(note).toContain("# T — 마오마오 조사 노트");
    expect(note).toContain("임무: 검색");
  });
  it("합본 보고서에 목차 + 섹션", () => {
    const report = combineResearchReport({
      topic: "T",
      createdAt: "2026",
      sections: [
        { agentName: "A", task: "t1", body: "b1" },
        { agentName: "B", task: "t2", body: "b2" },
      ],
    });
    expect(report).toContain("## 목차");
    expect(report).toContain("1. A — t1");
    expect(report).toContain("## 2. B — t2");
  });
});
