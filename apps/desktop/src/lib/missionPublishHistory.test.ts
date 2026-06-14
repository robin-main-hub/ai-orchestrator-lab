import { describe, expect, it } from "vitest";
import { accumulatePublishHistory, computeNextPublishStep, parsePublishTrace } from "./missionPublishPrefill";
import type { PublishHistoryByStep } from "./missionPublishPrefill";

describe("parsePublishTrace — github.publish.{step}.{status} → PublishHistoryEntry", () => {
  it("정상: branch.planned → step/status 추출", () => {
    const entry = parsePublishTrace("github.publish.branch.planned", { summary: "ok", ts: "2026-06-14T12:00:00Z" });
    expect(entry).toEqual({ step: "branch", status: "planned", summary: "ok", ts: "2026-06-14T12:00:00Z" });
  });

  it("정상: file.observed", () => {
    const entry = parsePublishTrace("github.publish.file.observed", { summary: "src/x.ts", ts: "2026-06-14T13:00:00Z" });
    expect(entry?.step).toBe("file");
    expect(entry?.status).toBe("observed");
  });

  it("정상: pr.blocked", () => {
    const entry = parsePublishTrace("github.publish.pr.blocked", { summary: "needs approval", ts: "2026-06-14T13:00:00Z" });
    expect(entry?.step).toBe("pr");
    expect(entry?.status).toBe("blocked");
  });

  it("github.publish.* 이외 prefix는 undefined(추측 금지)", () => {
    expect(parsePublishTrace("mission.publish.opened", { ts: "t" })).toBeUndefined();
    expect(parsePublishTrace("foo.bar.baz", { ts: "t" })).toBeUndefined();
  });

  it("알 수 없는 step은 undefined", () => {
    expect(parsePublishTrace("github.publish.review.planned", { ts: "t" })).toBeUndefined();
  });

  it("알 수 없는 status는 undefined", () => {
    expect(parsePublishTrace("github.publish.branch.deleted", { ts: "t" })).toBeUndefined();
  });

  it("payload에 ts 없으면 현재 시간 기본 — undefined가 아니라 정상 entry", () => {
    const entry = parsePublishTrace("github.publish.branch.planned", { summary: "ok" });
    expect(entry).toBeDefined();
    expect(typeof entry?.ts).toBe("string");
  });

  it("summary 없으면 빈 문자열", () => {
    const entry = parsePublishTrace("github.publish.branch.planned", { ts: "t" });
    expect(entry?.summary).toBe("");
  });

  it("payload undefined도 안전(crash 없이 entry 반환)", () => {
    const entry = parsePublishTrace("github.publish.branch.planned", undefined);
    expect(entry).toBeDefined();
  });

  it("payload null도 안전(undefined와 동일하게 처리)", () => {
    const entry = parsePublishTrace("github.publish.branch.planned", null);
    expect(entry).toBeDefined();
    expect(entry?.summary).toBe("");
  });

  it("type이 빈 문자열이면 undefined(추측 금지)", () => {
    expect(parsePublishTrace("", { ts: "t" })).toBeUndefined();
  });

  it("type에 dot이 4개 초과면 거부(확장된 prefix 위장 방지)", () => {
    expect(parsePublishTrace("github.publish.branch.planned.extra", { ts: "t" })).toBeUndefined();
  });

  it("step이 유효해도 status가 빈 문자열이면 undefined", () => {
    // "github.publish.branch." → split 후 status가 ""
    expect(parsePublishTrace("github.publish.branch.", { ts: "t" })).toBeUndefined();
  });

  it("ts 기본값은 ISO 형식 문자열(typeof string + ISO 패턴)", () => {
    const entry = parsePublishTrace("github.publish.branch.planned", { summary: "x" });
    expect(typeof entry?.ts).toBe("string");
    // ISO 8601 — 최소한 'T'를 포함하고 Date.parse가 NaN 아니어야 함.
    expect(entry?.ts).toMatch(/T/);
    expect(Number.isNaN(Date.parse(entry!.ts))).toBe(false);
  });
});

describe("accumulatePublishHistory — github.publish.* trace 누적 규칙", () => {
  const PAYLOAD = (missionId: string, extra: Record<string, unknown> = {}) => ({
    missionId,
    summary: "ok",
    ts: "2026-06-14T12:00:00.000Z",
    ...extra,
  });

  it("(#1) 정상: 빈 prev에 branch.planned 도착 → missionId 키에 branch entry 1개", () => {
    const next = accumulatePublishHistory({}, "github.publish.branch.planned", PAYLOAD("m_A"));
    expect(next.m_A?.branch?.status).toBe("planned");
    expect(next.m_A?.file).toBeUndefined();
    expect(next.m_A?.pr).toBeUndefined();
  });

  it("(#2) 같은 mission/step 재시도 → 최신만 유지(덮어쓰기)", () => {
    let state: Record<string, ReturnType<typeof accumulatePublishHistory>[string]> = {};
    state = accumulatePublishHistory(state, "github.publish.branch.planned", PAYLOAD("m_A", { summary: "first" }));
    state = accumulatePublishHistory(state, "github.publish.branch.observed", PAYLOAD("m_A", { summary: "second" }));
    expect(state.m_A?.branch?.status).toBe("observed");
    expect(state.m_A?.branch?.summary).toBe("second");
  });

  it("(#3) 다른 step끼리 독립적 누적(branch/file/pr 모두 유지)", () => {
    let state: Record<string, ReturnType<typeof accumulatePublishHistory>[string]> = {};
    state = accumulatePublishHistory(state, "github.publish.branch.planned", PAYLOAD("m_A"));
    state = accumulatePublishHistory(state, "github.publish.file.blocked", PAYLOAD("m_A"));
    state = accumulatePublishHistory(state, "github.publish.pr.observed", PAYLOAD("m_A"));
    expect(state.m_A?.branch?.status).toBe("planned");
    expect(state.m_A?.file?.status).toBe("blocked");
    expect(state.m_A?.pr?.status).toBe("observed");
  });

  it("(#4) 다른 mission은 분리 저장", () => {
    let state: Record<string, ReturnType<typeof accumulatePublishHistory>[string]> = {};
    state = accumulatePublishHistory(state, "github.publish.branch.planned", PAYLOAD("m_A"));
    state = accumulatePublishHistory(state, "github.publish.branch.failed", PAYLOAD("m_B"));
    expect(state.m_A?.branch?.status).toBe("planned");
    expect(state.m_B?.branch?.status).toBe("failed");
    // 서로 영향 없음
    expect(Object.keys(state)).toEqual(expect.arrayContaining(["m_A", "m_B"]));
  });

  it("(#5) missionId가 payload에 없으면 no-op(prev 그대로)", () => {
    const prev = { m_A: { branch: { step: "branch" as const, status: "planned" as const, summary: "s", ts: "t" } } };
    const next = accumulatePublishHistory(prev, "github.publish.branch.observed", { summary: "no mission id", ts: "t" });
    expect(next).toBe(prev); // 참조 동일성 — 새 객체 만들지 않음
  });

  it("(#6) parsePublishTrace가 거부한 type은 no-op", () => {
    const prev = {};
    const next = accumulatePublishHistory(prev, "mission.publish.opened", { missionId: "m_A", ts: "t" });
    expect(next).toBe(prev);
  });

  it("(#7) payload null도 안전(no-op — missionId 못 읽음)", () => {
    const prev = {};
    const next = accumulatePublishHistory(prev, "github.publish.branch.planned", null);
    expect(next).toBe(prev);
  });
});

describe("computeNextPublishStep — 'GitHub PR 완주' 다음 할 일 결정", () => {
  const T = "2026-06-14T12:00:00.000Z";

  it("(#1) history undefined → 첫 단계(branch) start_step", () => {
    const r = computeNextPublishStep(undefined);
    expect(r.kind).toBe("start_step");
    if (r.kind !== "start_step") throw new Error("unreachable");
    expect(r.step).toBe("branch");
    expect(r.label).toBe("브랜치 준비");
  });

  it("(#2) 빈 객체 → branch start_step", () => {
    const r = computeNextPublishStep({});
    expect(r.kind).toBe("start_step");
    if (r.kind !== "start_step") throw new Error("unreachable");
    expect(r.step).toBe("branch");
  });

  it("(#3) branch planned → branch continue_step(execute 준비)", () => {
    const h: PublishHistoryByStep = { branch: { step: "branch", status: "planned", summary: "agent/x", ts: T } };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("continue_step");
    if (r.kind !== "continue_step") throw new Error("unreachable");
    expect(r.step).toBe("branch");
    expect(r.label).toBe("브랜치 실행 준비됨");
  });

  it("(#4) branch observed → file start_step(다음 단계로 이동)", () => {
    const h: PublishHistoryByStep = { branch: { step: "branch", status: "observed", summary: "agent/x@abc", ts: T } };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("start_step");
    if (r.kind !== "start_step") throw new Error("unreachable");
    expect(r.step).toBe("file");
  });

  it("(#5) branch observed + file blocked → file retry_step(절대 PR로 추측 X)", () => {
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "ok", ts: T },
      file: { step: "file", status: "blocked", summary: "needs approval", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("retry_step");
    if (r.kind !== "retry_step") throw new Error("unreachable");
    expect(r.step).toBe("file");
    expect(r.reason).toBe("needs approval");
  });

  it("(#6) branch observed + file already_exists → pr start_step", () => {
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "", ts: T },
      file: { step: "file", status: "already_exists", summary: "", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("start_step");
    if (r.kind !== "start_step") throw new Error("unreachable");
    expect(r.step).toBe("pr");
  });

  it("(#7) 모두 observed → done", () => {
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "", ts: T },
      file: { step: "file", status: "observed", summary: "", ts: T },
      pr: { step: "pr", status: "observed", summary: "", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("done");
    expect(r.label).toBe("GitHub PR 완주됨");
  });

  it("(#8) branch failed(첫 단계 실패) → branch retry_step + reason 전달", () => {
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "failed", summary: "rate limited", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("retry_step");
    if (r.kind !== "retry_step") throw new Error("unreachable");
    expect(r.step).toBe("branch");
    expect(r.reason).toBe("rate limited");
  });

  it("(#9) branch approval_required → continue_step(같은 step)", () => {
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "approval_required", summary: "appr 필요", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("continue_step");
    if (r.kind !== "continue_step") throw new Error("unreachable");
    expect(r.step).toBe("branch");
  });

  it("(#10) PR observed지만 file blocked → file retry(PR observed 무시하지 않음 → 정직하게 막힌 단계 표시)", () => {
    // 비상식적 상태(PR이 file 전에 observed)지만, 단계 순서 가드 정직성 — file로 retry 안내.
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "", ts: T },
      file: { step: "file", status: "blocked", summary: "stuck", ts: T },
      pr: { step: "pr", status: "observed", summary: "url", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("retry_step");
    if (r.kind !== "retry_step") throw new Error("unreachable");
    expect(r.step).toBe("file");
  });

  it("(#11) blocked 단계의 reason이 비어 있으면 status 문자열로 fallback(거짓말 없음)", () => {
    const h: PublishHistoryByStep = {
      branch: { step: "branch", status: "blocked", summary: "", ts: T },
    };
    const r = computeNextPublishStep(h);
    expect(r.kind).toBe("retry_step");
    if (r.kind !== "retry_step") throw new Error("unreachable");
    expect(r.reason).toBe("blocked");
  });
});
