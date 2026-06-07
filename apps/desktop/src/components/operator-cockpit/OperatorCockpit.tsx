import { useState, type ReactNode } from "react";
import {
  Activity,
  BrainCircuit,
  CheckSquare,
  ChevronDown,
  Database,
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
import { ApprovalEvidenceCard } from "./ApprovalEvidenceCard";
import { Badge } from "./Badge";
import { DispatchHistoryCard } from "./DispatchHistoryCard";
import { HandoffCard } from "./HandoffCard";
import { MemoryRecallCard } from "./MemoryRecallCard";
import { MaturityReadinessCard } from "./MaturityReadinessCard";
import { ProviderRoutingCard } from "./ProviderRoutingCard";
import { RecoveryContinuityCard } from "./RecoveryContinuityCard";
import { WorkerFleetCard } from "./WorkerFleetCard";
import { badgeColorForMirror, formatClock, mirrorHealthLabel } from "./presentation";

export function OperatorCockpit({
  snapshot,
  onPreviewEvidence,
  onOpenMemory,
  onOpenProviderRouting,
  onOpenRecovery,
  readiness,
}: {
  snapshot: OperatorCockpitSnapshot;
  onPreviewEvidence?: () => void;
  onOpenMemory?: () => void;
  onOpenProviderRouting?: () => void;
  onOpenRecovery?: () => void;
  readiness?: {
    diagnostics: SettingsDiagnostics;
    maturity: OrchestrationMaturityReport;
    nextActions?: CockpitNextActionItem[];
    smokePlan: ProductionSmokePlan;
  };
}) {
  const [showDetails, setShowDetails] = useState(false);
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
              hint={criticalApprovalCount > 0 ? `${criticalApprovalCount} high risk` : "건"}
              tone={approvalCount > 0 ? "warning" : "normal"}
            />
            <GlanceTile
              icon={<Route className="h-4 w-4" />}
              label="현재 대화 모델"
              value={snapshot.routing.selectedModelId}
              hint={snapshot.routing.providerLabel ?? "provider 대기"}
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
            <NextActionStrip actions={readiness.nextActions} />
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <WorkerFleetCard fleet={snapshot.fleet} />
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

function NextActionStrip({ actions }: { actions: CockpitNextActionItem[] }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 px-3 py-2 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          다음 행동
        </span>
        {actions.map((action) => (
          <span
            className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
              action.priority === "high"
                ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                : action.priority === "warning"
                  ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
                  : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"
            }`}
            key={action.id}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
            <span className="truncate">{action.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
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
