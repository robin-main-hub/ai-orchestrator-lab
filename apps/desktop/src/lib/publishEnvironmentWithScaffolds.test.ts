import { describe, expect, it } from "vitest";
import type { MissionBoardItem } from "./missionBoardModel";
import { publishEnvironmentWithScaffolds } from "./publishEnvironmentWithScaffolds";
import type { MissionScaffoldFile } from "./missionPublishPrefill";
import type { MissionPublishEnvironment } from "../components/MissionBoardPanel";

const FILE_A: MissionScaffoldFile = { path: "src/App.tsx", newContent: "// hello\n", operation: "create" };
const FILE_B: MissionScaffoldFile = { path: "README.md", newContent: "# title\n", operation: "create" };

function item(id: string): MissionBoardItem {
  return {
    missionId: id,
    title: `t-${id}`,
    goal: "g",
    status: "running",
    truthStatus: "planned",
    truthLabel: "planned",
    truthDetail: "n/a",
    workers: [],
    verificationCount: 0,
    mergeQueueCount: 0,
    serverLinked: true,
  } as unknown as MissionBoardItem;
}

function baseEnv(extra: Partial<MissionPublishEnvironment> = {}): MissionPublishEnvironment {
  return {
    serverBaseUrl: "https://example/server",
    defaultRepoFullName: "robin/example",
    ...extra,
  } as MissionPublishEnvironment;
}

describe("publishEnvironmentWithScaffolds", () => {
  it("base가 undefined면 undefined를 반환(노출 안 함)", () => {
    expect(publishEnvironmentWithScaffolds(undefined, { a: [FILE_A] })).toBeUndefined();
  });

  it("base.getScaffoldFiles가 이미 있으면 그대로 반환(override 우선)", () => {
    const provided: ReadonlyArray<MissionScaffoldFile> = [FILE_B];
    const env = baseEnv({ getScaffoldFiles: () => provided });
    const merged = publishEnvironmentWithScaffolds(env, { mission_x: [FILE_A] });
    expect(merged).toBe(env); // 참조 동일성 — 새 객체 만들지 않음
    expect(merged!.getScaffoldFiles!(item("mission_x"))).toBe(provided);
  });

  it("base.getScaffoldFiles가 없으면 캐시 조회 함수를 합성한다", () => {
    const env = baseEnv();
    const merged = publishEnvironmentWithScaffolds(env, { mission_x: [FILE_A] });
    expect(merged).toBeDefined();
    expect(merged!.getScaffoldFiles).toBeDefined();
    expect(merged!.getScaffoldFiles!(item("mission_x"))).toEqual([FILE_A]);
  });

  it("캐시에 없는 missionId는 undefined를 반환(추측 금지)", () => {
    const env = baseEnv();
    const merged = publishEnvironmentWithScaffolds(env, { mission_x: [FILE_A] });
    expect(merged!.getScaffoldFiles!(item("mission_missing"))).toBeUndefined();
  });

  it("base의 다른 필드는 보존된다(serverBaseUrl, defaultRepoFullName 등)", () => {
    const env = baseEnv();
    const merged = publishEnvironmentWithScaffolds(env, {});
    expect(merged!.serverBaseUrl).toBe(env.serverBaseUrl);
    expect(merged!.defaultRepoFullName).toBe(env.defaultRepoFullName);
  });
});
