import type { ReactNode } from "react";
import type { AppSection, SectionTab } from "../../lib/navSurface";
import { InspectorPanel } from "./InspectorPanel";
import { PrimaryRail } from "./PrimaryRail";
import "./shell.css";

/**
 * 최상위 chrome. 영속 PrimaryRail(5섹션 + SectionTabs)을 소유하고, 기존 화면
 * 트리(레거시 app-shell grid)를 MainCanvas 안에 그대로 mount한다. 새 라우팅 축을
 * 만들지 않으며 — section/tab 선택은 navSurface 의도로 변환되어 부모가 기존
 * 상태를 갱신한다. CommandPalette / ControlQueueDrawer 등 전역 오버레이는 부모가
 * children 내부에 단일 인스턴스로 계속 mount한다.
 */
export function OrchestratorShell({
  activeSection,
  activeTab,
  onSelectSection,
  onSelectTab,
  inspector,
  children,
}: {
  activeSection: AppSection;
  activeTab: SectionTab;
  onSelectSection: (section: AppSection) => void;
  onSelectTab: (section: AppSection, tab: SectionTab) => void;
  /** STEP 1에서는 미사용(인스펙터 content 미연결). 구조 슬롯만 보존. */
  inspector?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="orchestrator-shell">
      <PrimaryRail
        activeSection={activeSection}
        activeTab={activeTab}
        onSelectSection={onSelectSection}
        onSelectTab={onSelectTab}
      />
      <div className="orchestrator-canvas">{children}</div>
      <InspectorPanel>{inspector}</InspectorPanel>
    </div>
  );
}
