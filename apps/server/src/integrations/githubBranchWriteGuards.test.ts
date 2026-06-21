import { describe, expect, it } from "vitest";
import {
  evaluateBranchCreateGate,
  evaluateBranchNamePolicy,
  isSafeGitRefName,
  normalizeSourceRef,
} from "./githubBranchWriteGuards";

describe("normalizeSourceRef", () => {
  it("refs/heads/main → main, heads/main → main, main → main", () => {
    expect(normalizeSourceRef("refs/heads/main")).toBe("main");
    expect(normalizeSourceRef("heads/main")).toBe("main");
    expect(normalizeSourceRef("main")).toBe("main");
    expect(normalizeSourceRef("  develop ")).toBe("develop");
  });
  it("refs/tags 등 비-heads는 빈 문자열(소스로 거부)", () => {
    expect(normalizeSourceRef("refs/tags/v1")).toBe("");
    expect(normalizeSourceRef("refs/pull/7/head")).toBe("");
    expect(normalizeSourceRef("")).toBe("");
  });
});

describe("evaluateBranchNamePolicy", () => {
  it("허용 prefix + 안전 문자만 통과", () => {
    expect(evaluateBranchNamePolicy("agent/refactor-x")).toEqual({ ok: true, ref: "refs/heads/agent/refactor-x" });
    expect(evaluateBranchNamePolicy("work/2026-06-14/login")).toEqual({ ok: true, ref: "refs/heads/work/2026-06-14/login" });
    expect(evaluateBranchNamePolicy("mission/m_1/setup")).toEqual({ ok: true, ref: "refs/heads/mission/m_1/setup" });
  });

  it("보호 브랜치 직접 생성 차단", () => {
    for (const name of ["main", "master", "develop", "trunk", "default"]) {
      expect(evaluateBranchNamePolicy(name).ok).toBe(false);
    }
  });

  it("release/, hotfix/, prod/, production/ prefix 차단", () => {
    for (const name of ["release/2026.06", "hotfix/auth-leak", "prod/cluster-a", "production/asia"]) {
      const v = evaluateBranchNamePolicy(name);
      expect(v.ok).toBe(false);
    }
  });

  it("refs/* 직접 입력 금지", () => {
    expect(evaluateBranchNamePolicy("refs/heads/agent/x").ok).toBe(false);
  });

  it("허용되지 않는 prefix는 차단(랜덤 이름·기존 브랜치 우회 시도 차단)", () => {
    expect(evaluateBranchNamePolicy("random-feature").ok).toBe(false);
    expect(evaluateBranchNamePolicy("feature/x").ok).toBe(false);
  });

  it("unsafe chars(공백/한글/메타문자/path-traversal) 차단", () => {
    expect(evaluateBranchNamePolicy("agent/foo bar").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/한글").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/foo;rm -rf").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/../escape").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/x//y").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/x@{1}").ok).toBe(false);
    expect(evaluateBranchNamePolicy("/agent/x").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/x/").ok).toBe(false);
    expect(evaluateBranchNamePolicy("agent/x.").ok).toBe(false);
  });

  it("길이 제한", () => {
    expect(evaluateBranchNamePolicy("a").ok).toBe(false); // 너무 짧음
    expect(evaluateBranchNamePolicy("agent/" + "x".repeat(200)).ok).toBe(false); // 너무 김
  });
});

describe("evaluateBranchCreateGate", () => {
  const allow = ["robin/lab"];
  const ok = { repoFullName: "robin/lab", sourceRef: "main", newBranchName: "agent/feature-x", allowlist: allow, tokenPresent: true };

  it("정상 입력이면 ok + 정규화 결과", () => {
    const v = evaluateBranchCreateGate(ok);
    expect(v.kind).toBe("ok");
    if (v.kind === "ok") {
      expect(v.sourceRef).toBe("main");
      expect(v.ref).toBe("refs/heads/agent/feature-x");
    }
  });

  it("토큰/allowlist 없으면 blocked", () => {
    expect(evaluateBranchCreateGate({ ...ok, tokenPresent: false }).kind).toBe("blocked");
    expect(evaluateBranchCreateGate({ ...ok, allowlist: [] }).kind).toBe("blocked");
    expect(evaluateBranchCreateGate({ ...ok, repoFullName: "evil/repo" }).kind).toBe("blocked");
  });

  it("정책 위반 branch면 blocked", () => {
    expect(evaluateBranchCreateGate({ ...ok, newBranchName: "main" }).kind).toBe("blocked");
    expect(evaluateBranchCreateGate({ ...ok, newBranchName: "release/x" }).kind).toBe("blocked");
    expect(evaluateBranchCreateGate({ ...ok, newBranchName: "refs/heads/x" }).kind).toBe("blocked");
  });

  it("refs/tags 같은 source ref는 blocked", () => {
    expect(evaluateBranchCreateGate({ ...ok, sourceRef: "refs/tags/v1" }).kind).toBe("blocked");
  });

  it("refspec/shell 메타가 든 source ref는 blocked — newBranchName과 안전성 parity(회귀)", () => {
    // 드리프트 버그: newBranchName은 evaluateBranchNamePolicy로 .. @{ \ 등을 거부하는데, source
    // ref는 normalizeSourceRef(prefix 제거)만 거쳐 그대로 getRefSha의 ref로 흘러가, refspec/shell
    // 메타가 든 source가 통과했다(실측 ok). 보호 브랜치(main 등)는 정당한 source라 prefix/protected는
    // 적용 안 하고 안전 문자/문법만 막는다.
    for (const sourceRef of [
      "main@{0}",
      "main..evil",
      "foo\\bar",
      "refs/heads/main@{upstream}",
      "main ; rm -rf",
      "한글브랜치",
      "feature/x//y",
      "feature/x.",
    ]) {
      expect(evaluateBranchCreateGate({ ...ok, sourceRef }).kind, sourceRef).toBe("blocked");
    }
    // 정상 source ref(보호 브랜치 포함)는 계속 통과 — 오탐 0.
    for (const sourceRef of ["main", "develop", "refs/heads/main", "feature/login", "agent/base"]) {
      expect(evaluateBranchCreateGate({ ...ok, sourceRef }).kind, sourceRef).toBe("ok");
    }
  });
});

describe("isSafeGitRefName", () => {
  it("안전 문자/문법만 통과(보호 브랜치 이름도 안전하면 true)", () => {
    for (const ok of ["main", "develop", "feature/login", "agent/x", "release/1.2", "a"]) {
      expect(isSafeGitRefName(ok), ok).toBe(true);
    }
    for (const bad of ["", "main@{0}", "a..b", "a//b", "a\\b", "a b", "한글", "-lead", "/lead", "trail/", "trail.", "a;rm"]) {
      expect(isSafeGitRefName(bad), bad).toBe(false);
    }
  });
});
