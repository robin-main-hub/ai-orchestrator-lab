import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * 다이얼로그/드로어용 포커스 트랩 훅 — ControlQueueDrawer 의 트랩 로직을 재사용 가능한
 * 훅으로 승격한 것. open 되면 트리거를 기억하고 rAF 로 초기 포커스를 넣으며, Escape 닫기 /
 * Tab·Shift+Tab 순환 / 컨테이너 밖으로 새는 포커스 재포획을 처리한다. 닫히면 리스너를
 * 정리하고(restoreFocus 시) 트리거로 포커스를 되돌린다. document.body 에 inert 를 걸지 않는다.
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface UseDialogFocusOptions {
  open: boolean;
  onClose?: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
}

export interface UseDialogFocusResult<T extends HTMLElement> {
  containerRef: RefObject<T | null>;
}

export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  options: UseDialogFocusOptions,
): UseDialogFocusResult<T> {
  const { open, onClose, initialFocusRef, restoreFocus = true } = options;
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function getFocusableElements(): HTMLElement[] {
      const container = containerRef.current;
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
    }

    function focusFirstElement() {
      const preferred = initialFocusRef?.current;
      const first = preferred ?? getFocusableElements()[0] ?? containerRef.current;
      first?.focus();
    }

    const supportsRaf =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
    const frame = supportsRaf ? window.requestAnimationFrame(focusFirstElement) : null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const container = containerRef.current;
      if (!container || !(event.target instanceof Node) || container.contains(event.target)) return;
      focusFirstElement();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      if (frame != null && supportsRaf) window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      if (restoreFocus && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, onClose]);

  return { containerRef };
}
