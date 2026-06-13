/**
 * 수직 분할 리사이저 — 토론 화면의 상단/하단 비율을 드래그로 조절한다.
 * ChatSidePanel의 좌우 리사이저와 동일한 구조(방향만 수직).
 */

export const VERTICAL_SPLIT_STORAGE_KEY = "ai-orchestrator.vertical-split.v1";
export const VERTICAL_SPLIT_MAX_TOP_FRACTION = 0.75;
export const VERTICAL_SPLIT_MIN_TOP_FRACTION = 0.15;
export const VERTICAL_SPLIT_DEFAULT_FRACTION = 0.42;

/** 저장된 분할 비율(0~1) 파싱. 유효하지 않으면 기본값. */
export function parseStoredSplitFraction(raw: string | null | undefined): number {
  if (!raw) return VERTICAL_SPLIT_DEFAULT_FRACTION;
  const value = Number(raw);
  if (!Number.isFinite(value)) return VERTICAL_SPLIT_DEFAULT_FRACTION;
  return clampFraction(value);
}

/** 드래그 중 포인터 Y → 새 fraction. containerTop/Height는 컨테이너 rect, pointerY는 clientY. */
export function fractionFromPointerY(containerTop: number, containerHeight: number, pointerY: number): number {
  if (containerHeight <= 0) return VERTICAL_SPLIT_DEFAULT_FRACTION;
  return clampFraction((pointerY - containerTop) / containerHeight);
}

/** 키보드 조절 — ↑/← 줄임, ↓/→ 늘림. 기본 5%, Shift면 10%. 무관한 키는 undefined. */
export function fractionAfterKey(current: number, key: string, shiftKey: boolean): number | undefined {
  const step = shiftKey ? 0.1 : 0.05;
  if (key === "ArrowUp" || key === "ArrowLeft") return clampFraction(current - step);
  if (key === "ArrowDown" || key === "ArrowRight") return clampFraction(current + step);
  return undefined;
}

function clampFraction(value: number): number {
  return Math.min(VERTICAL_SPLIT_MAX_TOP_FRACTION, Math.max(VERTICAL_SPLIT_MIN_TOP_FRACTION, value));
}
