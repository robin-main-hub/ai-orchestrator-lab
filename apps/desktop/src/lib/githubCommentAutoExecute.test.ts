import { describe, expect, it } from "vitest";
import {
  GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY,
  GITHUB_COMMENT_AUTOEXECUTE_ARMED_TTL_MS,
  GITHUB_COMMENT_AUTOEXECUTE_WARNING,
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

// Characterization tests (no behavior change) for the previously-unasserted safety
// constants and the parse/create branches the block above never reaches. This guard
// is deliberately SEPARATE from coding auto-approval because an armed state here can
// leave a real trace on external GitHub, so its constants are load-bearing:
//   - the storage key is versioned and distinct (never shared with coding approval);
//   - the warning text must keep telling the operator that ONLY comment-create is in
//     scope (no code/branch/PR/merge) and that repo allowlist + body integrity still
//     apply — silently weakening this copy would be a safety regression.
// The parse branches pinned here are the "valid JSON, wrong shape", "unparseable
// expiresAt", and the exact expiry boundary (expiresAt === now → already expired),
// none of which the existing cases exercise. createArmedState's custom TTL and its
// invalid-nowIso fallback (expiry still computed off a real clock) are pinned too.
describe("githubCommentAutoExecute — safety constants & parse/create edges", () => {
  const TTL = GITHUB_COMMENT_AUTOEXECUTE_ARMED_TTL_MS;

  it("TTL is 30 minutes and the storage key is the versioned, distinct key", () => {
    expect(TTL).toBe(30 * 60 * 1000);
    expect(GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY).toBe(
      "ai-orchestrator.github-comment-autoexecute.armed.v1",
    );
    // must NOT collude with the coding auto-approval namespace
    expect(GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY).not.toContain("codingAutoApproval");
  });

  it("warning copy keeps the load-bearing scope limits", () => {
    const lines = GITHUB_COMMENT_AUTOEXECUTE_WARNING.split("\n");
    expect(lines).toHaveLength(5);
    // comment-create-only: code change / branch / PR / merge are explicitly excluded
    expect(GITHUB_COMMENT_AUTOEXECUTE_WARNING).toContain("comment create만");
    expect(GITHUB_COMMENT_AUTOEXECUTE_WARNING).toContain("머지는 포함되지 않습니다");
    // gates are NOT bypassed by being armed
    expect(GITHUB_COMMENT_AUTOEXECUTE_WARNING).toContain("allowlist");
    expect(GITHUB_COMMENT_AUTOEXECUTE_WARNING).toContain("무결성");
    // operator is told the trace is external/persistent
    expect(GITHUB_COMMENT_AUTOEXECUTE_WARNING).toContain("외부 GitHub");
  });

  it("parseArmedState rejects valid JSON with the wrong shape", () => {
    const now = "2026-06-14T00:00:00.000Z";
    expect(parseArmedState("{}", now)).toBeNull();
    expect(parseArmedState(JSON.stringify({ armedAt: 123, expiresAt: now }), now)).toBeNull();
    expect(parseArmedState(JSON.stringify({ armedAt: now }), now)).toBeNull();
  });

  it("parseArmedState rejects an unparseable expiresAt", () => {
    const raw = JSON.stringify({ armedAt: "2026-06-14T00:00:00.000Z", expiresAt: "not-a-date" });
    expect(parseArmedState(raw, "2026-06-14T00:00:00.000Z")).toBeNull();
  });

  it("parseArmedState treats the exact expiry boundary as already expired", () => {
    const at = "2026-06-14T00:30:00.000Z";
    const raw = JSON.stringify({ armedAt: "2026-06-14T00:00:00.000Z", expiresAt: at });
    // expiresAt === now → expiresAtMs <= nowMs → null (strict: armed must be in the future)
    expect(parseArmedState(raw, at)).toBeNull();
  });

  it("createArmedState honors a custom TTL", () => {
    const state = createArmedState("2026-06-14T00:00:00.000Z", 5 * 60 * 1000);
    expect(Date.parse(state.expiresAt) - Date.parse(state.armedAt)).toBe(5 * 60 * 1000);
  });

  it("createArmedState falls back to the real clock when nowIso is invalid", () => {
    const before = Date.now();
    const state = createArmedState("not-a-date", TTL);
    const after = Date.now();
    // armedAt passes through verbatim, but the expiry is computed off Date.now()
    expect(state.armedAt).toBe("not-a-date");
    const expiresMs = Date.parse(state.expiresAt);
    expect(Number.isFinite(expiresMs)).toBe(true);
    expect(expiresMs).toBeGreaterThanOrEqual(before + TTL);
    expect(expiresMs).toBeLessThanOrEqual(after + TTL);
  });
});
