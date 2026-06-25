import { Boxes, Server } from "lucide-react";
import { StatusBadge } from "@/ui/status-badge";
import type { ProviderRoutingConsoleItem } from "../lib/providerRoutingConsole";
import type { ModelCatalog } from "../types";

/**
 * Read-only model / provider catalog (the `system.models` shell surface).
 *
 * Presentational only. It takes the already-sanitized provider routing projection
 * (`ProviderRoutingConsoleItem[]`, which redacts secrets / URLs / paths upstream)
 * and the discovered model catalog via props. It never fetches, never mutates a
 * provider, exposes no credential entry, and renders missing credential / readiness
 * as status text. Honest empty states when no providers or no models exist —
 * never a fabricated model row.
 */
export function ReadOnlyModelCatalogPanel({
  items,
  modelCatalog,
}: {
  items: ProviderRoutingConsoleItem[];
  modelCatalog: ModelCatalog;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-xs text-muted-foreground" aria-label="모델 카탈로그">
        <p>등록된 공급자가 없습니다.</p>
        <p>공급자를 등록하면 발견된 모델 카탈로그가 여기에 읽기 전용으로 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-label="모델 카탈로그">
      {items.map((item) => {
        const models = modelCatalog[item.providerId] ?? [];
        return (
          <article className="rounded-lg border border-border bg-card/40 p-3" key={item.providerId}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <strong className="text-sm text-foreground">{item.displayName}</strong>
              <StatusBadge variant={item.trustTone}>{item.trustLabel}</StatusBadge>
              <StatusBadge variant={item.enabledTone === "success" ? "success" : "muted"}>
                {item.enabledLabel}
              </StatusBadge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>경로 {item.routeLabel}</span>
              <span>기본 모델 {item.defaultModelLabel}</span>
              <span>모델 {item.modelCount}개</span>
              <span>에이전트 {item.assignedAgentCount}명</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge variant={item.readinessTone}>{item.readinessLabel}</StatusBadge>
              <StatusBadge variant={item.discoveryTone}>{item.discoveryLabel}</StatusBadge>
              <StatusBadge variant="muted">{item.secretPolicyLabel}</StatusBadge>
            </div>
            <div className="mt-2 border-t border-border/60 pt-2">
              {models.length === 0 ? (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Boxes className="h-3 w-3" />
                  발견된 모델 없음 — 시드/캐시 모델만 사용
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {models.map((model) => (
                    <li className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground" key={model.id}>
                      <Boxes className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{model.name}</span>
                      {model.contextWindow ? (
                        <span className="text-muted-foreground">{Math.round(model.contextWindow / 1000)}K ctx</span>
                      ) : null}
                      {model.supportsTools ? <StatusBadge variant="muted">tools</StatusBadge> : null}
                      {model.supportsStreaming ? <StatusBadge variant="muted">stream</StatusBadge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
