import { describe, expect, it } from "vitest";
import {
  evaluateBasePolicy,
  evaluatePrCreateGate,
  parsePrBaseAllowlist,
  PR_BODY_MAX_CHARS,
  PR_TITLE_MAX_CHARS,
} from "./githubPullRequestWriteGuards";

describe("parsePrBaseAllowlist", () => {
  it("env가 비어 있으면 기본 main/develop", () => {
    expect(parsePrBaseAllowlist(undefined)).toEqual(["main", "develop"]);
    expect(parsePrBaseAllowlist("")).toEqual(["main", "develop"]);
    expect(parsePrBaseAllowlist("   ")).toEqual(["main", "develop"]);
  });
  it("쉼표 split + trim + 안전 문자만 유지", () => {
    expect(parsePrBaseAllowlist("main, release/2026")).toEqual(["main", "release/2026"]);
    expect(parsePrBaseAllowlist("main, x;rm -rf, develop")).toEqual(["main", "develop"]);
  });
});

describe("evaluateBasePolicy", () => {
  it("allowlist에 있는 정상 이름만 통과", () => {
    expect(evaluateBasePolicy("main", ["main", "develop"]).ok).toBe(true);
    expect(evaluateBasePolicy("develop", ["main", "develop"]).ok).toBe(true);
    expect(evaluateBasePolicy("release/2026", ["main", "release/2026"]).ok).toBe(true);
  });
  it("allowlist에 없으면 차단(메시지에 허용 목록 노출)", () => {
    const v = evaluateBasePolicy("trunk", ["main", "develop"]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("main, develop");
  });
  it("refs/* 직접 입력 금지", () => {
    expect(evaluateBasePolicy("refs/heads/main", ["main"]).ok).toBe(false);
  });
  it("unsafe 문자 차단", () => {
    expect(evaluateBasePolicy("main;rm -rf", ["main;rm -rf"]).ok).toBe(false);
    expect(evaluateBasePolicy("a b", ["a b"]).ok).toBe(false);
  });
  it("빈 이름 차단", () => {
    expect(evaluateBasePolicy("", ["main"]).ok).toBe(false);
    expect(evaluateBasePolicy("   ", ["main"]).ok).toBe(false);
  });
});

describe("evaluatePrCreateGate", () => {
  const baseOK = {
    repoFullName: "robin/lab",
    baseBranch: "main",
    headBranch: "agent/feature-x",
    title: "Add evidence cards",
    body: "Approval queue + evidence shape verified.",
    allowlist: ["robin/lab"],
    baseAllowlist: ["main", "develop"],
    tokenPresent: true,
  };

  it("정상 입력 통과 + sha 모두 계산", () => {
    const v = evaluatePrCreateGate(baseOK);
    expect(v.kind).toBe("ok");
    if (v.kind === "ok") {
      expect(v.repoFullName).toBe("robin/lab");
      expect(v.baseBranch).toBe("main");
      expect(v.headBranch).toBe("agent/feature-x");
      expect(v.headRef).toBe("refs/heads/agent/feature-x");
      expect(v.title).toBe("Add evidence cards");
      expect(v.titleSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(v.bodySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(v.bodyLength).toBeGreaterThan(0);
      expect(v.bodyPreview).toBeTruthy();
    }
  });

  it("token/allowlist 없으면 blocked", () => {
    expect(evaluatePrCreateGate({ ...baseOK, tokenPresent: false }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, allowlist: [] }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, repoFullName: "evil/repo" }).kind).toBe("blocked");
  });

  it("base가 base allowlist에 없으면 blocked", () => {
    expect(evaluatePrCreateGate({ ...baseOK, baseBranch: "trunk" }).kind).toBe("blocked");
  });

  it("head가 W2 정책 위반이면 blocked", () => {
    expect(evaluatePrCreateGate({ ...baseOK, headBranch: "main" }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, headBranch: "develop" }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, headBranch: "release/x" }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, headBranch: "random-feature" }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, headBranch: "agent/한글" }).kind).toBe("blocked");
  });

  it("base == head 차단", () => {
    // base/head가 둘 다 main이면 head policy로도 차단되지만 base==head 분기도 명시.
    const allowAllBase = { ...baseOK, baseBranch: "agent/x", baseAllowlist: ["agent/x"], headBranch: "agent/x" };
    const v = evaluatePrCreateGate(allowAllBase);
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toMatch(/base.*head.*같습니다|head.*base.*같습니다|같습니다/);
  });

  it("빈 title, 너무 긴 title/body 차단", () => {
    expect(evaluatePrCreateGate({ ...baseOK, title: "   " }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, title: "a".repeat(PR_TITLE_MAX_CHARS + 1) }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, body: "a".repeat(PR_BODY_MAX_CHARS + 1) }).kind).toBe("blocked");
  });

  it("title에 제어문자(개행/CR/NUL/DEL)가 있으면 차단 — W5d 라벨 가드와 parity(회귀)", () => {
    // 드리프트 버그: title은 단일 라인 필드로 plan store·응답 preview·GitHub PUT으로 흘러가는데,
    // W5d 라벨 가드(githubPullRequestLabelsUpdateGuards)는 같은 이유로 제어문자를 막던 반면 이
    // create 경로는 schema(bare z.string())·런타임 어디서도 막지 않아 개행 주입(로그/응답 인젝션)이
    // 통과했다(실측 kind=ok). body는 markdown이라 개행이 정당 — title만 막는다.
    for (const bad of ["fix\ninjected log line", "fix\rinjected", "fix\u0000nul", "fix\u007fdel", "tab\tfield"]) {
      const v = evaluatePrCreateGate({ ...baseOK, title: bad });
      expect(v.kind, `should block: ${JSON.stringify(bad)}`).toBe("blocked");
      if (v.kind === "blocked") expect(v.reason).toContain("제어문자");
    }
    // body의 개행은 정당 — 통과해야 함(오탐 방지)
    expect(evaluatePrCreateGate({ ...baseOK, body: "line1\nline2\n" }).kind).toBe("ok");
    // 정상 title은 계속 통과
    expect(evaluatePrCreateGate({ ...baseOK, title: "Add evidence cards" }).kind).toBe("ok");
  });

  it("빈 body는 허용(GitHub PR도 빈 body 허용)", () => {
    expect(evaluatePrCreateGate({ ...baseOK, body: "" }).kind).toBe("ok");
  });

  it("title/body 어느 쪽이든 secret 패턴이면 차단", () => {
    expect(evaluatePrCreateGate({ ...baseOK, title: "Add ghp_abcdefghij1234567890abcd" }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, body: "TOKEN=ghp_abcdefghij1234567890abcd" }).kind).toBe("blocked");
    expect(evaluatePrCreateGate({ ...baseOK, body: "-----BEGIN PRIVATE KEY-----\n..." }).kind).toBe("blocked");
  });
});
