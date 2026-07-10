import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { formatAnnexTabLabel } from "@/lib/annexPresentation";
import type { StatusItem } from "./annexData";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";
import { AnnexReadinessGauge } from "./AnnexReadinessGauge";
import { AnnexRosterItem } from "./AnnexRosterItem";

type AnnexContentTab = "evidence" | "activity" | "memory" | "queue";

type TabMeta = {
  id: AnnexContentTab;
  label: string;
  count: number;
  tabId: string;
  panelId: string;
};

function machineToneClass(status: StatusItem["status"]): string {
  if (status === "critical") return "text-destructive";
  if (status === "degraded") return "text-warning";
  return "text-muted-foreground";
}

export function AnnexRail({
  session,
  machineItems,
  tabs,
  activeTab,
  onTabSelect,
}: {
  session: Stage3DebateSession;
  machineItems: StatusItem[];
  tabs: TabMeta[];
  activeTab: AnnexContentTab;
  onTabSelect: (tab: AnnexContentTab) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const machine = machineItems.filter((item) => item.id !== "decision-readiness");

  const moveTo = (index: number) => {
    const clamped = (index + tabs.length) % tabs.length;
    const target = tabs[clamped];
    if (!target) return;
    onTabSelect(target.id);
    tabRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <aside className="annex-v2__rail">
      <AnnexReadinessGauge session={session} />

      <div className="annex-v2__roster">
        {session.participants.map((participant) => (
          <AnnexRosterItem key={participant.agentId} name={participant.name} role={participant.role} />
        ))}
      </div>

      <div className="annex-v2__tablist" role="tablist" aria-orientation="vertical" aria-label="보조자료 보기">
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              className="annex-v2__tab"
              role="tab"
              id={tab.tabId}
              aria-controls={tab.panelId}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={formatAnnexTabLabel(tab.label, tab.count)}
              onClick={() => onTabSelect(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              type="button"
            >
              <span className="annex-v2__tab-label">{tab.label}</span>
              {tab.count > 0 ? <span className="aol-mono annex-v2__tab-count">{Math.min(tab.count, 99)}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="annex-v2__machine">
        {machine.map((item) => (
          <div className="annex-v2__machine-row" key={item.id}>
            <span className="annex-v2__machine-label">{item.label}</span>
            <span className={cn("annex-v2__machine-value", machineToneClass(item.status))}>{item.value}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
