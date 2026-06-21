import { createHash } from "node:crypto";
import { isRepoAllowed, scanForSecrets } from "./githubCommentWriteGuards.js";

/**
 * W5c — GitHub PR title/body update 게이트(순수).
 *
 *   - repo allowlist 재사용(W1)
 *   - title<=160, body<=16000(빈 body 허용; 빈 title은 변경 의도 없으면 그대로 — 변경 의도가 있으면 비허용)
 *   - title/body secret scan(W1 scanner) — 외부 노출 표면
 *   - 게이트는 입력만으로 결정 — TOCTOU/PR 존재 확인은 호출자가 GitHub로 가서 한다.
 *
 * 좁은 범위(W5c):
 *   - 변경 가능: title, body
 *   - 변경 불가(아예 입력으로 받지 않음): draft, base, state(close), labels, assignees, reviewers
 */

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
/**
 * 제어문자(C0 0x00–0x1F, DEL 0x7F). title은 단일 라인 필드로 plan store·응답 excerpt·GitHub PATCH로
 * 흘러가, 줄바꿈/CR/NUL이 섞이면 로그/응답 인젝션·표시 깨짐 표면. W5d 라벨 가드와 W4a create 가드는
 * 같은 이유로 막는데 이 update 경로만 빠져 있었다(실측 ok). body는 markdown이라 줄바꿈 정당 — title만 막는다.
 */
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/u;

export const PR_UPDATE_TITLE_MAX_CHARS = 160;
export const PR_UPDATE_BODY_MAX_CHARS = 16_000;
export const PR_UPDATE_BODY_EXCERPT_MAX = 240;

export type PrUpdateGate =
  | {
      kind: "ok";
      repoFullName: string;
      pullNumber: number;
      /** 새 title이 들어왔으면 trim된 값, 아니면 undefined. */
      newTitle?: string;
      newTitleSha256?: string;
      /** 새 body가 들어왔으면 원본, 아니면 undefined. body excerpt는 응답용. */
      newBody?: string;
      newBodySha256?: string;
      newBodyExcerpt?: string;
      newBodyLength?: number;
    }
  | { kind: "blocked"; reason: PrUpdateBlockReason; message: string };

export type PrUpdateBlockReason =
  | "allowlist"
  | "title_too_long"
  | "title_control_char"
  | "body_too_long"
  | "secret_suspect"
  | "empty_change";

function block(reason: PrUpdateBlockReason, message: string): PrUpdateGate {
  return { kind: "blocked", reason, message };
}

/** body 앞부분만 노출(긴 본문 전체를 응답/트레이스에 흘리지 않는다). */
export function bodyExcerptOf(body: string): string {
  const trimmed = (body ?? "").trim();
  if (trimmed.length <= PR_UPDATE_BODY_EXCERPT_MAX) return trimmed;
  return `${trimmed.slice(0, PR_UPDATE_BODY_EXCERPT_MAX)}…`;
}

export function evaluatePrUpdateGate(input: {
  repoFullName: string;
  pullNumber: number;
  newTitle?: string;
  newBody?: string;
  allowlist: ReadonlyArray<string>;
  tokenPresent: boolean;
}): PrUpdateGate {
  if (!input.tokenPresent) {
    return block("allowlist", "GITHUB_TOKEN이 없어 write가 비활성화되어 있습니다");
  }
  if (input.allowlist.length === 0) {
    return block("allowlist", "GITHUB_WRITE_REPO_ALLOWLIST가 비어 있어 write가 비활성화되어 있습니다");
  }
  if (!REPO_PATTERN.test(input.repoFullName) || !isRepoAllowed(input.repoFullName, input.allowlist)) {
    return block("allowlist", `${input.repoFullName}은(는) write 허용 목록에 없습니다`);
  }
  if (input.newTitle === undefined && input.newBody === undefined) {
    return block("empty_change", "변경 의도가 없습니다 — title 또는 body 중 하나는 지정해야 합니다");
  }
  let newTitle: string | undefined;
  let newTitleSha256: string | undefined;
  if (input.newTitle !== undefined) {
    const trimmed = input.newTitle.trim();
    if (!trimmed) {
      return block("title_too_long", "title을 비울 수 없습니다(W5c는 빈 title 허용 안 함)");
    }
    if (trimmed.length > PR_UPDATE_TITLE_MAX_CHARS) {
      return block("title_too_long", `title이 너무 깁니다(최대 ${PR_UPDATE_TITLE_MAX_CHARS}자)`);
    }
    if (CONTROL_CHAR_RE.test(trimmed)) {
      return block("title_control_char", "title에 제어문자(줄바꿈/CR/NUL 등)가 포함되어 있습니다");
    }
    const titleSecret = scanForSecrets(trimmed);
    if (!titleSecret.ok) {
      return block("secret_suspect", `title에서 비밀 패턴 감지(${titleSecret.matched}) — update를 차단합니다`);
    }
    newTitle = trimmed;
    newTitleSha256 = createHash("sha256").update(trimmed, "utf8").digest("hex");
  }
  let newBody: string | undefined;
  let newBodySha256: string | undefined;
  let newBodyExcerpt: string | undefined;
  let newBodyLength: number | undefined;
  if (input.newBody !== undefined) {
    if (input.newBody.length > PR_UPDATE_BODY_MAX_CHARS) {
      return block("body_too_long", `body가 너무 깁니다(최대 ${PR_UPDATE_BODY_MAX_CHARS}자)`);
    }
    const bodySecret = scanForSecrets(input.newBody);
    if (!bodySecret.ok) {
      return block("secret_suspect", `body에서 비밀 패턴 감지(${bodySecret.matched}) — update를 차단합니다`);
    }
    newBody = input.newBody;
    newBodySha256 = createHash("sha256").update(input.newBody, "utf8").digest("hex");
    newBodyExcerpt = bodyExcerptOf(input.newBody);
    newBodyLength = Buffer.byteLength(input.newBody, "utf8");
  }
  return {
    kind: "ok",
    repoFullName: input.repoFullName,
    pullNumber: input.pullNumber,
    newTitle,
    newTitleSha256,
    newBody,
    newBodySha256,
    newBodyExcerpt,
    newBodyLength,
  };
}

/** 평탄한 sha256 헬퍼 — current PR title/body에서 사용. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
