import { useState, type ReactNode } from "react";
import {
  Activity,
  BrainCircuit,
  CheckSquare,
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  Monitor,
  RefreshCw,
  Route,
  Server,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { OrchestrationMaturityReport } from "../../lib/orchestrationMaturity";
import type { ProductionSmokePlan } from "../../lib/productionSmokePlan";
import type { SettingsDiagnostics } from "../../lib/settingsDiagnostics";
import type { CockpitNextActionItem } from "../../lib/cockpitNextActions";
import type { WorkTraceSearchItem } from "../../lib/workTraceSearch";
import { ApprovalEvidenceCard } from "./ApprovalEvidenceCard";
import { Badge } from "./Badge";
import { DispatchHistoryCard } from "./DispatchHistoryCard";
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
  onOpenAgentConversation,
  readiness,
}: {
  defaultDetailsOpen?: boolean;
  snapshot: OperatorCockpitSnapshot;
  onPreviewEvidence?: () => void;
  onOpenMemory?: () => void;
  onOpenProviderRouting?: () => void;
  onOpenRecovery?: () => void;
  onOpenAgentConversation?: (agentId: string) => void;
  readiness?: {
    diagnostics: SettingsDiagnostics;
    maturity: OrchestrationMaturityReport;
    nextActions?: CockpitNextActionItem[];
    smokePlan: ProductionSmokePlan;
    workTraceItems?: WorkTraceSearchItem[];
  };
}) {
  const [showDetails, setShowDetails] = useState(defaultDetailsOpen);
  const blockedCount = snapshot.fleet.filter((worker) => worker.status === "blocked" || worker.status === "error").length;
  const approvalCount = snapshot.approvals.length;
  const riskyApprovalCount = snapshot.approvals.filter((approval) => approval.payloadBindingStatus !== "bound").length;
  const workingCount = snapshot.fleet.filter((worker) => worker.status === "working").length;
  const criticalApprovalCount = snapshot.approvals.filter((approval) => approval.securityRisk === "high").length;
  const totalSignals =
    blockedCount +
    riskyApprovalCount +
    snapshot.handoffs.reduce((count, handoff) => count + handoff.missingInfoSlots.length, 0) +
    snapshot.memory.contradictionWarnings.length +
    snapshot.dispatchHistory.filter((dispatch) => dispatch.tamperWarning).length;
  const handleNextAction = (action: CockpitNextActionItem) => {
    if (action.targetSurface === "approvals" && onPreviewEvidence) {
      onPreviewEvidence();
      return;
    }
    if (action.targetSurface !== "fleet") {
      setShowDetails(true);
    }
  };

  return (
    <div
      aria-label="운영자 관제판 읽기 전용 지휘 화면"
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      data-focus-id="cockpit-container"
      tabIndex={-1}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(6,182,212,0.12),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(139,92,246,0.10),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.56),rgba(9,9,11,0.96))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-900/40 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.18)]">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100">운영자 관제판</h1>
                <Badge color="outline" size="xs">
                  읽기 전용 지휘 화면
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  마지막 동기화: {formatClock(snapshot.timestamp)}
                </span>
                <span className="text-zinc-700">/</span>
                <span>스냅샷 {snapshot.id}</span>
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <GlanceTile
              icon={<Users className="h-4 w-4" />}
              label="워커 함대"
              value={`${workingCount} / ${snapshot.fleet.length}`}
              hint="작업 중"
              tone={blockedCount > 0 ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<CheckSquare className="h-4 w-4" />}
              label="승인 대기"
              value={`${approvalCount}`}
              hint={criticalApprovalCount > 0 ? `고위험 ${criticalApprovalCount}건` : "건"}
              tone={approvalCount > 0 ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<Route className="h-4 w-4" />}
              label="현재 대화 모델"
              value={formatOperatorModelLabel(snapshot.routing.selectedModelId)}
              hint={formatOperatorProviderLabel(snapshot.routing.providerLabel)}
              tone={snapshot.routing.fallbackStatus === "active" ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<Database className="h-4 w-4" />}
              label="기억 / 복구"
              value={snapshot.memory.dgxMirrorHealth === "healthy" ? "동기화됨" : "점검 필요"}
              hint={`미러 ${mirrorHealthLabel(snapshot.memory.dgxMirrorHealth)}`}
              tone={snapshot.memory.dgxMirrorHealth === "healthy" ? "success" : "warning"}
            />
            <GlanceTile
              icon={<ShieldAlert className="h-4 w-4" />}
              label="위험 / 차단"
              value={`${blockedCount}`}
              hint={blockedCount > 0 ? "차단된 워커" : "이상 없음"}
              tone={blockedCount > 0 ? "danger" : "success"}
            />
          </div>

          {readiness?.nextActions?.length ? (
            <NextActionStrip actions={readiness.nextActions} onActivate={handleNextAction} />
          ) : null}

          {readiness?.workTraceItems?.length ? (
            <RecentReceiptStrip items={readiness.workTraceItems} />
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

          <div className="overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-900/30">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setShowDetails((current) => !current)}
              type="button"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                작전 세부 정보
                <span className="text-xs font-normal text-zinc-500">
                  핸드오프 · 기억 · 라우팅 · 복구 · 디스패치
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
            {showDetails ? (
              <div className="border-t border-zinc-800/60 p-4">
                <div className="grid gap-4 lg:grid-cols-12">
                  {readiness ? (
                    <div className="lg:col-span-12">
                      <MaturityReadinessCard
                        diagnostics={readiness.diagnostics}
                        maturity={readiness.maturity}
                        smokePlan={readiness.smokePlan}
                      />
                    </div>
                  ) : null}
                  {readiness?.workTraceItems ? (
                    <div className="lg:col-span-12">
                      <WorkReceiptLedgerCard items={readiness.workTraceItems} />
                    </div>
                  ) : null}
                  <div className="space-y-4 lg:col-span-5">
                    <HandoffCard handoffs={snapshot.handoffs} />
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
        </div>
      </div>
    </div>
  );
}

function RecentReceiptStrip({ items }: { items: WorkTraceSearchItem[] }) {
  const recentItems = items.slice(0, 3);
  const unsafeCount = items.filter((item) => !item.searchable).length;
  if (recentItems.length === 0) return null;

  return (
    <section
      aria-label="최근 완료 기록"
      className={`rounded-lg border px-3 py-3 backdrop-blur-xl ${
        unsafeCount > 0
          ? "border-amber-500/25 bg-amber-950/15"
          : "border-cyan-500/20 bg-zinc-900/40"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-400/15 bg-cyan-400/10 text-cyan-200">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold text-zinc-100">최근 완료 기록</h2>
            <p className="truncate text-[11px] text-zinc-500">
              공개 요약 {items.filter((item) => item.searchable).length}/{items.length}건
              {unsafeCount > 0 ? ` · 점검 ${unsafeCount}건` : " · 마스킹 통과"}
            </p>
          </div>
        </div>
        <a
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/40 hover:bg-cyan-400/15"
          href="https://github.com/robin-main-hub/ai-orchestrator-lab/issues/251"
          rel="noreferrer"
          target="_blank"
        >
          GitHub #251
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {recentItems.map((item) => (
          <div
            className="min-w-0 rounded-md border border-white/10 bg-black/20 px-2.5 py-2"
            key={`${item.kind}:${item.id}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
                {receiptKindLabel(item.kind)}
              </span>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                  item.searchable
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                }`}
              >
                {item.safetyLabel}
              </span>
            </div>
            <p className="truncate text-xs font-medium text-zinc-200">{item.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function receiptKindLabel(kind: WorkTraceSearchItem["kind"]) {
  if (kind === "conversation") return "대화";
  if (kind === "debate") return "토론";
  if (kind === "tmux") return "터미널";
  if (kind === "approval") return "승인";
  return "기억";
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
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <CheckSquare className="h-3 w-3" />
              지금 할 일
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-white/70">
              {priorityLabel(primaryAction.priority)}
            </span>
          </div>
          <button
            className={`group flex w-full min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${nextActionButtonTone(primaryAction.priority)}`}
            onClick={() => onActivate(primaryAction)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-zinc-50">{primaryAction.label}</span>
              <span className="mt-0.5 block text-[11px] text-white/55">누르면 관련 영역을 바로 펼칩니다.</span>
            </span>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/85 transition-colors group-hover:bg-white/15">
              {primaryAction.ctaLabel}
            </span>
          </button>
        </div>

        {secondaryActions.length > 0 ? (
          <details className="group min-w-0 lg:w-64">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-zinc-800/70 bg-black/15 px-3 py-2 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-black/25">
              <span>다른 후보 {secondaryActions.length}건</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500 transition-transform group-open:rotate-180" />
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
      className={`flex w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${nextActionButtonTone(action.priority)}`}
      onClick={() => onActivate(action)}
      type="button"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
        {action.ctaLabel}
      </span>
    </button>
  );
}

function nextActionPanelTone(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return "border-rose-500/25 bg-rose-950/20";
  if (priority === "warning") return "border-amber-500/25 bg-amber-950/15";
  return "border-cyan-500/20 bg-zinc-900/40";
}

function nextActionButtonTone(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return "border-rose-400/25 bg-rose-500/10 text-rose-100";
  if (priority === "warning") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  return "border-cyan-400/20 bg-cyan-500/10 text-cyan-100";
}

function priorityLabel(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return "즉시";
  if (priority === "warning") return "점검";
  return "다음";
}

function GlanceTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "danger" | "normal" | "success" | "warning";
}) {
  const toneClass = {
    danger: "border-rose-500/30 bg-rose-500/[0.06] text-rose-300",
    normal: "border-zinc-800/60 bg-zinc-900/40 text-zinc-200",
    success: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300",
    warning: "border-amber-500/25 bg-amber-500/[0.06] text-amber-300",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 backdrop-blur-xl ${toneClass}`}>
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-zinc-100">{value}</div>
      <p className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}
