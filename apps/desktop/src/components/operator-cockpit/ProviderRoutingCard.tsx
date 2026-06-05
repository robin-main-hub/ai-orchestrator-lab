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

export function ProviderRoutingCard({
  routing,
  onOpen,
}: {
  routing: OperatorCockpitProviderRouting;
  onOpen?: () => void;
}) {
  return (
    <GlassPanel variant="default" className="relative">
      <div aria-hidden className="absolute left-4 top-11 h-[calc(100%-3.25rem)] w-px bg-gradient-to-b from-violet-500/50 to-transparent" />
      <GlassPanelHeader
        action={
          <div className="flex items-center gap-2">
            <Badge color={badgeColorForFallback(routing.fallbackStatus)}>{fallbackStatusLabel(routing.fallbackStatus)}</Badge>
            {onOpen ? (
              <button
                aria-label={operatorCockpitActionLabels.openProviderRouting}
                className="rounded-md border border-zinc-700/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 transition hover:border-violet-400/60 hover:text-violet-200"
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
          <RadioTower className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-100">모델 경로</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3 pl-8">
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
          <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Route className="h-3 w-3" />
            선택 경로
          </span>
          <span className="break-all font-mono text-sm text-violet-200">{routing.selectedModelId}</span>
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
    <div className="rounded-lg border border-zinc-800/50 bg-black/20 p-2">
      <span className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
        {icon}
        {label}
      </span>
      <Badge color={color} size="xs">{children}</Badge>
    </div>
  );
}
