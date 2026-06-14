import { describe, expect, it } from "vitest";
import type { MissionBoardItem } from "./missionBoardModel";
import { builtinMissionPrefill } from "./missionPublishPrefill";

function item(overrides: Partial<MissionBoardItem> = {}): MissionBoardItem {
  return {
    missionId: "mission_8eab12cd34ef",
    title: "Add publish flow",
    goal: "Wire the publish panel end-to-end.",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 0,
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
    ...overrides,
  } as MissionBoardItem;
}

describe("builtinMissionPrefill", () => {
  it("sourceRef / prBase는 보수적 main 기본값 — 사용자가 수정", () => {
    const prefill = builtinMissionPrefill(item());
    expect(prefill.sourceRef).toBe("main");
    expect(prefill.prBase).toBe("main");
  });

  it("newBranchName은 W2 prefix(agent/)로 시작하고 missionId 슬러그를 포함", () => {
    const prefill = builtinMissionPrefill(item({ missionId: "mission_8eab12cd34ef" }));
    expect(prefill.newBranchName).toMatch(/^agent\/mission-/);
    // missionId 본문에서 안전 문자만 슬러그로 — '8eab12cd34ef' 의 앞부분.
    expect(prefill.newBranchName).toContain("8eab");
    // 보호 브랜치/금지 prefix와 겹치지 않음.
    expect(prefill.newBranchName).not.toMatch(/^(main|develop|release|hotfix)/);
  });

  it("missionId가 mission_ prefix 없어도 슬러그 동작", () => {
    const prefill = builtinMissionPrefill(item({ missionId: "abc123def456" }));
    expect(prefill.newBranchName).toMatch(/^agent\/mission-/);
    expect(prefill.newBranchName).toContain("abc123");
  });

  it("prTitle은 mission.title 그대로 — 160자 캡", () => {
    const longTitle = "x".repeat(300);
    const prefill = builtinMissionPrefill(item({ title: longTitle }));
    expect(prefill.prTitle?.length).toBe(160);
    expect(prefill.prTitle).toBe("x".repeat(160));
  });

  it("prBody는 goal + provenance — provenance 라인에 missionId 포함", () => {
    const prefill = builtinMissionPrefill(item({ goal: "ship publish flow" }));
    expect(prefill.prBody).toContain("ship publish flow");
    expect(prefill.prBody).toContain("mission_8eab12cd34ef");
    expect(prefill.prBody).toMatch(/draft.*review before approving/i);
  });

  it("goal이 비어 있어도 provenance는 남는다(빈 body 허용하되 출처는 보존)", () => {
    const prefill = builtinMissionPrefill(item({ goal: "" }));
    expect(prefill.prBody).toContain("mission_");
    expect(prefill.prBody).not.toBe(""); // 출처는 항상 있어야 함
  });

  it("filePath / fileNewContent는 비워둠 — Mission scaffold 노출 전엔 추측 금지", () => {
    const prefill = builtinMissionPrefill(item());
    expect(prefill.filePath).toBeUndefined();
    expect(prefill.fileNewContent).toBeUndefined();
  });
});
