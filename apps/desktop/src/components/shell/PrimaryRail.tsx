import { Brain, FolderOpen, LayoutDashboard, MessageSquare, Rocket, Settings } from "lucide-react";
import type { ElementType } from "react";
import type { AppSection, SectionTab } from "../../lib/navSurface";
import { PRIMARY_SECTIONS } from "../../lib/navSurface";
import { SectionTabs } from "./SectionTabs";

/**
 * 최상위 5섹션 내비게이션 + 현재 섹션의 SectionTabs(2단 좌측 레일).
 * 항상 보이며(레거시 left-rail의 focus-collapse 영향 밖), 기존 surface 전부로
 * 2클릭 이내 도달한다. 클릭은 navSurface 의도로 변환되어 App.tsx가 기존
 * setMode / setActiveNavItem 으로 적용한다(새 라우팅 축 없음).
 */

const SECTION_META: Record<AppSection, { label: string; icon: ElementType }> = {
  command: { label: "지휘", icon: LayoutDashboard },
  studio: { label: "스튜디오", icon: MessageSquare },
  operations: { label: "작전", icon: Rocket },
  library: { label: "라이브러리", icon: FolderOpen },
  system: { label: "시스템", icon: Settings },
};

export function PrimaryRail({
  activeSection,
  activeTab,
  onSelectSection,
  onSelectTab,
}: {
  activeSection: AppSection;
  activeTab: SectionTab;
  onSelectSection: (section: AppSection) => void;
  onSelectTab: (section: AppSection, tab: SectionTab) => void;
}) {
  return (
    <aside aria-label="기본 내비게이션" className="primary-rail">
      <div className="primary-rail__brand">
        <span className="primary-rail__brand-icon" aria-hidden="true">
          <Brain size={18} />
        </span>
        <span className="primary-rail__brand-text">AI Orchestrator</span>
      </div>

      <nav aria-label="섹션" className="primary-rail__sections">
        {PRIMARY_SECTIONS.map((section) => {
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          const isActive = section === activeSection;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`primary-rail__section ${isActive ? "active" : ""}`}
              key={section}
              onClick={() => onSelectSection(section)}
              title={meta.label}
              type="button"
            >
              <Icon size={20} />
              <span className="primary-rail__section-label">{meta.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="primary-rail__tabs">
        <p className="primary-rail__tabs-label">{SECTION_META[activeSection].label}</p>
        <SectionTabs activeTab={activeTab} onSelectTab={onSelectTab} section={activeSection} />
      </div>
    </aside>
  );
}
