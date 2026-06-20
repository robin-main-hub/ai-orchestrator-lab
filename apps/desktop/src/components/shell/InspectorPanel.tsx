import type { ReactNode } from "react";

/**
 * 우측 인스펙터 슬롯의 구조 컴포넌트. STEP 1에서는 content가 없으면 아무것도
 * 렌더하지 않는다 — 빈 drawer를 여는 trigger/버튼은 의도적으로 만들지 않는다
 * (실제 content가 연결되는 단계에서 trigger를 추가한다).
 */
export function InspectorPanel({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <aside aria-label="인스펙터" className="inspector-panel">
      {children}
    </aside>
  );
}
