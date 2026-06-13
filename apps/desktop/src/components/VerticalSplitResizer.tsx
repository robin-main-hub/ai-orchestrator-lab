import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  fractionAfterKey,
  fractionFromPointerY,
  parseStoredSplitFraction,
  VERTICAL_SPLIT_MAX_TOP_FRACTION,
  VERTICAL_SPLIT_MIN_TOP_FRACTION,
  VERTICAL_SPLIT_STORAGE_KEY,
} from "../lib/verticalSplitResize";

/**
 * 수직 분할 리사이저 — 상단/하단 사이를 드래그로 조절(ChatSidePanel 좌우 리사이저의 수직판).
 * 드래그 + 키보드 ↑↓ + localStorage 저장. children은 정확히 2개를 기대한다([상단, 하단]).
 */
export function VerticalSplitResizer({
  children,
  className,
  storageKey = VERTICAL_SPLIT_STORAGE_KEY,
}: {
  children: ReactNode;
  className?: string;
  storageKey?: string;
}) {
  const [top, bottom] = Children.toArray(children);
  const [fraction, setFraction] = useState<number>(() => {
    try {
      return parseStoredSplitFraction(window.localStorage.getItem(storageKey));
    } catch {
      return parseStoredSplitFraction(undefined);
    }
  });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(fraction));
    } catch {
      // storage 불가 환경에서는 세션 내에서만 유지
    }
  }, [fraction, storageKey]);

  const onResizerPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 합성 이벤트 — window 리스너로 대체
    }
    setDragging(true);
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setFraction(fractionFromPointerY(rect.top, rect.height, moveEvent.clientY));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)} ref={containerRef}>
      <div className="overflow-hidden" style={{ height: `${(fraction * 100).toFixed(2)}%` }}>
        <div className="h-full overflow-y-auto">{top}</div>
      </div>

      <button
        aria-label="상단/하단 크기 조절"
        aria-valuemax={Math.round(VERTICAL_SPLIT_MAX_TOP_FRACTION * 100)}
        aria-valuemin={Math.round(VERTICAL_SPLIT_MIN_TOP_FRACTION * 100)}
        aria-valuenow={Math.round(fraction * 100)}
        className={cn(
          "group relative z-10 h-1.5 shrink-0 cursor-row-resize touch-none border-0 bg-transparent p-0 outline-none",
          "focus-visible:ring-2 focus-visible:ring-cyan-300/60",
        )}
        onKeyDown={(event) => {
          const next = fractionAfterKey(fraction, event.key, event.shiftKey);
          if (next !== undefined) {
            event.preventDefault();
            setFraction(next);
          }
        }}
        onPointerDown={onResizerPointerDown}
        role="separator"
        title="드래그해서 상단/하단 비율 조절"
        type="button"
      >
        <span
          className={cn(
            "pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10 transition-all",
            "group-hover:h-[3px] group-hover:bg-cyan-300/70",
            dragging && "h-[3px] bg-cyan-300/90",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity",
            "group-hover:opacity-100",
            dragging && "opacity-100",
          )}
        >
          <span className="h-0.5 w-3 rounded-full bg-cyan-300/60" />
          <span className="h-0.5 w-3 rounded-full bg-cyan-300/60" />
        </span>
      </button>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">{bottom}</div>
      </div>
    </div>
  );
}
