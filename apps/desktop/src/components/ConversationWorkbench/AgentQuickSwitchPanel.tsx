import type { ModelDescriptor, ProviderProfile } from "@ai-orchestrator/protocol";
import { Cpu, FileText, KeyRound, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkbenchAgent } from "../../types";
import { formatModelDisplayName } from "../../lib/helpers";
import { agentPrimaryDisplayName } from "../../lib/agentDisplay";

type AgentConfigPatch = Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>;

export function AgentQuickSwitchPanel({
  modelCatalog,
  onAssignModel,
  onAssignProvider,
  onUpdateAgentConfig,
  providers,
  selectedAgent,
  selectedProvider,
}: {
  modelCatalog: Record<string, ModelDescriptor[]>;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onUpdateAgentConfig: (patch: AgentConfigPatch) => void;
  providers: ProviderProfile[];
  selectedAgent: WorkbenchAgent;
  selectedProvider?: ProviderProfile;
}) {
  const providerModels = selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [];
  const visibleModels = compactModels(providerModels, selectedAgent.modelId, selectedProvider?.defaultModel);
  const agentName = agentPrimaryDisplayName(selectedAgent);

  return (
    <section
      className="rounded-lg border border-white/10 bg-zinc-950/55 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40"
      data-focus-id="agent-quick-switch-panel"
      tabIndex={-1}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
            <Sparkles className="h-3 w-3" />
            원클릭 전환
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{agentName} 설정을 바로 바꿉니다</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            대화 중에도 공급자, 모델, SOUL, AGENTS 지침을 한 번에 전환합니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-400">
          현재 {formatModelDisplayName(selectedAgent.modelId ?? selectedProvider?.defaultModel ?? "모델 대기")}
        </span>
      </div>

      <QuickSwitchGroup icon={KeyRound} label="공급자">
        {providers.map((provider) => (
          <QuickSwitchButton
            active={provider.id === selectedAgent.providerProfileId}
            key={provider.id}
            label={provider.name}
            onClick={() => onAssignProvider(selectedAgent.id, provider.id)}
          />
        ))}
      </QuickSwitchGroup>

      <QuickSwitchGroup icon={Cpu} label="모델">
        {visibleModels.length > 0 ? (
          visibleModels.map((model) => (
            <QuickSwitchButton
              active={model.id === selectedAgent.modelId}
              key={model.id}
              label={formatModelDisplayName(model.name ?? model.id)}
              onClick={() => onAssignModel(selectedAgent.id, model.id)}
            />
          ))
        ) : (
          <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] text-zinc-500">
            모델 목록 대기
          </span>
        )}
      </QuickSwitchGroup>

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
    .sort((a, b) => modelRank(a, selectedModelId, defaultModelId) - modelRank(b, selectedModelId, defaultModelId))
    .slice(0, 6);
}

function modelRank(model: ModelDescriptor, selectedModelId?: string, defaultModelId?: string) {
  if (model.id === selectedModelId) return 0;
  if (model.id === defaultModelId) return 1;
  const value = `${model.id} ${model.name ?? ""}`.toLowerCase();
  if (value.includes("opus") || value.includes("pro") || value.includes("r1")) return 2;
  if (value.includes("sonnet") || value.includes("v2.5")) return 3;
  return 4;
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
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <Icon className="h-3 w-3 text-zinc-400" />
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
      className={`max-w-full rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
        active
          ? "border-cyan-300/40 bg-cyan-400/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)]"
          : "border-white/10 bg-black/25 text-zinc-300 hover:border-violet-300/30 hover:bg-violet-500/10 hover:text-violet-100"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="block max-w-[13rem] truncate">{label}</span>
    </button>
  );
}
