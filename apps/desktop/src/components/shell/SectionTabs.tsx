import type { AppSection, SectionTab } from "../../lib/navSurface";
import { SECTION_TABS } from "../../lib/navSurface";

/**
 * 현재 섹션의 하위 탭 목록. 기존 surface로 이동하는 presentation control일 뿐
 * (새 라우팅 축이 아니다). 실제 surface가 있는 탭만 navSurface.SECTION_TABS에 있다.
 */

/** 탭 표시 라벨 — shell 전용 presentational(기존 navSections 한글 용어 재사용). */
const TAB_LABELS: Record<SectionTab, string> = {
  overview: "대시보드",
  attention: "인박스",
  cockpit: "관제판",
  chat: "대화",
  code: "코딩",
  research: "리서치",
  debate: "토론",
  launch: "실행",
  live: "작전극장",
  terminal: "터미널",
  workspaces: "프로젝트",
  sessions: "세션",
  providers: "프로바이더",
  sources: "채널",
  config: "설정파일",
  backup: "백업",
};

export function SectionTabs({
  section,
  activeTab,
  onSelectTab,
}: {
  section: AppSection;
  activeTab: SectionTab;
  onSelectTab: (section: AppSection, tab: SectionTab) => void;
}) {
  const tabs = SECTION_TABS[section];
  return (
    <ul className="section-tabs" role="list">
      {tabs.map((spec) => {
        const isActive = spec.tab === activeTab;
        return (
          <li key={spec.tab}>
            <button
              aria-current={isActive ? "page" : undefined}
              className={`section-tab ${isActive ? "active" : ""}`}
              onClick={() => onSelectTab(section, spec.tab)}
              type="button"
            >
              <span>{TAB_LABELS[spec.tab]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
