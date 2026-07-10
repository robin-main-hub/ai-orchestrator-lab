import type { ModelDescriptor, ProviderProfile } from "@ai-orchestrator/protocol";
import { ArrowLeft, FileText, KeyRound, RefreshCw, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkbenchAgent } from "../../types";
import { formatModelDisplayName } from "../../lib/helpers";
import { agentPrimaryDisplayName } from "../../lib/agentDisplay";
import { selectQuickSwitchProviders } from "../../lib/providerQuickSwitchOptions";

type AgentConfigPatch = Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>;

export function AgentQuickSwitchPanel({
  modelCatalog,
  onAssignModel,
  onAssignProvider,
  onBack,
  onRefreshModels,
  onUpdateAgentConfig,
  providers,
  selectedAgent,
  selectedProvider,
  defaultCredentialProviderIds = new Set(),
}: {
  defaultCredentialProviderIds?: Set<string>;
  modelCatalog: Record<string, ModelDescriptor[]>;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onBack?: () => void;
  onRefreshModels?: (providerId: string) => Promise<void> | void;
  onUpdateAgentConfig: (patch: AgentConfigPatch) => void;
  providers: ProviderProfile[];
  selectedAgent: WorkbenchAgent;
  selectedProvider?: ProviderProfile;
}) {
  const [refreshingModels, setRefreshingModels] = useState(false);
  const providerModels = selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [];
  const visibleModels = compactModels(providerModels, selectedAgent.modelId, selectedProvider?.defaultModel);
  const visibleProviders = selectQuickSwitchProviders({
    defaultCredentialProviderIds,
    providers,
    selectedProviderId: selectedAgent.providerProfileId,
  });
  const providerGroups = createProviderModelGroups(
    visibleProviders,
    modelCatalog,
    selectedAgent.modelId,
  );
  const agentName = agentPrimaryDisplayName(selectedAgent);
  const refreshableProviders = visibleProviders.filter((provider) => !provider.tags.includes("mock"));
  const canRefreshModels = Boolean(refreshableProviders.length > 0 && onRefreshModels);
  const initialRefreshRequested = useRef(false);
  const handleRefreshModels = async () => {
    if (!onRefreshModels || refreshingModels || refreshableProviders.length === 0) return;
    setRefreshingModels(true);
    try {
      await Promise.all(refreshableProviders.map((provider) => onRefreshModels(provider.id)));
    } finally {
      setRefreshingModels(false);
    }
  };
  useEffect(() => {
    if (!canRefreshModels || initialRefreshRequested.current) return;
    initialRefreshRequested.current = true;
    void handleRefreshModels();
  }, [canRefreshModels]);

  return (
    <section
      className="rounded-lg border border-white/10 bg-surface/55 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-focus-id="agent-quick-switch-panel"
      tabIndex={-1}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/[0.08] hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!onBack}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-3 w-3" />
          ← Agents로 돌아가기
        </button>
        <button
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canRefreshModels || refreshingModels}
          onClick={handleRefreshModels}
          type="button"
        >
          <RefreshCw className={`h-3 w-3 ${refreshingModels ? "animate-spin" : ""}`} />
          {refreshingModels ? "새로고침 중" : "표시된 모델 새로고침"}
        </button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            <Sparkles className="h-3 w-3" />
            원클릭 전환
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{agentName} 설정을 바로 바꿉니다</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            대화 중에도 공급자, 모델, SOUL, AGENTS 지침을 한 번에 전환합니다.
            {onRefreshModels ? " 패널을 열 때 표시된 공급업체 모델을 다시 확인합니다." : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-muted-foreground">
          현재 {formatModelDisplayName(selectedAgent.modelId ?? selectedProvider?.defaultModel ?? "모델 대기")}
        </span>
      </div>

      <ProviderModelSwitchBoard
        groups={providerGroups}
        onAssignModel={onAssignModel}
        onAssignProvider={onAssignProvider}
        selectedAgent={selectedAgent}
        visibleModelCount={visibleModels.length}
      />

      <QuickSwitchGroup icon={Sparkles} label="SOUL">
        <QuickSwitchButton
          active={selectedAgent.soulMode === "summary"}
          label="요약"
          onClick={() => onUpdateAgentConfig({ configSource: normalizeConfigSource(selectedAgent), soulMode: "summary" })}
        />
        <QuickSwitchButton
          active={selectedAgent.soulMode === "retrieved"}
          label="검색 기억"
          onClick={() => onUpdateAgentConfig({ configSource: normalizeConfigSource(selectedAgent), soulMode: "retrieved" })}
        />
        <QuickSwitchButton
          active={selectedAgent.soulMode === "full"}
          label="전체"
          onClick={() => onUpdateAgentConfig({ configSource: normalizeConfigSource(selectedAgent), soulMode: "full" })}
        />
        <QuickSwitchButton
          active={selectedAgent.soulMode === "off"}
          label="끄기"
          onClick={() => onUpdateAgentConfig({ configSource: "off", soulMode: "off" })}
        />
      </QuickSwitchGroup>

      <QuickSwitchGroup icon={FileText} label="AGENTS">
        <QuickSwitchButton
          active={selectedAgent.configSource === "markdown"}
          label="Markdown"
          onClick={() => onUpdateAgentConfig({ configSource: "markdown", soulMode: normalizeSoulMode(selectedAgent) })}
        />
        <QuickSwitchButton
          active={selectedAgent.configSource === "internal"}
          label="내부"
          onClick={() => onUpdateAgentConfig({ configSource: "internal", soulMode: normalizeSoulMode(selectedAgent) })}
        />
        <QuickSwitchButton
          active={selectedAgent.configSource === "off"}
          label="끄기"
          onClick={() => onUpdateAgentConfig({ configSource: "off", soulMode: "off" })}
        />
      </QuickSwitchGroup>
    </section>
  );
}

function ProviderModelSwitchBoard({
  groups,
  onAssignModel,
  onAssignProvider,
  selectedAgent,
  visibleModelCount,
}: {
  groups: Array<{
    label: string;
    entries: Array<{
      models: ModelDescriptor[];
      provider: ProviderProfile;
    }>;
  }>;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  selectedAgent: WorkbenchAgent;
  visibleModelCount: number;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <KeyRound className="h-3 w-3 text-muted-foreground" />
        공급업체별 모델
      </p>
      {groups.length > 0 ? (
        <div
          className="max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:var(--accent-dim)_rgba(24,24,27,0.45)] [scrollbar-width:thin]"
          data-testid="agent-model-scroll-region"
        >
          {groups.map(({ entries, label }) => {
            const providerActive = entries.some(({ provider }) => provider.id === selectedAgent.providerProfileId);
            const modelOptions = createVendorModelOptions(entries, selectedAgent.providerProfileId, selectedAgent.modelId);
            return (
              <article
                className={`rounded-lg border p-2 ${
                  providerActive
                    ? "border-primary/25 bg-primary/[0.055]"
                    : "border-white/10 bg-black/20"
                }`}
                key={label}
              >
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <span
                    className={`min-w-0 rounded-md px-2 py-1 text-left text-[11px] font-semibold ${
                      providerActive ? "bg-primary/12 text-primary" : "text-foreground"
                    }`}
                  >
                    <span className="block truncate">{label}</span>
                  </span>
                  <span className="shrink-0 text-[9px] text-muted-foreground">{modelOptions.length}개 모델</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modelOptions.length > 0 ? (
                    modelOptions.map(({ active, label: modelLabel, model, provider }) => {
                      const entryProviderActive = provider.id === selectedAgent.providerProfileId;
                      return (
                        <QuickSwitchButton
                          active={active}
                          key={`${provider.id}:${model.id}`}
                          label={modelLabel}
                          onClick={() => {
                            if (!entryProviderActive) {
                              onAssignProvider(selectedAgent.id, provider.id);
                            }
                            onAssignModel(selectedAgent.id, model.id);
                          }}
                        />
                      );
                    })
                  ) : (
                    entries.map(({ provider }) => (
                      <QuickSwitchButton
                        active={provider.id === selectedAgent.providerProfileId}
                        key={provider.id}
                        label={provider.name}
                        onClick={() => onAssignProvider(selectedAgent.id, provider.id)}
                      />
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <span className="rounded-full border border-border bg-surface/70 px-2.5 py-1 text-[10px] text-muted-foreground">
          등록된 API/OAuth 대기
        </span>
      )}
      {visibleModelCount === 0 && groups.length > 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">현재 공급업체의 모델 목록은 아직 대기 중입니다.</p>
      ) : null}
    </div>
  );
}

function createVendorModelOptions(
  entries: Array<{ models: ModelDescriptor[]; provider: ProviderProfile }>,
  selectedProviderId?: string,
  selectedModelId?: string,
) {
  const optionByLabel = new Map<
    string,
    {
      active: boolean;
      label: string;
      model: ModelDescriptor;
      provider: ProviderProfile;
    }
  >();

  for (const { models, provider } of entries) {
    for (const model of models) {
      const label = formatModelDisplayName(model.name ?? model.id);
      const active = provider.id === selectedProviderId && model.id === selectedModelId;
      const existing = optionByLabel.get(label);
      if (!existing || active || (provider.id === selectedProviderId && !existing.active)) {
        optionByLabel.set(label, { active, label, model, provider });
      }
    }
  }

  return Array.from(optionByLabel.values());
}

function createProviderModelGroups(
  providers: ProviderProfile[],
  modelCatalog: Record<string, ModelDescriptor[]>,
  selectedModelId?: string,
) {
  const groups = new Map<string, Array<{ models: ModelDescriptor[]; provider: ProviderProfile }>>();
  for (const provider of providers) {
    const label = providerVendorLabel(provider);
    const models = compactModels(modelCatalog[provider.id] ?? [], selectedModelId, provider.defaultModel);
    const entries = groups.get(label) ?? [];
    entries.push({ models, provider });
    groups.set(label, entries);
  }
  return Array.from(groups, ([label, entries]) => ({ entries, label }));
}

function compactModels(
  models: ModelDescriptor[],
  selectedModelId?: string,
  defaultModelId?: string,
) {
  const seen = new Set<string>();
  return models
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    })
    .sort((a, b) => modelRank(a, selectedModelId, defaultModelId) - modelRank(b, selectedModelId, defaultModelId));
}

function modelRank(model: ModelDescriptor, selectedModelId?: string, defaultModelId?: string) {
  if (model.id === selectedModelId) return 0;
  if (model.id === defaultModelId) return 1;
  const value = `${model.id} ${model.name ?? ""}`.toLowerCase();
  if (value.includes("opus") || value.includes("pro") || value.includes("r1")) return 2;
  if (value.includes("sonnet") || value.includes("v2.5")) return 3;
  return 4;
}

function providerVendorLabel(provider: ProviderProfile) {
  const raw = `${provider.name} ${provider.id} ${provider.tags.join(" ")}`.toLowerCase();
  if (raw.includes("deepseek")) return "DeepSeek";
  if (raw.includes("openrouter")) return "OpenRouter";
  if (raw.includes("mimo")) return "MiMo";
  if (raw.includes("apikey.fun") || raw.includes("claude") || raw.includes("anthropic")) return "Claude";
  if (raw.includes("openai")) return "OpenAI";
  if (raw.includes("grok")) return "Grok";
  if (raw.includes("codex")) return "Codex";
  if (raw.includes("ollama")) return "Ollama";
  return provider.name;
}

function normalizeConfigSource(agent: WorkbenchAgent): WorkbenchAgent["configSource"] {
  return agent.configSource === "off" ? "markdown" : agent.configSource;
}

function normalizeSoulMode(agent: WorkbenchAgent): WorkbenchAgent["soulMode"] {
  return agent.soulMode === "off" ? "summary" : agent.soulMode;
}

function QuickSwitchGroup({
  children,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 text-muted-foreground" />
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function QuickSwitchButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`max-w-full rounded-full border px-2.5 py-1 text-[10px] font-medium leading-snug transition ${
        active
          ? "border-primary/40 bg-primary/12 text-primary shadow-[0_0_18px_var(--accent-dim)]"
          : "border-white/10 bg-black/25 text-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="block max-w-[18rem] whitespace-normal break-words text-left">{label}</span>
    </button>
  );
}
