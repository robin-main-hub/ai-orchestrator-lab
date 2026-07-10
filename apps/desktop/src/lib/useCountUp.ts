import { useEffect, useRef, useState } from "react";

/**
 * reduced-motion 선호 여부 — SSR / 비-DOM 환경에서는 false.
 *
 * RunningWorkCard 의 로컬 `prefersReducedMotion` 을 공용 primitive 로 승격한 것.
 * (window + matchMedia 가드 동일.)
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 값이 바뀌면 이전 값에서 target 까지 짧게 카운트업(cubic ease-out). 첫 렌더는
 * 최종값을 그대로 보여준다. reduced-motion 이거나 rAF 가 없으면(SSR 등) 즉시 스냅.
 *
 * RunningWorkCard(:179) 와 RmasAgentRail(:82) 에 중복된 `useCountUp` 을 그대로
 * 대체할 수 있도록 런타임 형태를 동일하게 유지한다(`useCountUp(value)`).
 */
export function useCountUp(target: number, options?: { durationMs?: number }): number {
  const durationMs = options?.durationMs ?? 420;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const step = (t: number) => {
      const progress = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return display;
}
