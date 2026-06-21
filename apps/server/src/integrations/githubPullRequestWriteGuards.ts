import { createHash } from "node:crypto";
import { bodyPreviewOf, isRepoAllowed, scanForSecrets } from "./githubCommentWriteGuards.js";
import { evaluateBranchNamePolicy } from "./githubBranchWriteGuards.js";

/**
 * W4a — GitHub PR create plan 안전 게이트(순수).
 *
 *   - repo allowlist 재사용(W1)
 *   - base branch allowlist: env GITHUB_PR_BASE_ALLOWLIST(기본 "main,develop"). 안전 부담이
 *     큰 곳에 PR을 직접 머지 가능하게 만드는 단계라, base는 별도 env로 좁힌다.
 *   - head branch policy 재사용(W2 — agent/work/user/mission prefix만)
 *   - base != head
 *   - title<=160, body<=16000 + 빈 title 차단
 *   - title/body secret scan 재사용(W1 scanner) — 둘 다 외부 GitHub에 노출됨
 *
 * 게이트는 외부 호출 없이 입력만으로 결정적으로 통과/차단을 도출한다.
 * 실제 base/head 존재 여부와 compare 결과는 호출자가 별도로 GitHub에서 GET한다.
 */

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
/** PR base 이름에 허용되는 문자(서버 측 강제 — env가 잘못 들어와도 안전선 유지). */
const BASE_NAME_SAFE = /^[A-Za-z0-9._/-]+$/;
/**
 * 제어문자(C0 0x00–0x1F, DEL 0x7F). PR title은 단일 라인 필드로 plan store·응답 preview·GitHub
 * PUT으로 흘러가, 줄바꿈/CR/NUL이 섞이면 로그/응답 인젝션·표시 깨짐의 표면이 된다. W5d 라벨 가드
 * (githubPullRequestLabelsUpdateGuards.CONTROL_CHAR_RE)는 같은 이유로 라벨 이름에서 이미 막는데,
 * 동일 단일-라인 필드인 title은 schema(bare z.string())·런타임 가드 어디서도 막지 않았다(실측 ok).
 * (body는 markdown이라 줄바꿈이 정당 — title만 막는다.)
 */
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/u;
/** 기본 base allowlist — env가 비어 있을 때만 적용. main/develop을 보수적 디폴트로. */
const DEFAULT_BASE_ALLOWLIST: ReadonlyArray<string> = ["main", "develop"];

export const PR_TITLE_MAX_CHARS = 160;
export const PR_BODY_MAX_CHARS = 16_000;

/**
 * GITHUB_PR_BASE_ALLOWLIST 파싱. 빈 env이면 기본 main/develop 사용.
 * 안전선: 허용된 이름은 BASE_NAME_SAFE 통과 + protected branch만 의도(소문자 strict).
 */
export function parsePrBaseAllowlist(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_BASE_ALLOWLIST];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && BASE_NAME_SAFE.test(entry));
}

export type BasePolicyResult = { ok: true; baseBranch: string } | { ok: false; reason: string };

export function evaluateBasePolicy(name: string, allowlist: ReadonlyArray<string>): BasePolicyResult {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { ok: false, reason: "base branch가 비어 있습니다" };
  if (trimmed.startsWith("refs/")) return { ok: false, reason: "refs/* 형식은 직접 입력할 수 없습니다(branch 이름만 입력)" };
  if (!BASE_NAME_SAFE.test(trimmed)) return { ok: false, reason: "base branch에 허용되지 않는 문자가 있습니다" };
  if (!allowlist.includes(trimmed)) {
    return {
      ok: false,
      reason: `base branch '${trimmed}'은(는) GITHUB_PR_BASE_ALLOWLIST에 없습니다(허용: ${allowlist.join(", ")})`,
    };
  }
  return { ok: true, baseBranch: trimmed };
}

export type PrCreateGate =
  | {
      kind: "ok";
      repoFullName: string;
      baseBranch: string;
      headBranch: string;
      headRef: string;
      title: string;
      titleSha256: string;
      bodySha256: string;
      bodyPreview: string;
      bodyLength: number;
    }
  | { kind: "blocked"; reason: string };

/**
 * 정적 PR create gate — 외부 호출 없음. 통과 시 호출자가 추가로:
 *   1) base/head 존재 확인,
 *   2) compare base...head 확인,
 *   3) aheadBy/changedFiles>0 확인을 한다.
 */
export function evaluatePrCreateGate(input: {
  repoFullName: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  allowlist: ReadonlyArray<string>;
  baseAllowlist: ReadonlyArray<string>;
  tokenPresent: boolean;
}): PrCreateGate {
  if (!input.tokenPresent) {
    return { kind: "blocked", reason: "GITHUB_TOKEN이 없어 write가 비활성화되어 있습니다" };
  }
  if (input.allowlist.length === 0) {
    return {
      kind: "blocked",
      reason: "GITHUB_WRITE_REPO_ALLOWLIST가 비어 있어 write가 비활성화되어 있습니다",
    };
  }
  if (!REPO_PATTERN.test(input.repoFullName) || !isRepoAllowed(input.repoFullName, input.allowlist)) {
    return { kind: "blocked", reason: `${input.repoFullName}은(는) write 허용 목록에 없습니다` };
  }
  const base = evaluateBasePolicy(input.baseBranch, input.baseAllowlist);
  if (!base.ok) return { kind: "blocked", reason: base.reason };
  const head = evaluateBranchNamePolicy(input.headBranch);
  if (!head.ok) return { kind: "blocked", reason: `head branch 거부: ${head.reason}` };
  if (base.baseBranch === input.headBranch.trim()) {
    return { kind: "blocked", reason: "base와 head가 같습니다 — 비교할 변경이 없습니다" };
  }
  const title = (input.title ?? "").trim();
  if (!title) return { kind: "blocked", reason: "title이 비어 있습니다" };
  if (title.length > PR_TITLE_MAX_CHARS) {
    return { kind: "blocked", reason: `title이 너무 깁니다(최대 ${PR_TITLE_MAX_CHARS}자)` };
  }
  if (CONTROL_CHAR_RE.test(title)) {
    return { kind: "blocked", reason: "title에 제어문자(줄바꿈/CR/NUL 등)가 포함되어 있습니다" };
  }
  const body = input.body ?? "";
  if (body.length > PR_BODY_MAX_CHARS) {
    return { kind: "blocked", reason: `body가 너무 깁니다(최대 ${PR_BODY_MAX_CHARS}자)` };
  }
  // title/body 모두 외부에 노출되므로 secret scan 필수.
  const titleSecret = scanForSecrets(title);
  if (!titleSecret.ok) {
    return { kind: "blocked", reason: `title에서 비밀 패턴 감지(${titleSecret.matched}) — PR 생성을 차단합니다` };
  }
  const bodySecret = scanForSecrets(body);
  if (!bodySecret.ok) {
    return { kind: "blocked", reason: `body에서 비밀 패턴 감지(${bodySecret.matched}) — PR 생성을 차단합니다` };
  }
  const titleSha256 = createHash("sha256").update(title, "utf8").digest("hex");
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  return {
    kind: "ok",
    repoFullName: input.repoFullName,
    baseBranch: base.baseBranch,
    headBranch: input.headBranch.trim(),
    headRef: head.ref,
    title,
    titleSha256,
    bodySha256,
    bodyPreview: bodyPreviewOf(body),
    bodyLength: Buffer.byteLength(body, "utf8"),
  };
}
