import { describe, expect, it } from "vitest";
import {
  buildCreateSnapshotCommand,
  buildFullRestoreCommand,
  buildPruneSnapshotsCommand,
  buildRestoreFilesCommand,
  parseSnapshotOutput,
  resolveSnapshotRef,
  sanitizeSnapshotId,
} from "./gitSnapshot";

describe("sanitizeSnapshotId", () => {
  it("ref-safe 문자로 정규화", () => {
    expect(sanitizeSnapshotId("message_agent_abc-123")).toBe("message_agent_abc-123");
    expect(sanitizeSnapshotId("a/b c!@#")).toBe("a_b_c___");
    expect(sanitizeSnapshotId("")).toBe("snapshot");
  });
});

describe("buildCreateSnapshotCommand", () => {
  it("stash create + update-ref로 비파괴 스냅샷 명령 생성", () => {
    const cmd = buildCreateSnapshotCommand("turn1");
    expect(cmd).toContain("git stash create");
    expect(cmd).toContain('git update-ref "refs/orch-snapshots/turn1"');
    expect(cmd).toContain("ORCH_SNAPSHOT:turn1:");
    // working tree를 건드리는 stash push/pop은 쓰지 않는다 (비파괴)
    expect(cmd).not.toContain("stash push");
    expect(cmd).not.toContain("stash pop");
  });
});

describe("parseSnapshotOutput", () => {
  it("hash 출력 파싱", () => {
    const r = parseSnapshotOutput("일부 잡음\nORCH_SNAPSHOT:turn1:a1b2c3d4e5f6\n끝");
    expect(r).toEqual({ ok: true, id: "turn1", hash: "a1b2c3d4e5f6", empty: false });
  });
  it("empty(변경 없음) 파싱", () => {
    expect(parseSnapshotOutput("ORCH_SNAPSHOT:turn2:empty")).toEqual({
      ok: true,
      id: "turn2",
      hash: null,
      empty: true,
    });
  });
  it("매칭 실패", () => {
    expect(parseSnapshotOutput("관계없는 출력")).toEqual({ ok: false });
  });
});

describe("resolveSnapshotRef", () => {
  it("hash면 스냅샷 ref, empty(턴 시작 깨끗)면 HEAD", () => {
    expect(resolveSnapshotRef({ ok: true, id: "t1", hash: "abc1234", empty: false })).toBe(
      "refs/orch-snapshots/t1",
    );
    expect(resolveSnapshotRef({ ok: true, id: "t2", hash: null, empty: true })).toBe("HEAD");
    expect(resolveSnapshotRef({ ok: false })).toBeNull();
  });
});

describe("buildRestoreFilesCommand", () => {
  it("지정 파일만 복원, baseRef에 없던(새) 파일은 삭제 처리", () => {
    const cmd = buildRestoreFilesCommand("refs/orch-snapshots/turn1", ["src/a.ts", "src/b.ts"])!;
    expect(cmd).toContain('git checkout "refs/orch-snapshots/turn1" --');
    expect(cmd).toContain("'src/a.ts'");
    expect(cmd).toContain("'src/b.ts'");
    expect(cmd).toContain("git cat-file -e"); // 새 파일 판별
    expect(cmd).toContain("rm -f"); // 새 파일 삭제
  });

  it("HEAD 기준 복원도 동일 형식", () => {
    expect(buildRestoreFilesCommand("HEAD", ["src/a.ts"])!).toContain('git checkout "HEAD" --');
  });

  it("bash 변경 항목은 복원 대상에서 제외", () => {
    expect(buildRestoreFilesCommand("HEAD", ["(bash) pnpm test"])).toBeNull();
    const cmd = buildRestoreFilesCommand("HEAD", ["src/a.ts", "(bash) ls"])!;
    expect(cmd).toContain("'src/a.ts'");
    expect(cmd).not.toContain("(bash)");
  });

  it("작은따옴표가 든 경로도 안전하게 인용", () => {
    const cmd = buildRestoreFilesCommand("HEAD", ["src/it's.ts"])!;
    expect(cmd).toContain(`'src/it'\\''s.ts'`);
  });
});

describe("buildFullRestoreCommand / buildPruneSnapshotsCommand", () => {
  it("전체 복원 명령", () => {
    expect(buildFullRestoreCommand("refs/orch-snapshots/turn1")).toContain(
      'git checkout "refs/orch-snapshots/turn1" -- .',
    );
  });
  it("오래된 스냅샷 정리 명령 (보존 개수)", () => {
    const cmd = buildPruneSnapshotsCommand(5);
    expect(cmd).toContain("for-each-ref");
    expect(cmd).toContain("tail -n +$((5 + 1))");
    expect(cmd).toContain("update-ref -d");
  });
});
