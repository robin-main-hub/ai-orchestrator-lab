import { describe, expect, it } from "vitest";
import {
  GITHUB_COMMENT_AUTOEXECUTE_ARMED_TTL_MS,
  createArmedState,
  isArmed,
  parseArmedState,
} from "./githubCommentAutoExecute";

describe("githubCommentAutoExecute — 별도 armed guard", () => {
  it("저장된 값이 없으면 null(armed 아님)", () => {
    expect(parseArmedState(null, "2026-06-14T00:00:00.000Z")).toBeNull();
    expect(parseArmedState("not-json", "2026-06-14T00:00:00.000Z")).toBeNull();
    expect(isArmed(null)).toBe(false);
  });

  it("유효한 armed 상태는 그대로 파싱", () => {
    const raw = JSON.stringify({ armedAt: "2026-06-14T00:00:00.000Z", expiresAt: "2026-06-14T00:30:00.000Z" });
    const state = parseArmedState(raw, "2026-06-14T00:10:00.000Z");
    expect(state).toEqual({ armedAt: "2026-06-14T00:00:00.000Z", expiresAt: "2026-06-14T00:30:00.000Z" });
    expect(isArmed(state)).toBe(true);
  });

  it("만료된 armed는 신뢰하지 않는다(stale armed 자동 비활성)", () => {
    const raw = JSON.stringify({ armedAt: "2026-06-14T00:00:00.000Z", expiresAt: "2026-06-14T00:30:00.000Z" });
    expect(parseArmedState(raw, "2026-06-14T01:00:00.000Z")).toBeNull();
  });

  it("createArmedState는 짧은 TTL 적용(30분 기본)", () => {
    const state = createArmedState("2026-06-14T00:00:00.000Z");
    expect(state.armedAt).toBe("2026-06-14T00:00:00.000Z");
    const ttl = Date.parse(state.expiresAt) - Date.parse(state.armedAt);
    expect(ttl).toBe(GITHUB_COMMENT_AUTOEXECUTE_ARMED_TTL_MS);
  });
});
