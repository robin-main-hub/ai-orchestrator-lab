/**
 * 코딩 Composer 입력창 상하 리사이저 — 경계(핸들)를 드래그해 입력 textarea 높이를 조절한다.
 * 토론 화면의 VerticalSplitResizer와 같은 결이지만, 비율(fraction)이 아니라 입력창 px 높이를
 * 다룬다(긴 입력을 위해 입력창만 키우고 스레드는 flex로 자동 축소).
 */

export const COMPOSER_INPUT_HEIGHT_STORAGE_KEY = "ai-orchestrator.coding-composer-input-height.v1";
export const COMPOSER_INPUT_MIN_HEIGHT = 56;
export const COMPOSER_INPUT_MAX_HEIGHT = 480;
export const COMPOSER_INPUT_DEFAULT_HEIGHT = 72;

export function clampComposerHeight(value: number): number {
  if (!Number.isFinite(value)) return COMPOSER_INPUT_DEFAULT_HEIGHT;
  return Math.min(COMPOSER_INPUT_MAX_HEIGHT, Math.max(COMPOSER_INPUT_MIN_HEIGHT, Math.round(value)));
}

/** 저장된 입력창 높이 파싱 — 유효하지 않으면 기본값. */
export function parseStoredComposerHeight(raw: string | null | undefined): number {
  if (!raw) return COMPOSER_INPUT_DEFAULT_HEIGHT;
  const value = Number(raw);
  return Number.isFinite(value) ? clampComposerHeight(value) : COMPOSER_INPUT_DEFAULT_HEIGHT;
}

/**
 * 드래그 중 새 높이. 핸들은 입력창 위 경계에 있으므로 포인터를 위로 올리면(현재 Y < 시작 Y)
 * 입력창이 커진다.
 */
export function composerHeightFromDrag(startHeight: number, startY: number, currentY: number): number {
  return clampComposerHeight(startHeight + (startY - currentY));
}

/** 키보드 조절 — ↑ 키우고 ↓ 줄임. 기본 16px, Shift면 48px. 무관한 키는 undefined. */
export function composerHeightAfterKey(current: number, key: string, shiftKey: boolean): number | undefined {
  const step = shiftKey ? 48 : 16;
  if (key === "ArrowUp") return clampComposerHeight(current + step);
  if (key === "ArrowDown") return clampComposerHeight(current - step);
  return undefined;
}
