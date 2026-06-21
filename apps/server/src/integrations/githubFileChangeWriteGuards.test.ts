import { describe, expect, it } from "vitest";
import {
  contentSha256,
  evaluateBaseContentSafety,
  evaluateFileChangeGate,
  evaluateFilePathPolicy,
  evaluateNewContentSafety,
  FILE_CONTENT_MAX_BYTES,
} from "./githubFileChangeWriteGuards";

describe("evaluateFilePathPolicy", () => {
  it("정상 path는 통과 + 정규화", () => {
    expect(evaluateFilePathPolicy("src/foo/bar.ts")).toEqual({ ok: true, normalized: "src/foo/bar.ts" });
    expect(evaluateFilePathPolicy("./apps/server/src/index.ts")).toEqual({ ok: true, normalized: "apps/server/src/index.ts" });
    expect(evaluateFilePathPolicy("docs/README.md")).toEqual({ ok: true, normalized: "docs/README.md" });
  });

  it("traversal/absolute/null/backslash 차단", () => {
    expect(evaluateFilePathPolicy("../escape").ok).toBe(false);
    expect(evaluateFilePathPolicy("src/../secret").ok).toBe(false);
    expect(evaluateFilePathPolicy("/etc/passwd").ok).toBe(false);
    expect(evaluateFilePathPolicy("src/a\0b").ok).toBe(false);
    expect(evaluateFilePathPolicy("src\\windows").ok).toBe(false);
  });

  it("빈 segment/끝슬래시/빈 path 차단", () => {
    expect(evaluateFilePathPolicy("").ok).toBe(false);
    expect(evaluateFilePathPolicy("src//bar.ts").ok).toBe(false);
    expect(evaluateFilePathPolicy("src/dir/").ok).toBe(false);
  });

  it("위험 path 패턴 차단", () => {
    for (const bad of [
      ".env",
      ".env.production",
      "config/.env.local",
      "secret.pem",
      "keys/id_rsa",
      "keys/id_ed25519.pub",
      ".github/workflows/ci.yml",
      ".git/config",
      "node_modules/foo/index.js",
      "dist/index.js",
      "build/output.js",
      ".next/cache.json",
      "coverage/lcov.info",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
    ]) {
      const v = evaluateFilePathPolicy(bad);
      expect(v.ok, `should reject: ${bad}`).toBe(false);
    }
  });

  it("env/ 디렉터리·secrets 경로 차단 — 형제 multi-file 가드와 parity(회귀)", () => {
    // 드리프트 버그: 형제 githubMultiFileCommit.checkPath는 막는데 이 단일파일 가드가 빠뜨려
    // env/production.json·secrets.yaml 같은 비밀 저장 경로를 단일파일 write로는 허용했다(실측 ok:true).
    for (const bad of [
      "env/production.json",
      "config/env/db.yaml",
      "secrets.yaml",
      "secret.json",
      "secrets/db.txt",
      "app/secrets/keys.json",
    ]) {
      expect(evaluateFilePathPolicy(bad).ok, `should reject: ${bad}`).toBe(false);
    }
    // 오탐 방지: 이름에 env/secret이 들어가도 segment가 아니면 통과(environment·my-secrets-doc.md)
    expect(evaluateFilePathPolicy("src/environment.ts").ok).toBe(true);
    expect(evaluateFilePathPolicy("docs/env-setup.md").ok).toBe(true);
  });

  it("이름에 ..가 들어 있어도 segment가 아니면 통과(예: foo..bar)", () => {
    expect(evaluateFilePathPolicy("src/foo..bar.ts").ok).toBe(true);
  });

  it("'.' segment 차단 — deny-list 정규화 회피 방지(회귀)", () => {
    // git/GitHub가 '.' segment를 접어 .github/workflows/evil.yml로 쓰는데, deny-list는
    // 연속 substring 매칭이라 .github/./workflows/...가 차단을 빠져나갔다(정규화 회피).
    expect(evaluateFilePathPolicy(".github/./workflows/evil.yml").ok).toBe(false);
    expect(evaluateFilePathPolicy("a/./b").ok).toBe(false);
    expect(evaluateFilePathPolicy("a/b/.").ok).toBe(false);
    expect(evaluateFilePathPolicy(".").ok).toBe(false);
    // 정상 hidden 파일/디렉터리(. 으로 시작하지만 '.' segment 아님)는 계속 통과
    expect(evaluateFilePathPolicy(".gitignore").ok).toBe(true);
    expect(evaluateFilePathPolicy("src/.hidden/file.ts").ok).toBe(true);
    // leading "./"는 정규화로 제거되므로 여전히 통과
    expect(evaluateFilePathPolicy("./src/index.ts")).toEqual({ ok: true, normalized: "src/index.ts" });
  });

  it("대소문자 변형 위험 경로도 차단 — 형제 multi-file 가드(W5b)와 case-insensitive parity(회귀)", () => {
    // 드리프트: 형제 githubMultiFileCommit.HIGH_RISK_PATH_PATTERNS는 모든 규칙이 /i인데 이
    // 단일파일 가드의 id_rsa·.github/workflows·.git·node_modules·dist·build·.next·coverage·
    // lockfile 규칙만 /i가 빠져, 대소문자 변형 경로가 multi-file commit으로는 막히는데(W5b
    // ok:false) 단일파일 write로는 통과했다(실측 W3a ok:true). ID_RSA(SSH 개인키)·.GitHub/
    // workflows(CI 트리거 표면)가 대표 위험. 같은 .env/.pem/.key 규칙은 이미 /i인데 id_rsa만
    // 빠진 내부 비일관성도 동시 해소. 강화 방향이라 부작용 경로 변화 없음.
    for (const bad of [
      "ID_RSA",
      "keys/Id_Rsa",
      ".GitHub/workflows/evil.yml",
      ".GIT/config",
      "Node_Modules/x.js",
      "Dist/app.js",
      "Build/out.js",
      "Coverage/lcov.info",
      "PNPM-Lock.yaml",
      "Yarn.Lock",
    ]) {
      expect(evaluateFilePathPolicy(bad).ok, `should reject: ${bad}`).toBe(false);
    }
    // 오탐 방지: 정당한 소스 경로는 계속 통과(키워드가 segment 일부일 뿐 위험 디렉터리/파일 아님)
    expect(evaluateFilePathPolicy("src/distributor.ts").ok).toBe(true);
    expect(evaluateFilePathPolicy("src/builder/index.ts").ok).toBe(true);
    expect(evaluateFilePathPolicy("docs/coverage-notes.md").ok).toBe(true);
  });

  it("파일로 존재하는 .git(nested gitdir 포인터)도 차단 — 형제 W5b와 positional parity(회귀)", () => {
    // 드리프트: 이전 .git 규칙 `(^|/)\.git/` + `p === ".git"`는 디렉터리와 정확히 루트 .git
    // 파일만 잡아, submodule/.git·a/b/.git처럼 nested 위치의 .git *파일*(gitdir 포인터)을
    // 흘려보냈다(실측 W3a ok:true vs 형제 githubMultiFileCommit.checkPath ok:false). 형제는
    // `(^|/)\.git(/|$)/i`로 파일/디렉터리 양쪽을 막으므로 같은 정규식으로 parity.
    for (const bad of [".git", "submodule/.git", "a/b/.git", ".git/config", "vendor/.git/HEAD"]) {
      expect(evaluateFilePathPolicy(bad).ok, `should reject: ${bad}`).toBe(false);
    }
    // `(/|$)` 경계라 정당 dotfile(.gitignore/.gitattributes/.gitkeep)은 계속 통과 — 오탐 없음
    expect(evaluateFilePathPolicy(".gitignore").ok).toBe(true);
    expect(evaluateFilePathPolicy(".gitattributes").ok).toBe(true);
    expect(evaluateFilePathPolicy("src/.gitkeep").ok).toBe(true);
  });
});

describe("evaluateNewContentSafety", () => {
  it("정상 텍스트는 통과 + sha256", () => {
    const v = evaluateNewContentSafety("hello\nworld\n");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.size).toBe(Buffer.byteLength("hello\nworld\n", "utf8"));
      expect(v.sha256).toBe(contentSha256("hello\nworld\n"));
    }
  });

  it("NUL 포함 binary 차단", () => {
    expect(evaluateNewContentSafety("hello\0world").ok).toBe(false);
  });

  it("size 한도 초과 차단", () => {
    const big = "a".repeat(FILE_CONTENT_MAX_BYTES + 1);
    expect(evaluateNewContentSafety(big).ok).toBe(false);
  });

  it("base 콘텐츠도 동일 가드를 통과해야 함", () => {
    expect(evaluateBaseContentSafety("hello").ok).toBe(true);
    expect(evaluateBaseContentSafety("hello\0world").ok).toBe(false);
  });
});

describe("evaluateFileChangeGate", () => {
  const ok = {
    repoFullName: "robin/lab",
    branchName: "agent/feature-x",
    path: "src/index.ts",
    newContent: "console.log('hello');\n",
    allowlist: ["robin/lab"],
    tokenPresent: true,
  };

  it("정상 입력 통과 + 정규화 결과 반환", () => {
    const v = evaluateFileChangeGate(ok);
    expect(v.kind).toBe("ok");
    if (v.kind === "ok") {
      expect(v.branchRef).toBe("refs/heads/agent/feature-x");
      expect(v.path).toBe("src/index.ts");
      expect(v.newContentBytes).toBeGreaterThan(0);
      expect(v.newContentSha256).toBe(contentSha256(ok.newContent));
    }
  });

  it("token/allowlist 없으면 blocked", () => {
    expect(evaluateFileChangeGate({ ...ok, tokenPresent: false }).kind).toBe("blocked");
    expect(evaluateFileChangeGate({ ...ok, allowlist: [] }).kind).toBe("blocked");
    expect(evaluateFileChangeGate({ ...ok, repoFullName: "evil/repo" }).kind).toBe("blocked");
  });

  it("보호 브랜치/금지 prefix 차단(W2 정책 재사용)", () => {
    for (const bad of ["main", "develop", "release/x", "refs/heads/x", "random-feature"]) {
      expect(evaluateFileChangeGate({ ...ok, branchName: bad }).kind).toBe("blocked");
    }
  });

  it("위험 path 차단", () => {
    expect(evaluateFileChangeGate({ ...ok, path: ".env" }).kind).toBe("blocked");
    expect(evaluateFileChangeGate({ ...ok, path: ".github/workflows/ci.yml" }).kind).toBe("blocked");
    expect(evaluateFileChangeGate({ ...ok, path: "package-lock.json" }).kind).toBe("blocked");
    // '.' segment로 deny-list를 회피하려는 시도도 게이트에서 차단(외부 PUT까지 도달 불가)
    expect(evaluateFileChangeGate({ ...ok, path: ".github/./workflows/evil.yml" }).kind).toBe("blocked");
  });

  it("비밀 패턴 콘텐츠 차단(W1 secret scan 재사용)", () => {
    // ghp_ 패턴
    expect(evaluateFileChangeGate({ ...ok, newContent: "token = ghp_1234567890abcdefghijabcdef" }).kind).toBe("blocked");
    // PEM 블록
    expect(evaluateFileChangeGate({ ...ok, newContent: "-----BEGIN PRIVATE KEY-----\n..." }).kind).toBe("blocked");
  });

  it("binary content 차단(NUL)", () => {
    expect(evaluateFileChangeGate({ ...ok, newContent: "hello\0bye" }).kind).toBe("blocked");
  });
});
