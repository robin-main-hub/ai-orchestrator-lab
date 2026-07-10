import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList, RefObject } from "react";
import { prefersReducedMotion } from "@/lib/useCountUp";

/**
 * 대화/로그 등 "새 항목이 아래로 쌓이는" 스크롤 컨테이너를 위한 팔로우 스크롤 훅.
 * 바닥에 붙어 있으면(pinned) 새 항목마다 바닥으로 따라가고, 위로 올려 읽는 중이면
 * 자동 스크롤을 멈추고 "최신으로" 버튼을 노출한다. 부드러운 스크롤은 reduced-motion 가드.
 */

/** 순수 계산 — 스크롤 지표에서 바닥까지 거리와 바닥 여부. */
export function computeFollowState(args: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  threshold?: number;
}): { distanceFromBottom: number; isAtBottom: boolean } {
  const distanceFromBottom = args.scrollHeight - args.clientHeight - args.scrollTop;
  const isAtBottom = distanceFromBottom <= (args.threshold ?? 80);
  return { distanceFromBottom, isAtBottom };
}

export interface UseFollowScrollOptions {
  threshold?: number;
}

export interface UseFollowScrollResult<T extends HTMLElement> {
  scrollRef: RefObject<T | null>;
  isPinned: boolean;
  showJumpToLatest: boolean;
  jumpToLatest: () => void;
  handleScroll: () => void;
}

export function useFollowScroll<T extends HTMLElement = HTMLDivElement>(
  deps: DependencyList,
  options?: UseFollowScrollOptions,
): UseFollowScrollResult<T> {
  const threshold = options?.threshold;
  const scrollRef = useRef<T | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // deps 이펙트에서 최신 pinned 상태를 읽되 이펙트를 재구독시키지 않도록 ref 로 미러링.
  const isPinnedRef = useRef(isPinned);
  isPinnedRef.current = isPinned;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { isAtBottom } = computeFollowState({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      threshold,
    });
    setIsPinned(isAtBottom);
    setShowJumpToLatest(!isAtBottom);
  }, [threshold]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    setIsPinned(true);
    setShowJumpToLatest(false);
  }, []);

  // 스크롤 리스너는 이펙트에서만 바인딩한다(중복 카운트 방지). handleScroll 은 멱등한
  // 상태 세터라 외부에서 명시 바인딩해도 안전.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // 새 항목(deps) 이 붙었을 때 바닥에 붙어 있으면 바닥으로 따라간다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isPinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, deps);

  return { scrollRef, isPinned, showJumpToLatest, jumpToLatest, handleScroll };
}
