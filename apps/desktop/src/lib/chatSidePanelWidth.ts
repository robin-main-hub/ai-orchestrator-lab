/**
 * ChatSidePanel 폭 조절의 순수 코어 — 마누스의 right-rail 리사이저(#477) 상호작용
 * 패턴(드래그+키보드+localStorage)을 패널 자체로 이식한 것. 패널은 우측에 붙으므로
 * 왼쪽 가장자리를 잡고 왼쪽으로 끌수록 넓어진다.
 */

export const CHAT_SIDE_PANEL_MIN_WIDTH_PX = 280;
export const CHAT_SIDE_PANEL_MAX_WIDTH_PX = 560;
export const CHAT_SIDE_PANEL_DEFAULT_WIDTH_PX = 360;
export const CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY = "ai-orchestrator.chat-side-panel-width.v1";

export function clampPanelWidth(value: number): number {
  return Math.min(Math.max(Math.round(value), CHAT_SIDE_PANEL_MIN_WIDTH_PX), CHAT_SIDE_PANEL_MAX_WIDTH_PX);
}

/** localStorage 등 외부 입력 — 숫자가 아니면 기본값 */
export function parseStoredPanelWidth(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return CHAT_SIDE_PANEL_DEFAULT_WIDTH_PX;
  }
  return clampPanelWidth(value);
}

/**
 * 드래그 중 포인터 X → 패널 폭. anchorRight는 드래그 시작 시점의 패널 우측 변
 * (viewport 좌표) — 레이아웃이 어디 있든 패널 오른쪽 끝을 기준으로 계산한다.
 */
export function panelWidthFromPointerX(anchorRight: number, clientX: number): number {
  return clampPanelWidth(anchorRight - clientX);
}

/** 키보드 한 칸 — ArrowLeft=넓게, ArrowRight=좁게 (우측 패널 기준), Shift=큰 걸음 */
export function panelWidthAfterKey(
  current: number,
  key: string,
  shiftKey: boolean,
): number | undefined {
  const step = shiftKey ? 48 : 24;
  switch (key) {
    case "ArrowLeft":
      return clampPanelWidth(current + step);
    case "ArrowRight":
      return clampPanelWidth(current - step);
    case "Home":
      return CHAT_SIDE_PANEL_MIN_WIDTH_PX;
    case "End":
      return CHAT_SIDE_PANEL_MAX_WIDTH_PX;
    default:
      return undefined;
  }
}
