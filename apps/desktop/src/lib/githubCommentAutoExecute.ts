/**
 * W1b — GitHub PR/Issue comment 자동게시 armed guard.
 *
 * 핵심 분리: 코딩 자동승인(codingAutoApproval)과 STATE/UI/문구 전부 별개다.
 *   - 코딩 자동승인은 로컬/샌드박스 명령 자동 실행
 *   - GitHub 자동게시 armed는 외부 GitHub에 흔적이 남는 작업
 * 두 가지를 하나의 모드로 묶으면 위험하다 — 사용자가 "코딩 자동승인 켰다"는 의식이
 * GitHub 자동게시까지 켰다는 의식과 같지 않다.
 *
 * 기본은 OFF. 처음 켤 때 강한 경고("외부 GitHub에 흔적이 남는다", "comment create only")를
 * 보여주고 사용자가 확인해야만 armed 시각이 저장된다. armed는 세션(localStorage) + 짧은 TTL.
 * 어떤 armed 상태도 GitHub 게이트(allowlist/bodySha/secret/preflight)를 우회하지 않는다.
 */

export const GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY = "ai-orchestrator.github-comment-autoexecute.armed.v1";
/** armed TTL — 너무 길면 잊고 외부에 게시될 위험이 커진다. */
export const GITHUB_COMMENT_AUTOEXECUTE_ARMED_TTL_MS = 30 * 60 * 1000; // 30분

export const GITHUB_COMMENT_AUTOEXECUTE_WARNING = [
  "GitHub 댓글 자동게시를 켜시겠어요?",
  "이 기능을 켜면 이 세션에서 승인된 댓글 계획이 GitHub에 실제로 게시될 수 있습니다.",
  "게시된 댓글은 외부 GitHub 저장소/PR/Issue에 남습니다.",
  "코드 변경·브랜치 생성·PR 생성·머지는 포함되지 않습니다(comment create만).",
  "대상 repo allowlist와 body 무결성 검사는 그대로 적용됩니다.",
].join("\n");

export type AutoExecuteArmedState = { armedAt: string; expiresAt: string };

/**
 * 저장된 armed 상태가 유효한가? armedAt이 유효하고 expiresAt이 아직 안 지난 경우에만 true.
 * 그 외(아무것도 없음 / 깨진 JSON / 만료)는 모두 false — 만료된 표식을 신뢰하지 않는다.
 */
export function parseArmedState(raw: string | null | undefined, nowIso: string): AutoExecuteArmedState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { armedAt?: unknown; expiresAt?: unknown };
    if (typeof parsed.armedAt !== "string" || typeof parsed.expiresAt !== "string") return null;
    const expiresAtMs = Date.parse(parsed.expiresAt);
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs) || expiresAtMs <= nowMs) return null;
    return { armedAt: parsed.armedAt, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function isArmed(state: AutoExecuteArmedState | null): boolean {
  return state !== null;
}

/** "이제 켜겠습니다" 확인 시 만들 새 armed 상태 — 짧은 TTL로 묶는다. */
export function createArmedState(nowIso: string, ttlMs: number = GITHUB_COMMENT_AUTOEXECUTE_ARMED_TTL_MS): AutoExecuteArmedState {
  const nowMs = Date.parse(nowIso);
  const expiresAtMs = (Number.isFinite(nowMs) ? nowMs : Date.now()) + ttlMs;
  return { armedAt: nowIso, expiresAt: new Date(expiresAtMs).toISOString() };
}
