import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { modelWindowSize } from "../lib/appConstants";
import { agentRoleLabel } from "../lib/helpers";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { StatusBadge } from "@/ui/status-badge";
import type {
  AgentActivityStatus,
  AgentVisualSettings,
  ModelCatalog,
  WorkbenchAgent,
} from "../types";
import { AgentAvatar } from "./AgentAvatar";

/**
 * Agents sidebar — strict v0 port.
 *
 * source: docs/v0/v0-output/components/sidebar/agents-panel.tsx +
 *         agent-card.tsx
 *
 * v0 layout:
 *   <rounded-lg border bg-card>
 *     <header chevron + "Agents" + add button>
 *     <collapse content>
 *       Core    group: <AgentCard> ×N
 *       Specialists group: <AgentCard> ×N
 *       Companions  group (collapsible): <AgentCard> ×N
 *
 * AgentCard (v0):
 *   avatar + role + Primary badge (top row, hover shows Pencil/Trash)
 *   model selector chip + "in use" indicator (bottom row)
 *
 * 우리 데이터 모델 매핑:
 *   v0 의 agent.category (core / specialist / companion) 가 우리에겐
 *   없음. role 로부터 derive — see roleToCategory() below.
 *
 * 안 들어간 기존 기능 (Stage 2-1 의 §2 3-tier active/standby/specialist
 * lane, 7-state vocabulary dot tone 등) 는 docs/specs/v0-port-deferred-
 * features.md 에 기록. data plumbing 이 충분히 흘러올 때 sub-feature 로
 * 재도입.
 */

export type AgentsSidebarProps = {
  agents: WorkbenchAgent[];
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  modelCatalog: ModelCatalog;
  modelWindowStartByAgentId: Record<string, number>;
  onAddAgent: () => void;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onOpenAgentSettings: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onShiftModelWindow: (agentId: string, direction: -1 | 1) => void;
  profiles: ProviderProfile[];
  selectedAgentId?: string;
};

type AgentCategory = "core" | "specialist" | "companion";

function roleToCategory(role: WorkbenchAgent["role"]): AgentCategory {
  switch (role) {
    case "orchestrator":
    case "architect":
    case "builder":
    case "reviewer":
    case "executor":
      return "core";
    case "companion":
    case "external":
      return "companion";
    default:
      return "specialist";
  }
}

export function AgentsSidebar({
  agents,
  agentActivityById,
  agentVisualsById,
  modelCatalog,
  modelWindowStartByAgentId,
  onAddAgent,
  onAssignModel,
  onAssignProvider,
  onOpenAgentSettings,
  onRemoveAgent,
  onSelectAgent,
  onShiftModelWindow,
  profiles,
  selectedAgentId,
}: AgentsSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  const core: WorkbenchAgent[] = [];
  const specialists: WorkbenchAgent[] = [];
  const companions: WorkbenchAgent[] = [];
  for (const agent of agents) {
    const cat = roleToCategory(agent.role);
    if (cat === "core") core.push(agent);
    else if (cat === "specialist") specialists.push(agent);
    else companions.push(agent);
  }

  const occupiedProviderIds = new Set(
    agents
      .map((a) => a.providerProfileId)
      .filter((id): id is string => Boolean(id)),
  );

  const sharedCardProps = {
    agentActivityById,
    agentVisualsById,
    modelCatalog,
    modelWindowStartByAgentId,
    onAssignModel,
    onAssignProvider,
    onOpenAgentSettings,
    onRemoveAgent,
    onSelectAgent,
    onShiftModelWindow,
    profiles,
    selectedAgentId,
    occupiedProviderIds,
  };

  return (
    <Collapsible
      aria-label="Agents"
      asChild
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      <section className="agents-sidebar-root rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <CollapsibleTrigger asChild>
            <button
              aria-expanded={isOpen}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
              type="button"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  !isOpen && "-rotate-90",
                )}
              />
              Agents
              <span className="text-xs text-muted-foreground">{agents.length}</span>
            </button>
          </CollapsibleTrigger>
          <Button
            aria-label="agent 추가"
            className="h-6 w-6"
            onClick={onAddAgent}
            size="icon"
            variant="ghost"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="space-y-3 p-2">
            <AgentGroup
              agents={core}
              label="Core"
              {...sharedCardProps}
            />
            <AgentGroup
              agents={specialists}
              label="Specialists"
              {...sharedCardProps}
            />
            <AgentGroupCollapsible
              agents={companions}
              defaultOpen={false}
              label="Companions"
              {...sharedCardProps}
            />
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

type SharedCardProps = {
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  modelCatalog: ModelCatalog;
  modelWindowStartByAgentId: Record<string, number>;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onOpenAgentSettings: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onShiftModelWindow: (agentId: string, direction: -1 | 1) => void;
  profiles: ProviderProfile[];
  selectedAgentId?: string;
  occupiedProviderIds: Set<string>;
};

function AgentGroup({
  label,
  agents,
  ...shared
}: SharedCardProps & { label: string; agents: WorkbenchAgent[] }) {
  if (agents.length === 0) return null;
  return (
    <div className="space-y-1">
      <span className="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="space-y-1">
        {agents.map((agent) => (
          <AgentCard agent={agent} key={agent.id} {...shared} />
        ))}
      </div>
    </div>
  );
}

function AgentGroupCollapsible({
  label,
  agents,
  defaultOpen = true,
  ...shared
}: SharedCardProps & {
  label: string;
  agents: WorkbenchAgent[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  if (agents.length === 0) return null;
  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <CollapsibleTrigger asChild>
        <button
          aria-expanded={isOpen}
          className="flex w-full items-center gap-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
          type="button"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", !isOpen && "-rotate-90")}
          />
          {label} ({agents.length})
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1">
          {agents.map((agent) => (
            <AgentCard agent={agent} key={agent.id} {...shared} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AgentCard({
  agent,
  agentActivityById,
  agentVisualsById,
  modelCatalog,
  modelWindowStartByAgentId,
  onAssignModel,
  onAssignProvider,
  onOpenAgentSettings,
  onRemoveAgent,
  onSelectAgent,
  onShiftModelWindow,
  profiles,
  selectedAgentId,
  occupiedProviderIds,
}: SharedCardProps & { agent: WorkbenchAgent }) {
  const isSelected = agent.id === selectedAgentId;
  const activity = agentActivityById[agent.id] ?? "idle";
  const isResponding = activity === "responding";
  const isPreparing = activity === "preparing";
  const visual = agentVisualsById[agent.id];
  const providerModels = agent.providerProfileId
    ? modelCatalog[agent.providerProfileId] ?? []
    : [];
  const modelWindowStart = modelWindowStartByAgentId[agent.id] ?? 0;
  const visibleModels = providerModels.slice(
    modelWindowStart,
    modelWindowStart + modelWindowSize,
  );
  const hasModelOverflow = providerModels.length > modelWindowSize;
  const canShiftLeft = hasModelOverflow && modelWindowStart > 0;
  const canShiftRight =
    hasModelOverflow && modelWindowStart + modelWindowSize < providerModels.length;
  const activeProvider = profiles.find(
    (profile) => profile.id === agent.providerProfileId,
  );
  const activeModel = providerModels.find((model) => model.id === agent.modelId);
  const providerLabel = activeProvider?.name ?? "provider...";
  const modelLabel = activeModel?.name ?? agent.modelId ?? "model pending";

  return (
    <div
      className={cn(
        "group flex flex-col gap-2 rounded-md border border-transparent p-2 transition-colors",
        isSelected
          ? "border-primary/40 bg-primary/5"
          : "hover:bg-card/60",
      )}
    >
      {/* Top row: avatar + role + Primary + actions */}
      <div className="flex items-start gap-2">
        <button
          aria-label={`${agent.name} 선택`}
          className="shrink-0"
          onClick={() => onSelectAgent(agent.id)}
          type="button"
        >
          <AgentAvatar agent={agent} size="small" visual={visual} />
        </button>

        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelectAgent(agent.id)}
          type="button"
        >
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {agent.name}
            </span>
            {agent.role === "orchestrator" ? (
              <StatusBadge className="shrink-0" size="sm" variant="primary">
                Primary
              </StatusBadge>
            ) : null}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {agentRoleLabel(agent.role)}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            aria-label={`${agent.name} 설정`}
            className="h-6 w-6"
            onClick={() => onOpenAgentSettings(agent.id)}
            size="icon"
            variant="ghost"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            aria-label={`${agent.name} 삭제`}
            className="h-6 w-6 text-destructive/70 hover:text-destructive"
            onClick={() => onRemoveAgent(agent.id)}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Bottom row: provider + model selector + status */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 pl-9">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`${agent.name} provider`}
              className="flex min-w-0 items-center gap-1 rounded bg-card/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              type="button"
            >
              <span className="truncate">{providerLabel}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onSelect={() => onAssignProvider(agent.id, "")}>
              provider...
            </DropdownMenuItem>
            {profiles.map((profile) => {
              const isOccupied =
                occupiedProviderIds.has(profile.id) &&
                profile.id !== agent.providerProfileId;
              return (
                <DropdownMenuItem
                  disabled={isOccupied}
                  key={profile.id}
                  onSelect={() => onAssignProvider(agent.id, profile.id)}
                >
                  <span className="truncate">{profile.name}</span>
                  {profile.id === agent.providerProfileId ? (
                    <span className="ml-auto text-[10px] text-primary">active</span>
                  ) : isOccupied ? (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      busy
                    </span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex min-w-0 items-center gap-0.5">
          {hasModelOverflow ? (
            <Button
              aria-label={`${agent.name} model 이전`}
              className="h-5 w-5 shrink-0"
              disabled={!canShiftLeft}
              onClick={() => onShiftModelWindow(agent.id, -1)}
              size="icon"
              variant="ghost"
            >
              <ChevronLeft className="h-2.5 w-2.5" />
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`${agent.name} model`}
                className="flex min-w-0 flex-1 items-center gap-1 rounded bg-card/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                type="button"
              >
                <span className="truncate">{modelLabel}</span>
                <ChevronDown className="h-2.5 w-2.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {visibleModels.length === 0 ? (
                <DropdownMenuItem disabled>model pending</DropdownMenuItem>
              ) : null}
              {visibleModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => onAssignModel(agent.id, model.id)}
                >
                  <span className="truncate">{model.name}</span>
                  {model.id === agent.modelId ? (
                    <span className="ml-auto text-[10px] text-primary">active</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {hasModelOverflow ? (
            <Button
              aria-label={`${agent.name} model 다음`}
              className="h-5 w-5 shrink-0"
              disabled={!canShiftRight}
              onClick={() => onShiftModelWindow(agent.id, 1)}
              size="icon"
              variant="ghost"
            >
              <ChevronRight className="h-2.5 w-2.5" />
            </Button>
          ) : null}
        </div>

        {/* in use indicator */}
        {isResponding ? (
          <StatusBadge
            className="justify-self-end whitespace-nowrap"
            size="sm"
            variant="success"
          >
            in use
          </StatusBadge>
        ) : isPreparing ? (
          <StatusBadge
            className="justify-self-end whitespace-nowrap"
            size="sm"
            variant="warning"
          >
            prepare
          </StatusBadge>
        ) : null}
      </div>
    </div>
  );
}
