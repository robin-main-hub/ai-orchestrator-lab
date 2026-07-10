import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BrainCircuit,
  CheckSquare,
  ChevronDown,
  Database,
  FileText,
  Handshake,
  Monitor,
  RefreshCw,
  Route,
  Server,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { OperatorCockpitHandoff, OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { OrchestrationMaturityReport } from "../../lib/orchestrationMaturity";
import { createExperienceRoadmap } from "../../lib/orchestrationExperienceRoadmap";
import type { ProductionSmokePlan } from "../../lib/productionSmokePlan";
import type { SettingsDiagnostics } from "../../lib/settingsDiagnostics";
import {
  resolveCockpitDetailFocus,
  type CockpitDetailFocus,
  type CockpitNextActionItem,
} from "../../lib/cockpitNextActions";
import type { WorkTraceSearchItem } from "../../lib/workTraceSearch";
import { ApprovalEvidenceCard } from "./ApprovalEvidenceCard";
import { Badge } from "./Badge";
import { CockpitHealthHero } from "./CockpitHealthHero";
import { deriveCockpitHealthFromSnapshot } from "../../lib/cockpitHealthRollup";
import { DispatchHistoryCard } from "./DispatchHistoryCard";
import { ExperienceRoadmapCard } from "./ExperienceRoadmapCard";
import { HandoffCard } from "./HandoffCard";
import { MemoryRecallCard } from "./MemoryRecallCard";
import { MaturityReadinessCard } from "./MaturityReadinessCard";
import { ProviderRoutingCard } from "./ProviderRoutingCard";
import { RecoveryContinuityCard } from "./RecoveryContinuityCard";
import { WorkerFleetCard } from "./WorkerFleetCard";
import { WorkReceiptLedgerCard } from "./WorkReceiptLedgerCard";
import { badgeColorForMirror, formatClock, mirrorHealthLabel } from "./presentation";
import { formatOperatorModelLabel, formatOperatorProviderLabel } from "./workerDisplay";

export function OperatorCockpit({
  defaultDetailsOpen = false,
  snapshot,
  onPreviewEvidence,
  onOpenMemory,
  onOpenProviderRouting,
  onOpenRecovery,
  onOpenControlQueue,
  onOpenAgentConversation,
  onOpenWorkTrace,
  onApproveHandoff,
  readiness,
  initialFocus,
}: {
  defaultDetailsOpen?: boolean;
  /** 명령 팔레트가 특정 카드(성숙도/브리핑/진단)로 deep-link할 때 */
  initialFocus?: CockpitDetailFocus;
  snapshot: OperatorCockpitSnapshot;
  onPreviewEvidence?: () => void;
  onOpenMemory?: () => void;
  onOpenProviderRouting?: () => void;
  onOpenRecovery?: () => void;
  onOpenControlQueue?: () => void;
  onOpenAgentConversation?: (agentId: string) => void;
  onOpenWorkTrace?: (item: WorkTraceSearchItem) => void;
  onApproveHandoff?: (handoffId: string) => void;
  readiness?: {
    diagnostics: SettingsDiagnostics;
    maturity: OrchestrationMaturityReport;
    nextActions?: CockpitNextActionItem[];
    smokePlan: ProductionSmokePlan;
    workTraceItems?: WorkTraceSearchItem[];
  };
}) {
  const [showDetails, setShowDetails] = useState(defaultDetailsOpen);
  const [detailFocus, setDetailFocus] = useState<CockpitDetailFocus | undefined>();
  // L2(전체 현황) 펼침 — 기본은 L1 히어로만 보여 정보 과부하를 막는다.
  // 팔레트 deep-link(initialFocus)나 기존 defaultDetailsOpen이면 자동 펼침.
  const [expanded, setExpanded] = useState(defaultDetailsOpen);
  useEffect(() => {
    if (!initialFocus) return;
    setDetailFocus(initialFocus);
    setShowDetails(true);
    setExpanded(true);
    const surfaceId = initialFocus.surface === "diagnostics" ? "maturity" : initialFocus.surface;
    const id = `cockpit-section-${surfaceId}`;
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [initialFocus]);
  const blockedCount = snapshot.fleet.filter((worker) => worker.status === "blocked" || worker.status === "error").length;
  const approvalCount = snapshot.approvals.length;
  const riskyApprovalCount = snapshot.approvals.filter((approval) => approval.payloadBindingStatus !== "bound").length;
  const workingCount = snapshot.fleet.filter((worker) => worker.status === "working").length;
  const criticalApprovalCount = snapshot.approvals.filter((approval) => approval.securityRisk === "high").length;
  const actionableHandoffs = snapshot.handoffs.filter((handoff) =>
    handoff.id && handoff.approvalState === "required" && handoff.targetSurface === "execution_slot"
  );
  const primaryActionableHandoff = actionableHandoffs[0];
  const totalSignals =
    blockedCount +
    riskyApprovalCount +
    snapshot.handoffs.reduce((count, handoff) => count + handoff.missingInfoSlots.length, 0) +
    snapshot.memory.contradictionWarnings.length;
  const experienceRoadmap = readiness
    ? createExperienceRoadmap({
        diagnostics: readiness.diagnostics,
        maturity: readiness.maturity,
        snapshot,
        workTraceItems: readiness.workTraceItems,
      })
    : [];
  // L1 건강 롤업 — 전체 신호 한 줄 + 가장 긴급한 액션 하나 (대시보드와 공유하는 단일 소스)
  const healthRollup = deriveCockpitHealthFromSnapshot(snapshot, readiness?.nextActions ?? []);
  const handleNextAction = (action: CockpitNextActionItem) => {
    if (action.targetSurface === "approvals" && onPreviewEvidence) {
      onPreviewEvidence();
      return;
    }
    if (action.targetSurface === "control_queue") {
      (onOpenControlQueue ?? onPreviewEvidence)?.();
      return;
    }
    if (action.targetSurface === "diagnostics" && onOpenProviderRouting) {
      onOpenProviderRouting();
      return;
    }
    if (action.targetSurface === "fleet" && onOpenAgentConversation) {
      const workerId = action.id.replace(/^worker(?:_active)?_/, "");
      if (workerId && workerId !== action.id) {
        onOpenAgentConversation(workerId);
        return;
      }
    }
    const nextFocus = resolveCockpitDetailFocus(action);
    if (nextFocus) {
      setDetailFocus(nextFocus);
      setShowDetails(true);
      return;
    }
    if (action.targetSurface !== "fleet") {
      setDetailFocus(undefined);
      setShowDetails(true);
    }
  };
  const openDetailsWithFocus = (focus: CockpitDetailFocus) => {
    setDetailFocus(focus);
    setShowDetails(true);
  };
  const openApprovals = () => {
    if (onOpenControlQueue) {
      onOpenControlQueue();
      return;
    }
    if (onPreviewEvidence) {
      onPreviewEvidence();
      return;
    }
    openDetailsWithFocus({
      helper: "승인 대기열과 실행 권한 요청을 먼저 확인합니다.",
      label: "승인 대기열",
      surface: "diagnostics",
    });
  };
  const openFleet = () => {
    const activeWorker =
      snapshot.fleet.find((worker) => worker.status === "working") ??
      snapshot.fleet.find((worker) => worker.status === "blocked" || worker.status === "error") ??
      snapshot.fleet[0];
    if (activeWorker && onOpenAgentConversation) {
      onOpenAgentConversation(activeWorker.workerId);
      return;
    }
    openDetailsWithFocus({
      helper: "워커 함대 카드에서 작업 중, 차단, 대기 상태를 확인합니다.",
      label: "워커 함대",
      surface: "diagnostics",
    });
  };
  const openMemoryPanel = () => {
    if (onOpenMemory) {
      onOpenMemory();
      return;
    }
    openDetailsWithFocus({
      helper: "기억/복구 카드에서 미러 상태와 맥락 경고를 확인합니다.",
      label: "기억 / 복구",
      surface: "diagnostics",
    });
  };
  const openProviderPanel = () => {
    if (onOpenProviderRouting) {
      onOpenProviderRouting();
      return;
    }
    openDetailsWithFocus({
      helper: "공급자 라우팅 카드에서 현재 모델, fallback, 신뢰도를 확인합니다.",
      label: "공급자 라우팅",
      surface: "diagnostics",
    });
  };
  const openRecoveryPanel = () => {
    if (onOpenRecovery) {
      onOpenRecovery();
      return;
    }
    openDetailsWithFocus({
      helper: "복구/연속성 카드에서 서버 투영과 outbox 동기화를 확인합니다.",
      label: "복구 / 연속성",
      surface: "diagnostics",
    });
  };
  const openReceipts = () => {
    openDetailsWithFocus({
      helper: "브리핑 로그에서 공개 마스킹 상태와 최근 성과를 확인합니다.",
      label: "작업 브리핑",
      surface: "receipts",
    });
  };
  const openRisks = () => {
    if (blockedCount > 0) {
      openFleet();
      return;
    }
    openDetailsWithFocus({
      helper: "설정 진단과 Production smoke에서 남은 차단 축을 확인합니다.",
      label: "위험 / 차단",
      surface: "diagnostics",
    });
  };

  return (
    <div
      aria-label="운영자 관제판 조작 가능한 지휘 화면"
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      data-focus-id="cockpit-container"
      tabIndex={-1}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_420px_at_78%_-10%,var(--accent-dim),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <header className="sticky top-0 z-10 border-b border-border bg-muted/40 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-[0_0_24px_var(--accent-dim)]">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">운영자 관제판</h1>
                <Badge color="outline" size="xs">
                  조작 가능한 지휘 화면
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  마지막 동기화: {formatClock(snapshot.timestamp)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge color={blockedCount > 0 ? "red" : "green"} pulse={blockedCount > 0}>
              <ShieldAlert className="h-3 w-3" />
              {blockedCount}건 차단
            </Badge>
            <Badge color={approvalCount > 0 ? "yellow" : "green"}>
              <Activity className="h-3 w-3" />
              {approvalCount}건 승인
            </Badge>
            <Badge color={snapshot.memory.macBookAuthorityEnabled ? "green" : "gray"}>
              <Monitor className="h-3 w-3" />
              MacBook 권위
            </Badge>
            <Badge color={badgeColorForMirror(snapshot.memory.dgxMirrorHealth)}>
              <Server className="h-3 w-3" />
              DGX {mirrorHealthLabel(snapshot.memory.dgxMirrorHealth)}
            </Badge>
            <Badge color={totalSignals > 0 ? "yellow" : "blue"}>{totalSignals}건 신호</Badge>
          </div>
        </div>
      </header>

      <div className="relative z-[1] flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* L1 — 첫 눈 건강 히어로. 기본은 이것만 보인다 (정보 과부하 해소). */}
          <CockpitHealthHero
            rollup={healthRollup}
            expanded={expanded}
            onToggleExpand={() => setExpanded((current) => !current)}
            onActivateTopAction={handleNextAction}
          />

          {/* L2 — 전체 현황. 펼쳐야 보인다. */}
          {expanded ? (
          <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <GlanceTile
              icon={<Users className="h-4 w-4" />}
              label="워커 함대"
              value={`${workingCount} / ${snapshot.fleet.length}`}
              hint="작업 중"
              onClick={openFleet}
              actionLabel="워커 함대 보기"
              tone={blockedCount > 0 ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<CheckSquare className="h-4 w-4" />}
              label="승인 대기"
              value={`${approvalCount}`}
              hint={criticalApprovalCount > 0 ? `고위험 ${criticalApprovalCount}건` : "이상 없음"}
              onClick={openApprovals}
              actionLabel="승인 대기 열기"
              tone={approvalCount > 0 ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<Route className="h-4 w-4" />}
              label="현재 대화 모델"
              value={formatOperatorModelLabel(snapshot.routing.selectedModelId)}
              hint={formatOperatorProviderLabel(snapshot.routing.providerLabel)}
              onClick={openProviderPanel}
              actionLabel="모델 경로 열기"
              tone={snapshot.routing.fallbackStatus === "active" ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<ShieldAlert className="h-4 w-4" />}
              label="위험 / 차단"
              value={`${blockedCount}`}
              hint={blockedCount > 0 ? "차단된 워커" : "이상 없음"}
              onClick={openRisks}
              actionLabel={blockedCount > 0 ? "차단 원인 보기" : "진단 보기"}
              tone={blockedCount > 0 ? "danger" : "success"}
            />
          </div>

          <MissionCommandDeck
            approvalCount={approvalCount}
            blockedCount={blockedCount}
            memoryHealthLabel={mirrorHealthLabel(snapshot.memory.dgxMirrorHealth)}
            nextActions={readiness?.nextActions ?? []}
            onActivateNextAction={handleNextAction}
            onOpenApprovals={openApprovals}
            onOpenFleet={openFleet}
            onOpenMemory={openMemoryPanel}
            onOpenReceipts={openReceipts}
            onOpenRisks={openRisks}
            receiptCount={readiness?.workTraceItems?.length ?? 0}
            workingCount={workingCount}
          />

          {primaryActionableHandoff && onApproveHandoff ? (
            <PendingHandoffStrip handoff={primaryActionableHandoff} onApprove={onApproveHandoff} />
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <WorkerFleetCard
                fleet={snapshot.fleet}
                memory={snapshot.memory}
                onOpenAgentConversation={onOpenAgentConversation}
                routing={snapshot.routing}
              />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <ApprovalEvidenceCard approvals={snapshot.approvals} onPreview={onPreviewEvidence} />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setShowDetails((current) => !current)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                작전 세부 정보
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {detailFocus
                    ? `${detailFocus.label} 안내 중`
                    : "핸드오프 · 기억 · 라우팅 · 복구 · 디스패치"}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
            {showDetails ? (
              <div className="border-t border-border p-4">
                {detailFocus ? <DetailFocusBanner focus={detailFocus} /> : null}
                <div className="grid gap-4 lg:grid-cols-12">
                  {readiness ? (
                    <div
                      id="cockpit-section-maturity"
                      className={`lg:col-span-12 ${
                        detailFocus?.surface === "maturity" || detailFocus?.surface === "diagnostics"
                          ? "rounded-xl ring-1 ring-primary/35 shadow-[0_0_32px_var(--accent-dim)]"
                          : ""
                      }`}
                    >
                      <MaturityReadinessCard
                        diagnostics={readiness.diagnostics}
                        maturity={readiness.maturity}
                        smokePlan={readiness.smokePlan}
                      />
                    </div>
                  ) : null}
                  {experienceRoadmap.length > 0 ? (
                    <div className="lg:col-span-12">
                      <ExperienceRoadmapCard items={experienceRoadmap} />
                    </div>
                  ) : null}
                  {readiness?.workTraceItems ? (
                    <div
                      id="cockpit-section-receipts"
                      className={`lg:col-span-12 ${
                        detailFocus?.surface === "receipts"
                          ? "rounded-xl ring-1 ring-primary/35 shadow-[0_0_32px_var(--accent-dim)]"
                          : ""
                      }`}
                    >
                      <WorkReceiptLedgerCard items={readiness.workTraceItems} onOpenTrace={onOpenWorkTrace} />
                    </div>
                  ) : null}
                  <div className="space-y-4 lg:col-span-5">
                    <div
                      id="cockpit-section-handoffs"
                      className={
                        detailFocus?.surface === "handoffs"
                          ? "rounded-xl ring-1 ring-primary/35 shadow-[0_0_32px_var(--accent-dim)]"
                          : ""
                      }
                    >
                      <HandoffCard handoffs={snapshot.handoffs} onApproveHandoff={onApproveHandoff} />
                    </div>
                    <MemoryRecallCard memory={snapshot.memory} onOpen={onOpenMemory} />
                  </div>
                  <div className="space-y-4 lg:col-span-4">
                    <DispatchHistoryCard history={snapshot.dispatchHistory} />
                  </div>
                  <div className="space-y-4 lg:col-span-3">
                    <ProviderRoutingCard onOpen={onOpenProviderRouting} routing={snapshot.routing} />
                    <RecoveryContinuityCard onOpen={onOpenRecovery} recovery={snapshot.recovery} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MissionCommandDeck({
  approvalCount,
  blockedCount,
  memoryHealthLabel,
  nextActions,
  onActivateNextAction,
  onOpenApprovals,
  onOpenFleet,
  onOpenMemory,
  onOpenReceipts,
  onOpenRisks,
  receiptCount,
  workingCount,
}: {
  approvalCount: number;
  blockedCount: number;
  memoryHealthLabel: string;
  /** "지금 할 일" — NextActionStrip을 이 지휘판 좌측으로 흡수(다음 할 일을 한 군데서만 말한다) */
  nextActions: CockpitNextActionItem[];
  onActivateNextAction: (action: CockpitNextActionItem) => void;
  onOpenApprovals: () => void;
  onOpenFleet: () => void;
  onOpenMemory: () => void;
  onOpenReceipts: () => void;
  onOpenRisks: () => void;
  receiptCount: number;
  workingCount: number;
}) {
  return (
    <section
      aria-label="작전 지휘판"
      className="overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(135deg,var(--accent-dim),transparent_42%,var(--accent-dim))] shadow-[0_0_40px_var(--accent-dim)] backdrop-blur-xl"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
              <Monitor className="h-3 w-3" />
              작전 지휘판
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
              작업 흐름
            </span>
          </div>
          {/* "지금 할 일" — NextActionStrip을 지휘판 안으로 흡수해 다음 할 일을 한 군데서만 말한다 */}
          {nextActions.length ? (
            <NextActionStrip actions={nextActions} onActivate={onActivateNextAction} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              지금은 처리할 다음 작업이 없습니다. 승인·워커·기억·성과 신호를 오른쪽에서 확인하세요.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <MissionMetric
            actionLabel="승인 대기 열기"
            icon={<Activity className="h-3.5 w-3.5" />}
            label="승인"
            onClick={onOpenApprovals}
            value={`승인 ${approvalCount}건 대기`}
            tone={approvalCount > 0 ? "amber" : "emerald"}
          />
          <MissionMetric
            actionLabel="워커 함대 보기"
            icon={<Users className="h-3.5 w-3.5" />}
            label="워커"
            onClick={onOpenFleet}
            value={`워커 ${workingCount}명 작업 중`}
            tone={workingCount > 0 ? "cyan" : "zinc"}
          />
          <MissionMetric
            actionLabel="기억 상태 열기"
            icon={<Database className="h-3.5 w-3.5" />}
            label="기억"
            onClick={onOpenMemory}
            value={`기억 ${memoryHealthLabel}`}
            tone={memoryHealthLabel === "정상" ? "emerald" : "amber"}
          />
          <MissionMetric
            actionLabel="성과 장부 열기"
            icon={<FileText className="h-3.5 w-3.5" />}
            label="성과"
            onClick={onOpenReceipts}
            value={`성과 장부 ${receiptCount}건`}
            tone={receiptCount > 0 ? "violet" : "zinc"}
          />
          <MissionMetric
            actionLabel={blockedCount > 0 ? "차단 원인 보기" : "진단 보기"}
            className="col-span-2"
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label="차단"
            onClick={onOpenRisks}
            value={blockedCount > 0 ? `차단 ${blockedCount}건 확인 필요` : "차단 없음"}
            tone={blockedCount > 0 ? "rose" : "emerald"}
          />
        </div>
      </div>
    </section>
  );
}

function MissionMetric({
  actionLabel,
  className,
  icon,
  label,
  onClick,
  tone,
  value,
}: {
  actionLabel: string;
  className?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone: "amber" | "cyan" | "emerald" | "rose" | "violet" | "zinc";
  value: string;
}) {
  const toneClass = {
    amber: "border-warning/20 bg-warning/10 text-warning",
    cyan: "border-primary/20 bg-primary/10 text-primary",
    emerald: "border-primary/20 bg-primary/10 text-primary",
    rose: "border-destructive/20 bg-destructive/10 text-destructive",
    violet: "border-primary/20 bg-primary/10 text-primary",
    zinc: "border-border bg-muted/40 text-muted-foreground",
  }[tone];

  return (
    <button
      className={`group min-w-0 rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/35 hover:bg-foreground/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${toneClass} ${className ?? ""}`}
      onClick={onClick}
      type="button"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-current/70">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[12px] font-semibold text-foreground" title={value}>
        {value}
      </p>
      <span className="mt-1 inline-flex text-[10px] font-semibold text-primary transition-colors group-hover:text-primary">
        {actionLabel}
      </span>
    </button>
  );
}

function PendingHandoffStrip({
  handoff,
  onApprove,
}: {
  handoff: OperatorCockpitHandoff;
  onApprove: (handoffId: string) => void;
}) {
  if (!handoff.id) return null;

  return (
    <section
      aria-label="실행 슬롯 인계 승인"
      className="rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-3 shadow-[0_0_28px_var(--accent-dim)] backdrop-blur-xl"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Handshake className="h-3 w-3" />
              실행 슬롯 대기
            </span>
            <Badge color="blue" size="xs">
              {handoff.payloadRef?.startsWith("coding_packet://") ? "코딩 패킷" : "인계"}
            </Badge>
          </div>
          <p className="truncate text-sm font-medium text-foreground">{handoff.nextAction}</p>
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={() => onApprove(handoff.id as string)}
          type="button"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          실행 슬롯 인계 승인
        </button>
      </div>
    </section>
  );
}

function NextActionStrip({
  actions,
  onActivate,
}: {
  actions: CockpitNextActionItem[];
  onActivate: (action: CockpitNextActionItem) => void;
}) {
  const primaryAction = actions[0];
  const secondaryActions = actions.slice(1);
  if (!primaryAction) return null;

  return (
    <section
      aria-label="다음 행동"
      className={`rounded-lg border px-3 py-3 backdrop-blur-xl ${nextActionPanelTone(primaryAction.priority)}`}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckSquare className="h-3 w-3" />
              지금 할 일
            </span>
            <span className="rounded-full border border-border bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-foreground/70">
              {priorityLabel(primaryAction.priority)}
            </span>
          </div>
          <button
            className={`group flex w-full min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${nextActionButtonTone(primaryAction.priority)}`}
            onClick={() => onActivate(primaryAction)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{primaryAction.label}</span>
              <span className="mt-0.5 block text-[11px] text-foreground/55">누르면 관련 카드로 바로 안내합니다.</span>
            </span>
            <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-1 text-[10px] font-semibold text-foreground/85 transition-colors group-hover:bg-foreground/15">
              {primaryAction.ctaLabel}
            </span>
          </button>
        </div>

        {secondaryActions.length > 0 ? (
          <details className="group min-w-0 lg:w-64">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-muted/60">
              <span>다른 후보 {secondaryActions.length}건</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1.5">
              {secondaryActions.map((action) => (
                <NextActionButton action={action} key={action.id} onActivate={onActivate} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function NextActionButton({
  action,
  onActivate,
}: {
  action: CockpitNextActionItem;
  onActivate: (action: CockpitNextActionItem) => void;
}) {
  return (
    <button
      className={`flex w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-foreground/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${nextActionButtonTone(action.priority)}`}
      onClick={() => onActivate(action)}
      type="button"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/80">
        {action.ctaLabel}
      </span>
    </button>
  );
}

function DetailFocusBanner({ focus }: { focus: CockpitDetailFocus }) {
  return (
    <div className="mb-3 rounded-lg border border-primary/25 bg-primary/[0.07] px-3 py-2 text-xs text-primary shadow-[0_0_24px_var(--accent-dim)]">
      <span className="font-semibold">{focus.label}</span>
      <span className="mx-2 text-primary">/</span>
      <span className="text-primary">{focus.helper}</span>
    </div>
  );
}

function nextActionPanelTone(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return "border-destructive/25 bg-destructive/20";
  if (priority === "warning") return "border-warning/25 bg-warning/15";
  return "border-primary/20 bg-muted/40";
}

function nextActionButtonTone(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return "border-destructive/25 bg-destructive/10 text-destructive";
  if (priority === "warning") return "border-warning/25 bg-warning/10 text-warning";
  return "border-primary/20 bg-primary/10 text-primary";
}

function priorityLabel(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return "즉시";
  if (priority === "warning") return "점검";
  return "다음";
}

function GlanceTile({
  actionLabel,
  icon,
  label,
  onClick,
  value,
  hint,
  tone,
}: {
  actionLabel: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  value: string;
  hint: string;
  tone: "danger" | "normal" | "success" | "warning";
}) {
  const toneClass = {
    danger: "border-destructive/30 bg-destructive/[0.06] text-destructive",
    normal: "border-border bg-muted/40 text-muted-foreground",
    success: "border-primary/25 bg-primary/[0.06] text-primary",
    warning: "border-warning/25 bg-warning/[0.06] text-warning",
  }[tone];

  return (
    <button
      className={`group rounded-lg border px-3 py-2 text-left backdrop-blur-xl transition-colors hover:border-primary/35 hover:bg-foreground/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${toneClass}`}
      onClick={onClick}
      title={actionLabel}
      type="button"
    >
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
        <span className="opacity-70 transition-colors group-hover:text-primary">{icon}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-base font-semibold text-foreground">{value}</span>
        <span className="truncate text-[10px] text-muted-foreground">{hint}</span>
      </div>
    </button>
  );
}
