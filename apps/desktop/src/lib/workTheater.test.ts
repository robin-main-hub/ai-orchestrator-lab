import { describe, expect, it } from "vitest";
import {
  deriveTheaterRows,
  stageStateAt,
  summarizeTheater,
  THEATER_STAGES,
  theaterStageForStatus,
} from "./workTheater";
import type { MakimaDelegationCard } from "./makimaDelegation";
import type { WorkbenchAgent } from "../types";

function card(id: string, name: string, role: string): MakimaDelegationCard {
  return {
    id: `card_${id}`,
    targetAgentId: id,
    targetAgentName: name,
    targetRoleLabel: role,
    title: `${name}에게 구현 착수`,
    summary: "요약",
    toolLabel: "도구",
    toolPreview: [],
    targetSurface: "conversation",
    priority: "normal",
  };
}

const agents = [
  { id: "a1", name: "쿠루미", role: "verifier", personaName: "kurumi" },
] as unknown as WorkbenchAgent[];

describe("theaterStageForStatus", () => {
  it("상태를 6단계에 매핑", () => {
    expect(theaterStageForStatus("planned").index).toBe(1);
    expect(theaterStageForStatus("in_progress").index).toBe(2);
    expect(theaterStageForStatus("waiting_approval").index).toBe(4);
    expect(theaterStageForStatus("done").index).toBe(5);
    expect(theaterStageForStatus(undefined).index).toBe(0);
  });
  it("blocked는 막힘 플래그", () => {
    const s = theaterStageForStatus("blocked");
    expect(s.blocked).toBe(true);
    expect(s.index).toBe(2);
  });
});

describe("stageStateAt", () => {
  it("이전=done, 현재=active, 이후=pending", () => {
    expect(stageStateAt(0, 2, false)).toBe("done");
    expect(stageStateAt(2, 2, false)).toBe("active");
    expect(stageStateAt(3, 2, false)).toBe("pending");
  });
  it("마지막 단계 도달은 active가 아니라 done", () => {
    expect(stageStateAt(5, 5, false)).toBe("done");
  });
  it("막힌 현재 단계는 blocked", () => {
    expect(stageStateAt(2, 2, true)).toBe("blocked");
  });
});

describe("deriveTheaterRows", () => {
  it("카드+상태+초상화를 행으로 합치고 제목에서 이름 접두 제거", () => {
    const rows = deriveTheaterRows({
      cards: [card("a1", "쿠루미", "검증자")],
      assignmentsByAgentId: { a1: { lane: "auto", status: "in_progress", workItemId: "w1" } },
      agents,
      resolvePortrait: (persona, role) => (persona === "kurumi" ? "/k.png" : role ? `/r-${role}.png` : undefined),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.portraitUrl).toBe("/k.png");
    expect(rows[0]!.title).toBe("구현 착수");
    expect(rows[0]!.stageIndex).toBe(2);
    expect(rows[0]!.assigned).toBe(true);
  });

  it("assignment 없는 카드는 미배정·분류 단계", () => {
    const rows = deriveTheaterRows({
      cards: [card("a9", "유노", "감사")],
      agents,
      resolvePortrait: () => undefined,
    });
    expect(rows[0]!.assigned).toBe(false);
    expect(rows[0]!.stageIndex).toBe(0);
  });
});

describe("summarizeTheater", () => {
  it("출격/승인대기/완료/막힘 집계", () => {
    const rows = deriveTheaterRows({
      cards: [card("a1", "쿠", "r"), card("a2", "유", "r"), card("a3", "마", "r")],
      assignmentsByAgentId: {
        a1: { lane: "auto", status: "in_progress", workItemId: "w1" },
        a2: { lane: "auto", status: "waiting_approval", workItemId: "w2" },
        a3: { lane: "auto", status: "done", workItemId: "w3" },
      },
      agents,
      resolvePortrait: () => undefined,
    });
    const s = summarizeTheater(rows);
    expect(s.done).toBe(1);
    expect(s.awaitingApproval).toBe(1);
    // 출격 = in_progress 만(승인대기 행은 deployed에서 제외, done 제외) — 이중카운트 수정(§2.7)
    expect(s.deployed).toBe(1);
    expect(THEATER_STAGES).toHaveLength(6);
  });

  it("승인 대기 행은 deployed에 계상하지 않는다(이중카운트 회귀)", () => {
    const rows = deriveTheaterRows({
      cards: [card("a1", "쿠", "r")],
      assignmentsByAgentId: {
        a1: { lane: "auto", status: "waiting_approval", workItemId: "w1" },
      },
      agents,
      resolvePortrait: () => undefined,
    });
    const s = summarizeTheater(rows);
    expect(s.awaitingApproval).toBe(1);
    expect(s.deployed).toBe(0);
    expect(s.done).toBe(0);
    expect(s.blocked).toBe(0);
  });

  it("막힘 행은 여전히 deployed·blocked 동시 계상(막힘 계상 불변)", () => {
    const rows = deriveTheaterRows({
      cards: [card("a1", "쿠", "r")],
      assignmentsByAgentId: {
        a1: { lane: "auto", status: "blocked", workItemId: "w1" },
      },
      agents,
      resolvePortrait: () => undefined,
    });
    const s = summarizeTheater(rows);
    expect(s.blocked).toBe(1);
    expect(s.deployed).toBe(1); // 실행 중 막힘 — 출격 상태 유지
    expect(s.awaitingApproval).toBe(0);
  });
});
