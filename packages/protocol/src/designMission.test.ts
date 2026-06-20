import { describe, expect, it } from "vitest";
import type { DesignBlueprintInput } from "./designBlueprint.js";
import { buildMissionCreateFromBlueprint, DESIGN_TEAM } from "./designMission.js";

// designMission has no test today, yet buildMissionCreateFromBlueprint is the
// pure promotion seam DesignBlueprint → MissionCreateRequest. Two invariants
// here are authority-relevant: (1) least-privilege — workers carry ONLY a role
// (no permissionLevel/capability field is baked into the request; the comment
// is explicit that capability is recomputed server-side from the role), and the
// fixed DESIGN_TEAM ordering/slots are reproduced verbatim; (2) non-disclosure —
// the assembled goal ALWAYS ends with the "외부 발송 없음 — 시안/구현 draft만."
// honesty line, so a promoted design mission can never be read as an external
// send. Expected values are derived from DESIGN_TEAM + the same input (self-
// consistent), never hardcoded magic.

const input: DesignBlueprintInput = {
  title: "검색 결과 화면",
  userIntent: "사용자가 빠르게 필터링하길 원함",
  targetSurface: "new_app",
  screens: [
    {
      name: "결과 목록",
      purpose: "검색 결과를 보여줌",
      primaryAction: "항목 열기",
      secondaryActions: [],
      dataNeeded: [],
      emptyState: "결과 없음",
      errorState: "오류",
    },
    {
      name: "상세",
      purpose: "선택 항목 상세",
      primaryAction: "닫기",
      secondaryActions: [],
      dataNeeded: [],
      emptyState: "없음",
      errorState: "오류",
    },
  ],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: ["키보드로 전체 탐색 가능", "빈 상태 안내 표시"],
};

describe("buildMissionCreateFromBlueprint — worker assignment (least-privilege)", () => {
  it("maps DESIGN_TEAM 1:1 to workers with role-only assignments (no capability/permission baked in)", () => {
    const req = buildMissionCreateFromBlueprint(input, { missionId: "m1" });

    // one worker per DESIGN_TEAM member, in the same order
    expect(req.workers).toHaveLength(DESIGN_TEAM.length);
    expect(req.workers.map((w) => w.role)).toEqual(DESIGN_TEAM.map((m) => m.role));

    // agentId is `design_<role>_<1-based index>`, displayName is the team slot
    expect(req.workers[0]).toEqual({
      agentId: "design_companion_1",
      role: "companion",
      displayName: "lead_companion",
      soulMode: "summary",
      configSource: "internal",
    });
    expect(req.workers[2]).toMatchObject({ agentId: "design_builder_3", displayName: "frontend_builder" });

    // least-privilege: the request carries NO capability/permission field — the
    // server recomputes capability from the role, so it can't be smuggled here
    for (const worker of req.workers) {
      expect("permissionLevel" in worker).toBe(false);
      expect("capability" in worker).toBe(false);
      expect(worker.soulMode).toBe("summary");
      expect(worker.configSource).toBe("internal");
    }
  });
});

describe("buildMissionCreateFromBlueprint — goal assembly + non-disclosure honesty", () => {
  it("renders the screen/token lines and ALWAYS appends the no-external-send line", () => {
    const req = buildMissionCreateFromBlueprint(input, { missionId: "m1" });

    expect(req.goal).toContain("[디자인] 검색 결과 화면");
    expect(req.goal).toContain("의도 — 사용자가 빠르게 필터링하길 원함");
    expect(req.goal).toContain("대상 — new_app");
    expect(req.goal).toContain("톤 — clean_builder · 밀도 balanced · 모션 subtle");
    // each screen rendered as `· <name>: <purpose> (주요액션 <primaryAction>)`
    expect(req.goal).toContain("· 결과 목록: 검색 결과를 보여줌 (주요액션 항목 열기)");
    expect(req.goal).toContain("· 상세: 선택 항목 상세 (주요액션 닫기)");
    expect(req.goal).toContain("수용 기준 — 키보드로 전체 탐색 가능; 빈 상태 안내 표시");
    // the honesty boundary — a design mission only drafts, never sends externally
    expect(req.goal).toContain("외부 발송 없음 — 시안/구현 draft만.");
  });

  it("omits the 수용 기준 line when acceptanceCriteria is empty, but still keeps the no-send line", () => {
    const req = buildMissionCreateFromBlueprint({ ...input, acceptanceCriteria: [] }, { missionId: "m1" });
    expect(req.goal).not.toContain("수용 기준 —"); // the empty string is filtered out
    expect(req.goal).toContain("외부 발송 없음 — 시안/구현 draft만."); // boundary is unconditional
  });
});

describe("buildMissionCreateFromBlueprint — provenance, defaults, title prefix/cap", () => {
  it("defaults createdBy and leaves provenance ids undefined when omitted; status is planned", () => {
    const req = buildMissionCreateFromBlueprint(input, { missionId: "m1" });
    expect(req.id).toBe("m1");
    expect(req.truthStatus).toBe("planned");
    expect(req.createdBy).toBe("design_blueprint"); // default attribution
    expect(req.debateId).toBeUndefined();
    expect(req.sourceSessionId).toBeUndefined();
  });

  it("threads explicit createdBy + provenance ids through verbatim", () => {
    const req = buildMissionCreateFromBlueprint(input, {
      missionId: "m2",
      createdBy: "user_42",
      debateId: "d9",
      sourceSessionId: "s7",
    });
    expect(req.createdBy).toBe("user_42"); // override wins over the default
    expect(req.debateId).toBe("d9"); // promoted-from-debate provenance preserved
    expect(req.sourceSessionId).toBe("s7"); // promoted-from-conversation provenance preserved
  });

  it("prefixes the title with [디자인] and caps it at 300 chars", () => {
    const longTitle = "가".repeat(400);
    const req = buildMissionCreateFromBlueprint({ ...input, title: longTitle }, { missionId: "m1" });
    expect(req.title.startsWith("[디자인] ")).toBe(true);
    expect(req.title.length).toBe(300); // `[디자인] ` + title, sliced to the 300-char cap
  });
});
