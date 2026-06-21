import { describe, expect, it } from "vitest";
import type { MissionBoardItem } from "./missionBoardModel";
import {
  builtinMissionPrefill,
  evaluateScaffoldFile,
  pickFirstSafeScaffoldFile,
  SCAFFOLD_FILE_BYTE_MAX,
  type MissionScaffoldFile,
} from "./missionPublishPrefill";

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
    expect(prefill.fileNotice).toBeUndefined();
  });
});

describe("evaluateScaffoldFile — 단일 파일 안전 가드", () => {
  it("정상 텍스트 파일은 통과", () => {
    const v = evaluateScaffoldFile({ path: "src/x.ts", newContent: "export const v = 1;\n" });
    expect(v.ok).toBe(true);
  });
  it("빈 path 차단", () => {
    expect(evaluateScaffoldFile({ path: "", newContent: "hi" }).ok).toBe(false);
    expect(evaluateScaffoldFile({ path: "   ", newContent: "hi" }).ok).toBe(false);
  });
  it("NUL byte 있으면 binary로 차단", () => {
    const v = evaluateScaffoldFile({ path: "x", newContent: "a\0b" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("binary");
  });
  it("한도 초과 byte size 차단", () => {
    const big = "x".repeat(SCAFFOLD_FILE_BYTE_MAX + 10);
    const v = evaluateScaffoldFile({ path: "x", newContent: big });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("too_large");
  });
  it("시크릿 패턴(ghp_/sk-ant-/PEM) 차단", () => {
    expect(evaluateScaffoldFile({ path: "x", newContent: "token=ghp_abcdefghij1234567890abcd" }).ok).toBe(false);
    expect(evaluateScaffoldFile({ path: "x", newContent: "key=sk-ant-abcdefghij1234567890abcd" }).ok).toBe(false);
    expect(evaluateScaffoldFile({ path: "x", newContent: "-----BEGIN PRIVATE KEY-----\n..." }).ok).toBe(false);
  });
  it("fine-grained PAT(github_pat_)도 차단 — classic ghp_ 규칙으로는 못 잡는 형식", () => {
    // gitleaks가 diff의 진짜 토큰 리터럴을 잡으므로 런타임 조합으로 회피.
    const pat = "github_" + "pat_" + "11" + "A".repeat(22) + "_" + "b".repeat(40);
    const v = evaluateScaffoldFile({ path: "x", newContent: `token=${pat}` });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("secret_suspect");
  });
});

describe("pickFirstSafeScaffoldFile — 여러 파일에서 첫 안전 파일 선택", () => {
  it("빈 입력이면 pick 없음 + total/safe 0", () => {
    const r = pickFirstSafeScaffoldFile([]);
    expect(r.pick).toBeUndefined();
    expect(r.total).toBe(0);
    expect(r.safeCount).toBe(0);
  });
  it("첫 안전 파일이 선택되고, 뒤의 안전 파일은 카운트만 됨", () => {
    const files: MissionScaffoldFile[] = [
      { path: "src/a.ts", newContent: "a\n" },
      { path: "src/b.ts", newContent: "b\n" },
    ];
    const r = pickFirstSafeScaffoldFile(files);
    expect(r.pick?.path).toBe("src/a.ts");
    expect(r.total).toBe(2);
    expect(r.safeCount).toBe(2);
  });
  it("위험 파일은 reason별로 카운트되고 pick에서 제외", () => {
    const files: MissionScaffoldFile[] = [
      { path: "src/a.ts", newContent: "hi\0bye" },           // binary
      { path: "secret.env", newContent: "token=ghp_abcdefghij1234567890abcd" }, // secret
      { path: "src/safe.ts", newContent: "export const ok = true;\n" },         // 안전
      { path: "", newContent: "ignore" },                                       // empty path
    ];
    const r = pickFirstSafeScaffoldFile(files);
    expect(r.pick?.path).toBe("src/safe.ts");
    expect(r.safeCount).toBe(1);
    expect(r.skipped.binary).toBe(1);
    expect(r.skipped.secret_suspect).toBe(1);
    expect(r.skipped.empty_path).toBe(1);
  });
  it("모두 위험하면 pick 없음", () => {
    const files: MissionScaffoldFile[] = [
      { path: "x", newContent: "a\0b" },
      { path: "y", newContent: "ghp_abcdefghij1234567890abcd" },
    ];
    const r = pickFirstSafeScaffoldFile(files);
    expect(r.pick).toBeUndefined();
    expect(r.safeCount).toBe(0);
  });
});

describe("builtinMissionPrefill — scaffoldFiles 통합", () => {
  it("scaffoldFiles 한 개 안전: filePath/fileNewContent 채움 + notice", () => {
    const prefill = builtinMissionPrefill(item(), [
      { path: "src/util.ts", newContent: "export const v = 2;\n", operation: "create" },
    ]);
    expect(prefill.filePath).toBe("src/util.ts");
    expect(prefill.fileNewContent).toBe("export const v = 2;\n");
    expect(prefill.fileNotice).toContain("1개");
  });
  it("scaffoldFiles 다중: 첫 안전 파일만 + '나머지는 별도 plan' notice", () => {
    const prefill = builtinMissionPrefill(item(), [
      { path: "src/a.ts", newContent: "a\n" },
      { path: "src/b.ts", newContent: "b\n" },
      { path: "src/c.ts", newContent: "c\n" },
    ]);
    expect(prefill.filePath).toBe("src/a.ts");
    expect(prefill.fileNotice).toMatch(/scaffold 3개 중 1개 자동 채움.*나머지는 별도 plan/);
  });
  it("scaffoldFiles 다중 + 위험 일부: 첫 안전만 채움 + 스킵 카운트 notice", () => {
    const prefill = builtinMissionPrefill(item(), [
      { path: "huge.bin", newContent: "x".repeat(SCAFFOLD_FILE_BYTE_MAX + 1) }, // too_large
      { path: "key.pem", newContent: "-----BEGIN PRIVATE KEY-----\n..." },     // secret
      { path: "src/main.ts", newContent: "console.log('ok');\n" },             // 안전
    ]);
    expect(prefill.filePath).toBe("src/main.ts");
    expect(prefill.fileNotice).toContain("scaffold 3개");
    expect(prefill.fileNotice).toContain("스킵");
  });
  it("scaffoldFiles 전부 위험: filePath/fileNewContent 비움 + 명시 notice", () => {
    const prefill = builtinMissionPrefill(item(), [
      { path: "key.pem", newContent: "-----BEGIN PRIVATE KEY-----\n..." },
      { path: "huge.bin", newContent: "\0".repeat(100) },
    ]);
    expect(prefill.filePath).toBeUndefined();
    expect(prefill.fileNewContent).toBeUndefined();
    expect(prefill.fileNotice).toContain("모두 가드에 막혀");
  });
  it("scaffoldFiles undefined이면 file 필드 + notice 모두 미설정(기존 동작 호환)", () => {
    const prefill = builtinMissionPrefill(item());
    expect(prefill.filePath).toBeUndefined();
    expect(prefill.fileNewContent).toBeUndefined();
    expect(prefill.fileNotice).toBeUndefined();
  });
});
