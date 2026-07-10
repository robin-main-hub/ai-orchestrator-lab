import { Activity, CheckCircle2, ListChecks, ShieldAlert } from "lucide-react";
import type { OrchestrationMaturityReport } from "../../lib/orchestrationMaturity";
import type { ProductionSmokePlan } from "../../lib/productionSmokePlan";
import type { SettingsDiagnostics } from "../../lib/settingsDiagnostics";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";

export function MaturityReadinessCard({
  diagnostics,
  maturity,
  smokePlan,
}: {
  diagnostics: SettingsDiagnostics;
  maturity: OrchestrationMaturityReport;
  smokePlan: ProductionSmokePlan;
}) {
  const total = maturity.items.length;
  const blocked = maturity.blockedCount + diagnostics.blockingCount;
  const variant = blocked > 0 ? "danger" : maturity.readyCount === total ? "glow" : "warning";

  return (
    <GlassPanel variant={variant}>
      <GlassPanelHeader
        action={
          <Badge color={blocked > 0 ? "red" : "green"}>
            {blocked > 0 ? "차단" : "운영 가능"}
          </Badge>
        }
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">실사용 성숙도</h2>
            <p className="text-xs text-muted-foreground">
              {maturity.readyCount} / {total} · 설정 차단 {diagnostics.blockingCount}건
            </p>
          </div>
        </div>
      </GlassPanelHeader>

      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-muted/35 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">큰 바위 진행</span>
            <Badge color={maturity.overallStatus === "ready" ? "green" : maturity.overallStatus === "blocked" ? "red" : "yellow"}>
              {maturity.overallStatus === "ready" ? "준비됨" : maturity.overallStatus === "blocked" ? "차단" : "보강 중"}
            </Badge>
          </div>
          <div className="space-y-2">
            {maturity.items.map((item) => (
              <ReadinessRow
                key={item.id}
                label={item.label}
                status={item.status === "ready" ? "pass" : item.status === "blocked" ? "block" : "warn"}
                value={item.status === "ready" ? item.detail : item.nextAction ?? item.detail}
              />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-muted/35 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">설정 진단</span>
            <Badge color={diagnostics.status === "ready" ? "green" : diagnostics.status === "blocked" ? "red" : "yellow"}>
              {diagnostics.status === "ready" ? "통과" : diagnostics.status === "blocked" ? "차단" : "주의"}
            </Badge>
          </div>
          <div className="space-y-2">
            {diagnostics.items.map((item) => (
              <ReadinessRow
                key={item.id}
                label={item.label}
                status={item.status}
                value={item.nextAction ?? "정상"}
              />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-muted/35 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">운영 스모크</span>
            <Badge color="blue">{smokePlan.items.length}축</Badge>
          </div>
          <div className="space-y-2">
            {smokePlan.items.map((item) => (
              <ReadinessRow
                key={item.id}
                label={item.label}
                status={item.mode === "live_opt_in" ? "warn" : "pass"}
                value={smokeModeLabel(item.mode)}
              />
            ))}
          </div>
        </section>
      </div>

      {maturity.nextActions.length > 0 || diagnostics.nextActions.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">다음 조치</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set([...maturity.nextActions, ...diagnostics.nextActions])).slice(0, 6).map((action) => (
              <span
                className="rounded-full border border-warning/20 bg-warning/10 px-2 py-1 text-[11px] text-warning"
                key={action}
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </GlassPanel>
  );
}

function ReadinessRow({
  label,
  status,
  value,
}: {
  label: string;
  status: "block" | "pass" | "warn";
  value: string;
}) {
  const Icon = status === "pass" ? CheckCircle2 : status === "block" ? ShieldAlert : Activity;
  const color = status === "pass" ? "text-primary" : status === "block" ? "text-destructive" : "text-warning";

  return (
    <div className="flex items-start gap-2">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-foreground">{label}</p>
        <p className="line-clamp-2 text-[10px] text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function smokeModeLabel(mode: ProductionSmokePlan["items"][number]["mode"]) {
  if (mode === "automated") return "자동 테스트";
  if (mode === "dry_run") return "드라이런";
  if (mode === "live_opt_in") return "명시 실행";
  return "수동 QA";
}
