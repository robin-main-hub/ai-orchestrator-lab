import { describe, expect, it } from "vitest";
import {
  buildResearchNote,
  combineResearchReport,
  RESEARCH_NOTE_ROOT,
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

// Characterization tests (no behavior change) for the security-relevant escalation
// branches of safeHeredocMarker and the RESEARCH_NOTE_ROOT prefix contract — neither
// pinned above. The existing safeHeredocMarker case only asserts the returned marker
// is absent from the content; it never pins WHICH marker comes back, so the whole
// escalation ladder is untested: the no-collision passthrough, the salted form built
// from the sanitized seed, the second-collision `salt += "X"` step, and the empty-seed
// `|| "X"` fallback. This matters because the marker terminates a heredoc — a marker
// that secretly appears in the body would let body text break out of the heredoc, so
// the collision avoidance is a safety boundary, not cosmetics. RESEARCH_NOTE_ROOT is
// likewise the load-bearing write-path prefix (every accepted note path must live under
// it); we pin that safeNotePath always emits exactly that root, derived from the const.
describe("safeHeredocMarker (escalation ladder)", () => {
  it("returns the bare default marker when the body does not contain it", () => {
    expect(safeHeredocMarker("clean body, no marker here", "seed1")).toBe("__ORCH_NOTE__");
  });

  it("escalates to a salted marker built from the sanitized seed on a default collision", () => {
    const marker = safeHeredocMarker("x __ORCH_NOTE__ y", "seed1");
    expect(marker).toBe("__ORCH_NOTE_seed1__");
    expect("x __ORCH_NOTE__ y".includes(marker)).toBe(false);
  });

  it("escalates again (salt += 'X') when the salted marker also collides", () => {
    // body contains BOTH the default and the first salted marker → loop runs twice
    const body = "__ORCH_NOTE__ and __ORCH_NOTE_AB__";
    const marker = safeHeredocMarker(body, "AB!@#"); // non-alnum stripped → salt "AB"
    expect(marker).toBe("__ORCH_NOTE_ABX__");
    expect(body.includes(marker)).toBe(false);
  });

  it("falls back to the 'X' salt when the seed sanitizes to empty", () => {
    expect(safeHeredocMarker("has __ORCH_NOTE__ here", "!!!")).toBe("__ORCH_NOTE_X__");
  });

  it("clamps the salt to the first 6 alphanumerics of the seed", () => {
    expect(safeHeredocMarker("has __ORCH_NOTE__ here", "abcdefghXYZ")).toBe("__ORCH_NOTE_abcdef__");
  });
});

describe("RESEARCH_NOTE_ROOT (write-path prefix contract)", () => {
  it("is the 'research' root and every accepted path lives directly under it", () => {
    expect(RESEARCH_NOTE_ROOT).toBe("research");
    const ok = safeNotePath("research/sub/dir/note.md");
    // derived from the const so a root rename can't silently let writes escape the folder
    expect(ok).toEqual({ ok: true, path: `${RESEARCH_NOTE_ROOT}/note.md` });
    if (ok.ok) {
      expect(ok.path.startsWith(`${RESEARCH_NOTE_ROOT}/`)).toBe(true);
      expect(ok.path.endsWith(".md")).toBe(true);
    }
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
