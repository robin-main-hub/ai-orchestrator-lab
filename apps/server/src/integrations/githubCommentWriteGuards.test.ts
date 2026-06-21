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

  it("GitLab PAT(glpat-)도 차단 — providers redactor는 잡는데 master 차단 스캐너는 놓쳤다(parity 회귀)", () => {
    // 드리프트: providers errors.ts redactSecretsForLog는 glpat을 비밀로 보고 마스킹하는데,
    // 외부 push 본문을 막는 이 master 차단 스캐너엔 glpat 규칙이 없어 통째로 흘려보냈다(실측
    // ok:true). gitleaks 회피 위해 런타임 조합. GitLab PAT는 glpat- + 20자.
    const glpat = "gl" + "pat-" + "Ab3xZ9kLmNpQ7rSt2UvW";
    const verdict = scanForSecrets(`토큰 노출: ${glpat} 입니다`);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.matched).toContain("GitLab PAT");
    // 산문에 'glpat'라는 단어만 있고 토큰 형태(- + 20자)가 아니면 오탐 아님.
    expect(scanForSecrets("the glpat prefix denotes a GitLab token")).toEqual({ ok: true });
  });

  it("모던 OpenAI 키(sk-proj-/sk-svcacct-/sk-admin-)도 차단 — 본문 '-'·'_'로 classic sk-{40,}가 놓침", () => {
    // 2024+ OpenAI 키는 본문에 '-'·'_'가 섞여 pure-alnum sk-{40,} run이 끊겨 빠져나갔다(실측
    // false-negative). H8d runner scanner는 broader sk-[...]{16,}로 이미 잡는 parity gap.
    // gitleaks 회피 위해 토큰은 런타임 조합.
    const proj = "sk-" + "proj-" + "A".repeat(20) + "_" + "b".repeat(20) + "-" + "C".repeat(20);
    const svc = "sk-" + "svcacct-" + "D".repeat(30) + "-" + "e".repeat(30);
    const admin = "sk-" + "admin-" + "F".repeat(40);
    for (const tok of [proj, svc, admin]) {
      const verdict = scanForSecrets(`키 교체: ${tok} 적용`);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.matched).toContain("OpenAI project key");
    }
    // 산문에 흔한 'sk-learn'(scikit-learn) 등 비-키 토큰은 오탐하지 않는다(limited prefix).
    expect(scanForSecrets("we use sk-learn-pipelines-and-transformers-extensively here")).toEqual({ ok: true });
  });

  it("env-style 키워드 대입(PASSWORD=/API_KEY:/DB_TOKEN=)도 차단 — H8d 블로커·redactor엔 있는데 master만 놓쳤다(parity 회귀)", () => {
    // 드리프트: prefix 없는 평문 비밀(.env의 password=… 형태)은 token prefix(ghp_/sk-/AKIA)도
    // PEM 표식도 없어 위 규칙들을 전부 빠져나갔다(실측 ok:true). 형제 차단 게이트 H8d
    // runnerPatchSafety(env_secret_assign)와 redactor errors.ts는 같은 규칙을 이미 갖는데
    // master 차단 스캐너만 빠져, 같은 평문 비밀이 comment/PR·commit/file로 외부 push될 수 있었다.
    // gitleaks가 PR diff에서 contiguous한 KEY=value 리터럴을 진짜 비밀로 오탐하므로 런타임 조합.
    const eq = "=";
    const colon = ": ";
    for (const sample of [
      "PASSWORD" + eq + "hunter2secretvalue",
      "API_KEY" + eq + "abc123def456ghi789",
      "DB_PASSWORD" + colon + "superlongsecret",
      "AUTH_TOKEN" + eq + "zzzz1111yyyy2222",
      "MY_ACCESS_TOKEN" + eq + "mmmmnnnnoooo",
      "GITHUB_API-KEY " + eq + " qqqqwwwweeee",
    ]) {
      const verdict = scanForSecrets(sample);
      expect(verdict.ok, `should block: ${sample}`).toBe(false);
      if (!verdict.ok) expect(verdict.matched).toContain("env-style");
    }
    // 오탐 방지: 대입(=/:)+값이 아닌 산문은 통과 — 키워드 단어만 있고 토큰 형태가 아님.
    expect(scanForSecrets("the password is required for login")).toEqual({ ok: true });
    expect(scanForSecrets("see the token bucket algorithm docs")).toEqual({ ok: true });
    expect(scanForSecrets("rotate your secret regularly please")).toEqual({ ok: true });
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
