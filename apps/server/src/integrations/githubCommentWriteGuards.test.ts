import { describe, expect, it } from "vitest";
import {
  COMMENT_BODY_MAX_CHARS,
  bodyPreviewOf,
  bodySha256,
  evaluateCommentWriteGate,
  isRepoAllowed,
  parseRepoAllowlist,
  scanForSecrets,
} from "./githubCommentWriteGuards";

describe("parseRepoAllowlist + isRepoAllowed", () => {
  it("쉼표 구분 + 공백 제거 + owner/repo 형식만 통과", () => {
    expect(parseRepoAllowlist("robin/lab, owner2/repo2 , bad-only-one")).toEqual(["robin/lab", "owner2/repo2"]);
    expect(parseRepoAllowlist(undefined)).toEqual([]);
    expect(parseRepoAllowlist("")).toEqual([]);
  });

  it("allowlist에 정확히 일치할 때만 허용 — path/owner 우회 차단", () => {
    const list = ["robin/lab"];
    expect(isRepoAllowed("robin/lab", list)).toBe(true);
    expect(isRepoAllowed("robin/lab-extra", list)).toBe(false);
    expect(isRepoAllowed("../../admin", list)).toBe(false);
    expect(isRepoAllowed("robin/lab/sub", list)).toBe(false);
  });
});

describe("scanForSecrets", () => {
  it("흔한 토큰/키 패턴은 차단", () => {
    const samples = [
      "PR fix using ghp_1234567890abcdefghijabcdef token",
      "AWS key AKIAABCDEFGHIJKLMNOP",
      "Authorization: Bearer abcdef",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpA…",
      "sk-ant-1234567890abcdefghij1234567890",
    ];
    for (const sample of samples) {
      const verdict = scanForSecrets(sample);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.matched.length).toBeGreaterThan(0);
    }
  });

  it("세분화(fine-grained) PAT(github_pat_)도 차단 — classic prefix와 달라 별도 패턴 필요", () => {
    // gitleaks가 PR diff에서 진짜로 보이는 credential 리터럴을 잡으므로 런타임 조합으로 회피.
    const pat = "github_" + "pat_" + "11" + "A".repeat(22) + "_" + "b".repeat(40);
    const verdict = scanForSecrets(`교체 토큰: ${pat} 입니다`);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.matched).toContain("github_pat_");
  });

  it("헤더 없이 노출된 bare bearer 토큰도 차단(회귀: Authorization: 접두 없으면 빠져나갔다)", () => {
    // `Authorization: Bearer` 규칙은 헤더 형태만 잡아, 따옴표 안/설정값으로 들어온 토큰은
    // false-negative였다. H8d는 generic Bearer로 잡는데 W1 공유 스캐너엔 없어 parity gap.
    const jwt = "eyJhbGciOiJIUzI1NiJ9." + "a".repeat(30) + "." + "b".repeat(40);
    const verdict = scanForSecrets(`const h = "Bearer ${jwt}";`);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.matched).toBe("Bearer token");
    // 짧은 토큰성 단어(예: 산문 "Bearer of news")는 8자 미만이라 오탐 아님
    expect(scanForSecrets("the Bearer of bad news arrived")).toEqual({ ok: true });
  });

  it("정상 본문은 통과", () => {
    expect(scanForSecrets("이 PR의 변경 의도를 확인했습니다. 이대로 머지 가능합니다.")).toEqual({ ok: true });
  });
});

describe("bodySha256 + bodyPreviewOf — 결정적", () => {
  it("같은 본문은 같은 sha, 다른 본문은 다른 sha", () => {
    const a = bodySha256("hello");
    expect(a).toBe(bodySha256("hello"));
    expect(a).not.toBe(bodySha256("hello "));
  });

  it("preview는 maxChars로 잘리고 … 표시", () => {
    expect(bodyPreviewOf("abc")).toBe("abc");
    const long = "x".repeat(500);
    const preview = bodyPreviewOf(long, 100);
    expect(preview.length).toBe(100);
    expect(preview.endsWith("…")).toBe(true);
  });
});

describe("evaluateCommentWriteGate — 양보 불가 안전선", () => {
  const allow = ["robin/lab"];
  const ok = { repoFullName: "robin/lab", body: "정상 댓글 본문입니다.", allowlist: allow, tokenPresent: true };

  it("정상 입력이면 ok + sha/preview", () => {
    const v = evaluateCommentWriteGate(ok);
    expect(v.kind).toBe("ok");
    if (v.kind === "ok") {
      expect(v.sha).toBe(bodySha256(ok.body));
      expect(v.preview.length).toBeLessThanOrEqual(ok.body.length);
    }
  });

  it("token 없으면 차단(write disabled)", () => {
    const v = evaluateCommentWriteGate({ ...ok, tokenPresent: false });
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toContain("GITHUB_TOKEN");
  });

  it("allowlist가 비어 있으면 차단(write disabled)", () => {
    const v = evaluateCommentWriteGate({ ...ok, allowlist: [] });
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toContain("ALLOWLIST");
  });

  it("allowlist에 없는 repo는 차단", () => {
    const v = evaluateCommentWriteGate({ ...ok, repoFullName: "robin/other" });
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toContain("허용 목록에 없습니다");
  });

  it("body가 너무 길거나 비어 있으면 차단", () => {
    expect(evaluateCommentWriteGate({ ...ok, body: " " }).kind).toBe("blocked");
    expect(evaluateCommentWriteGate({ ...ok, body: "x".repeat(COMMENT_BODY_MAX_CHARS + 1) }).kind).toBe("blocked");
  });

  it("body에 비밀 패턴 있으면 차단(외부 GitHub로 비밀 누출 방지)", () => {
    const v = evaluateCommentWriteGate({ ...ok, body: "디버그: ghp_1234567890abcdefghijabcdef" });
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toContain("비밀 패턴");
  });
});
