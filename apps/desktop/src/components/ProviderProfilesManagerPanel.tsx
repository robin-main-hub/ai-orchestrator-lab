import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { ModelDiscoverySnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import { createProviderOperationalBadges } from "../lib/providerOperationalBadges";
import type { ModelCatalog } from "../types";
import {
  createProviderRoundtripHarness,
  createProviderSmokeReadiness,
} from "../lib/providerSmokeReadiness";

export function ProviderProfilesManagerPanel({
  modelCatalog,
  modelDiscoveryByProviderId,
  onAddProvider,
  onDiscoverModels,
  onRenameProvider,
  onRemoveProvider,
  profiles,
  usedProviderIds,
}: {
  modelCatalog: ModelCatalog;
  modelDiscoveryByProviderId: Record<string, ModelDiscoverySnapshot>;
  onAddProvider: () => void;
  onDiscoverModels: (providerId: string) => void;
  onRenameProvider: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  profiles: ProviderProfile[];
  usedProviderIds: Set<string>;
}) {
  return (
    <section className="side-panel">
      <header className="panel-title">
        <KeyRound size={17} />
        <h2>Provider Profiles</h2>
        <button aria-label="provider 추가" className="icon-button" onClick={onAddProvider} type="button">
          <Plus size={15} />
        </button>
      </header>
      <div className="provider-list">
        {profiles.map((profile) => {
          const isInUse = usedProviderIds.has(profile.id);
          const discovery = modelDiscoveryByProviderId[profile.id];
          const models = modelCatalog[profile.id] ?? [];
          const operationalBadges = createProviderOperationalBadges(profile, profiles);
          const smokeReadiness = createProviderSmokeReadiness(profile);
          const roundtripHarness = createProviderRoundtripHarness(profile);
          return (
            <article className={`provider-row ${isInUse ? "in-use" : ""}`} key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <small className="provider-model-summary flex items-center gap-1 mt-1">
                  <span>{models.length} models</span>
                  <span>/</span>
                  <StatusBadge
                    size="sm"
                    variant={
                      discovery?.status === "succeeded"
                        ? "success"
                        : discovery?.status === "loading"
                          ? "warning"
                          : discovery?.status === "failed" || discovery?.status === "blocked"
                            ? "danger"
                            : "muted"
                    }
                  >
                    {discovery?.status ?? "cached"}
                  </StatusBadge>
                  <span>/</span>
                  <span>{discovery?.source ?? "seed"}</span>
                </small>
                {operationalBadges.length > 0 ? (
                  <small className="mt-2 flex flex-wrap items-center gap-1">
                    {operationalBadges.map((badge) => (
                      <StatusBadge
                        key={badge.label}
                        size="sm"
                        variant={
                          badge.tone === "success"
                            ? "success"
                            : badge.tone === "warning"
                              ? "warning"
                              : badge.tone === "primary"
                                ? "primary"
                                : "muted"
                        }
                      >
                        {badge.label}
                      </StatusBadge>
                    ))}
                  </small>
                ) : null}
                {smokeReadiness ? (
                  <small className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
                    <StatusBadge
                      size="sm"
                      variant={smokeReadiness.tone === "success" ? "success" : "warning"}
                    >
                      {smokeReadiness.routeLabel}
                    </StatusBadge>
                    <span>{smokeReadiness.modeLabel}</span>
                    <span className="max-w-[260px] truncate font-mono text-zinc-400">
                      {smokeReadiness.commandLabel}
                    </span>
                  </small>
                ) : null}
                {roundtripHarness ? (
                  <small className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
                    <StatusBadge
                      size="sm"
                      variant={roundtripHarness.tone === "success" ? "success" : "warning"}
                    >
                      왕복 테스트
                    </StatusBadge>
                    <span>{roundtripHarness.networkPolicyLabel}</span>
                    <span>/</span>
                    <span>{roundtripHarness.secretPolicyLabel}</span>
                    <span>/</span>
                    <span>{roundtripHarness.logPolicyLabel}</span>
                  </small>
                ) : null}
              </div>
              <StatusBadge
                size="sm"
                variant={
                  profile.trustLevel === "trusted"
                    ? "success"
                    : profile.trustLevel === "limited"
                      ? "warning"
                      : profile.trustLevel === "untrusted"
                        ? "danger"
                        : "muted"
                }
              >
                {profile.trustLevel}
              </StatusBadge>
              <div className="provider-actions">
                <button
                  aria-label={`${profile.name} model discovery`}
                  className="provider-discovery-button"
                  onClick={() => onDiscoverModels(profile.id)}
                  title="model discovery"
                  type="button"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  aria-label={`${profile.name} 이름 변경`}
                  className="provider-rename-button"
                  onClick={() => onRenameProvider(profile.id)}
                  title="provider 이름 변경"
                  type="button"
                >
                  <Pencil size={13} />
                </button>
                <button
                  aria-label={`${profile.name} 삭제`}
                  className="provider-remove-button"
                  disabled={isInUse || profiles.length <= 1}
                  onClick={() => onRemoveProvider(profile.id)}
                  title={isInUse ? "agent가 사용 중이라 삭제할 수 없음" : "provider 삭제"}
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
