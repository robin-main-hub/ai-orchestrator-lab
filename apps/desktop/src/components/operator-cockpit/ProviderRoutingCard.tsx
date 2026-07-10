import React from "react";
import { Gauge, RadioTower, Route, ShieldCheck, Zap } from "lucide-react";
import type { OperatorCockpitProviderRouting } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { operatorCockpitActionLabels } from "./actionLabels";
import {
  badgeColorForCost,
  badgeColorForFallback,
  badgeColorForSpeed,
  badgeColorForTrust,
  costBadgeLabel,
  fallbackStatusLabel,
  speedBadgeLabel,
  trustBadgeLabel,
} from "./presentation";
import { formatOperatorModelLabel, formatOperatorProviderLabel } from "./workerDisplay";

export function ProviderRoutingCard({
  routing,
  onOpen,
}: {
  routing: OperatorCockpitProviderRouting;
  onOpen?: () => void;
}) {
  const providerLabel = routing.providerLabel ? formatOperatorProviderLabel(routing.providerLabel) : undefined;
  const selectedModelLabel = formatOperatorModelLabel(routing.selectedModelId);

  return (
    <GlassPanel variant="default" className="relative">
      <div aria-hidden className="absolute left-4 top-11 h-[calc(100%-3.25rem)] w-px bg-gradient-to-b from-primary/50 to-transparent" />
      <GlassPanelHeader
        action={
          <div className="flex items-center gap-2">
            <Badge color={badgeColorForFallback(routing.fallbackStatus)}>{fallbackStatusLabel(routing.fallbackStatus)}</Badge>
            {onOpen ? (
              <button
                aria-label={operatorCockpitActionLabels.openProviderRouting}
                className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:border-primary/60 hover:text-primary"
                onClick={onOpen}
                title={operatorCockpitActionLabels.openProviderRouting}
                type="button"
              >
                열기
              </button>
            ) : null}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <RadioTower className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">현재 대화 경로</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3 pl-8">
        <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
          <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Route className="h-3 w-3" />
            선택 에이전트 경로
          </span>
          {providerLabel ? (
            <div className="mb-1 text-xs font-semibold text-foreground">{providerLabel}</div>
          ) : null}
          <span className="text-sm font-semibold text-primary">{selectedModelLabel}</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {routing.routeLabel ? <Badge color="purple" size="xs">{routing.routeLabel}</Badge> : null}
            {routing.readinessLabel ? <Badge color="blue" size="xs">{routing.readinessLabel}</Badge> : null}
            {routing.secretPolicyLabel ? <Badge color="outline" size="xs">{routing.secretPolicyLabel}</Badge> : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MetricBadge icon={<Gauge className="h-3 w-3" />} label="비용" color={badgeColorForCost(routing.costBadge)}>
            {costBadgeLabel(routing.costBadge)}
          </MetricBadge>
          <MetricBadge icon={<Zap className="h-3 w-3" />} label="속도" color={badgeColorForSpeed(routing.speedBadge)}>
            {speedBadgeLabel(routing.speedBadge)}
          </MetricBadge>
          <MetricBadge
            icon={<ShieldCheck className="h-3 w-3" />}
            label="신뢰"
            color={badgeColorForTrust(routing.trustBadge)}
          >
            {trustBadgeLabel(routing.trustBadge)}
          </MetricBadge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricBadge icon={<RadioTower className="h-3 w-3" />} label="에이전트" color="outline">
            {routing.assignedAgentCount ?? 0}명 사용
          </MetricBadge>
          <MetricBadge icon={<Route className="h-3 w-3" />} label="모델 카탈로그" color="outline">
            {routing.modelCount ?? 0}개 · {routing.discoveryLabel ?? "시드 모델 사용"}
          </MetricBadge>
        </div>
      </div>
    </GlassPanel>
  );
}

function MetricBadge({
  children,
  color,
  icon,
  label,
}: {
  children: React.ReactNode;
  color: Parameters<typeof Badge>[0]["color"];
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2">
      <span className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <Badge color={color} size="xs">{children}</Badge>
    </div>
  );
}
