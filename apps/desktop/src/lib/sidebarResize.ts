/**
 * 코딩 워크벤치 좌측 사이드바 좌우 리사이저 — aside↔section 경계(핸들)를 드래그해
 * 사이드바 폭(px)을 조절한다. composerResize(상하 px)와 같은 결이지만 가로축.
 */

export const SIDEBAR_WIDTH_STORAGE_KEY = "ai-orchestrator.coding-sidebar-width.v1";
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 252;

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

/** 저장된 사이드바 폭 파싱 — 없거나 잘못되면 기본값. */
export function parseStoredSidebarWidth(raw: string | null | undefined): number {
  if (!raw) return SIDEBAR_DEFAULT_WIDTH;
  const value = Number(raw);
  return Number.isFinite(value) ? clampSidebarWidth(value) : SIDEBAR_DEFAULT_WIDTH;
}

/**
 * 드래그 중 새 폭. 핸들은 사이드바 우측 경계에 있으므로 폭 = 포인터 X − 컨테이너 좌측 X.
 * containerLeft는 컨테이너 rect.left, clientX는 포인터 clientX.
 */
export function sidebarWidthFromPointerX(containerLeft: number, clientX: number): number {
  return clampSidebarWidth(clientX - containerLeft);
}

/** 키보드 조절 — ← 줄이고 → 키움. 기본 16px, Shift면 48px. 무관한 키는 undefined. */
export function sidebarWidthAfterKey(current: number, key: string, shiftKey: boolean): number | undefined {
  const step = shiftKey ? 48 : 16;
  if (key === "ArrowRight") return clampSidebarWidth(current + step);
  if (key === "ArrowLeft") return clampSidebarWidth(current - step);
  return undefined;
}
