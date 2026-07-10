import { useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { annexCopy, annexTabPresentation, formatAnnexTabLabel, sanitizeDebateAnnexText } from "@/lib/annexPresentation";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";
import {
  buildActivity,
  buildEvidenceRefs,
  buildMemoryRecall,
  buildQueueItems,
  buildStatusItems,
  useNow,
  type EvidenceRef,
} from "../annex/annexData";
import { AnnexRail } from "../annex/AnnexRail";
import { AnnexEvidencePanel } from "../annex/AnnexEvidencePanel";
import { AnnexActivityPanel } from "../annex/AnnexActivityPanel";
import { AnnexMemoryPanel } from "../annex/AnnexMemoryPanel";
import { AnnexQueuePanel } from "../annex/AnnexQueuePanel";

export { resolveDebateAnnexAgentLabel } from "../annex/annexData";

type AnnexTab = "status" | "evidence" | "agents" | "memory" | "queue" | "logs";
type AnnexContentTab = "evidence" | "activity" | "memory" | "queue";

function mapInitialAnnexTab(tab: AnnexTab | undefined): AnnexContentTab {
  switch (tab) {
    case "evidence":
      return "evidence";
    case "memory":
      return "memory";
    case "queue":
      return "queue";
    case "agents":
    case "logs":
      return "activity";
    case "status":
    default:
      return "evidence";
  }
}

export type AnnexTabMeta = {
  id: AnnexContentTab;
  label: string;
  count: number;
  tabId: string;
  panelId: string;
};

export function DebateAnnexPage({
  codingPacketGoal,
  className,
  initialTab = "status",
  onAskAgent,
  onBack,
  onCreateCodingPacket,
  onViewApproval,
  onViewMemory,
  pendingApprovals,
  runtime,
  session,
}: {
  codingPacketGoal?: string;
  className?: string;
  initialTab?: AnnexTab;
  onAskAgent?: (ref: EvidenceRef) => void;
  onBack?: () => void;
  onCreateCodingPacket?: () => void;
  onViewApproval?: () => void;
  onViewMemory?: () => void;
  pendingApprovals: number;
  runtime: RuntimeSnapshot;
  session: Stage3DebateSession;
}) {
  const now = useNow();
  const [activeTab, setActiveTab] = useState<AnnexContentTab>(() => mapInitialAnnexTab(initialTab));

  const data = useMemo(
    () => ({
      evidenceRefs: buildEvidenceRefs(session),
      activity: buildActivity(session, runtime, now),
      memoryRecall: buildMemoryRecall(session),
      queueItems: buildQueueItems({ codingPacketGoal, pendingApprovals }),
      statusHub: buildStatusItems(session, runtime),
    }),
    [codingPacketGoal, pendingApprovals, runtime, session, now],
  );

  const tabs: AnnexTabMeta[] = useMemo(
    () => [
      { id: "evidence", label: annexTabPresentation.evidence.label, count: data.evidenceRefs.length, tabId: "annex-tab-evidence", panelId: "annex-panel-evidence" },
      { id: "activity", label: "활동", count: data.activity.length, tabId: "annex-tab-activity", panelId: "annex-panel-activity" },
      { id: "memory", label: annexTabPresentation.memory.label, count: data.memoryRecall.length, tabId: "annex-tab-memory", panelId: "annex-panel-memory" },
      { id: "queue", label: annexTabPresentation.queue.label, count: data.queueItems.length, tabId: "annex-tab-queue", panelId: "annex-panel-queue" },
    ],
    [data],
  );

  const summary = useMemo(() => {
    const active = tabs.filter((tab) => tab.count > 0).map((tab) => formatAnnexTabLabel(tab.label, tab.count));
    return active.length > 0 ? `보조자료 ${active.join(" · ")}` : "보조자료 없음";
  }, [tabs]);

  const activePanelId = `annex-panel-${activeTab}`;
  const activeTabId = `annex-tab-${activeTab}`;
  const showBanner = session.runState === "error" && Boolean(session.runError);

  return (
    <section className={cn("annex-v2", className)} data-focus-id="debate-annex-container" tabIndex={-1}>
      {showBanner ? (
        <div className="annex-v2__banner" role="alert">
          <span className="annex-v2__banner-title">실행 오류</span>
          <span className="annex-v2__banner-detail">{sanitizeDebateAnnexText(session.runError ?? "")}</span>
        </div>
      ) : null}

      <header className="annex-v2__header">
        {onBack ? (
          <Button className="annex-v2__back" onClick={onBack} size="icon-sm" variant="ghost" aria-label="토론으로 돌아가기">
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div className="annex-v2__heading">
          <span className="annex-v2__kicker">
            <FileText className="size-3.5" aria-hidden="true" />
            {annexCopy.kicker}
          </span>
          <h1 className="annex-v2__title">{session.problem}</h1>
          <p className="annex-v2__summary">{summary}</p>
        </div>
      </header>

      <AnnexRail
        session={session}
        machineItems={data.statusHub}
        tabs={tabs}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
      />

      <div className="annex-v2__panel" role="tabpanel" id={activePanelId} aria-labelledby={activeTabId}>
        {activeTab === "evidence" ? (
          <AnnexEvidencePanel
            refs={data.evidenceRefs}
            onAskAgent={onAskAgent}
            onCreateCodingPacket={onCreateCodingPacket}
            onViewApproval={onViewApproval}
          />
        ) : null}
        {activeTab === "activity" ? <AnnexActivityPanel entries={data.activity} /> : null}
        {activeTab === "memory" ? <AnnexMemoryPanel recall={data.memoryRecall} onViewMemory={onViewMemory} /> : null}
        {activeTab === "queue" ? <AnnexQueuePanel items={data.queueItems} onViewApproval={onViewApproval} /> : null}
      </div>
    </section>
  );
}
