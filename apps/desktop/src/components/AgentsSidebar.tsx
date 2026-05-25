import { useState } from "react";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { modelWindowSize } from "../lib/appConstants";
import { agentRoleLabel } from "../lib/helpers";
import { cn } from "../lib/utils";
import type {
  AgentActivityStatus,
  AgentVisualSettings,
  ModelCatalog,
  WorkbenchAgent,
} from "../types";
import { AgentAvatar } from "./AgentAvatar";

/**
 * Stage 2-1 agent sidebar — replaces the legacy AgentStatePanel
 * (removed in legacy-cleanup PR).
 *
 * Implements docs/design-decisions.md §2 "Agent Roster 구조" — a 3-tier
 * layout that groups agents by **what they're doing right now** rather
 * than rendering them as a flat list of equally weighted cards.
 *
 *   ACTIVE   — agent.activityStatus !== "idle". Cyan pulse dot.
 *              These cards show full controls (provider / model select,
 *              rename, remove) because the user is most likely about to
 *              touch them.
 *   STANDBY  — enabled && activityStatus === "idle". Quiet teal dot.
 *              Compact card; click to select, hover for inline actions.
 *   SPECIALIST DRAWER — !enabled. Collapsed by default; expand to surface
 *              advanced / rarely-used personas without polluting the
 *              everyday sidebar.
 *
 * Naming / state vocabulary lives in design-decisions.md §2 — the
 * 7-state enum (active / ready / gated / waiting_approval / blocked /
 * watch_only / standby) is the long-term target. Today's data source
 * (`AgentActivityStatus = "idle" | "preparing" | "responding"`) only
 * covers 3 of those, so we map conservatively and leave the richer
 * states for a later wiring pass.
 *
 * The legacy WindowChecklist is **intentionally omitted** here — per
 * design-decisions §1 it's a dev-only instrument and shouldn't ride
 * along with the production sidebar.
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

type AgentLane = "active" | "standby" | "specialist";

type LaneBucket = {
  lane: AgentLane;
  agents: WorkbenchAgent[];
};

/**
 * Sort agents into 3 lanes based on enabled + activityStatus.
 *
 * Bucket order within each lane preserves the input order so that user
 * reorderings (drag-and-drop, manual sort) survive the grouping.
 */
function groupAgentsByLane(
  agents: WorkbenchAgent[],
  activityById: Record<string, AgentActivityStatus>,
): LaneBucket[] {
  const active: WorkbenchAgent[] = [];
  const standby: WorkbenchAgent[] = [];
  const specialist: WorkbenchAgent[] = [];

  for (const agent of agents) {
    const status = activityById[agent.id] ?? "idle";
    if (!agent.enabled) {
      specialist.push(agent);
      continue;
    }
    if (status === "preparing" || status === "responding") {
      active.push(agent);
    } else {
      standby.push(agent);
    }
  }

  return [
    { lane: "active", agents: active },
    { lane: "standby", agents: standby },
    { lane: "specialist", agents: specialist },
  ];
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
  const [specialistOpen, setSpecialistOpen] = useState(false);
  const [{ agents: active }, { agents: standby }, { agents: specialist }] =
    groupAgentsByLane(agents, agentActivityById) as [LaneBucket, LaneBucket, LaneBucket];

  // Provider occupancy is computed once per render — every card needs the
  // same set, no need to recompute per row.
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
    totalAgentCount: agents.length,
    occupiedProviderIds,
  };

  return (
    <section className="side-panel compact agents-sidebar" aria-label="Agents">
      <header className="panel-title">
        <Bot size={17} />
        <h2>Agents</h2>
        <span className="agents-sidebar__count">{agents.length}</span>
        <button
          aria-label="agent 추가"
          className="icon-button"
          onClick={onAddAgent}
          type="button"
        >
          <Plus size={15} />
        </button>
      </header>

      <div className="agents-sidebar__lanes">
        {active.length > 0 && (
          <Lane label="ACTIVE" tone="active" count={active.length}>
            {active.map((agent) => (
              <AgentSidebarCard
                {...sharedCardProps}
                agent={agent}
                density="full"
                key={agent.id}
              />
            ))}
          </Lane>
        )}

        <Lane label="STANDBY" tone="standby" count={standby.length}>
          {standby.length === 0 ? (
            <p className="agents-sidebar__empty">대기 중인 agent 없음</p>
          ) : (
            standby.map((agent) => (
              <AgentSidebarCard
                {...sharedCardProps}
                agent={agent}
                density="full"
                key={agent.id}
              />
            ))
          )}
        </Lane>

        {specialist.length > 0 && (
          <div className="agents-sidebar__drawer">
            <button
              aria-expanded={specialistOpen}
              className="agents-sidebar__drawer-trigger"
              onClick={() => setSpecialistOpen((o) => !o)}
              type="button"
            >
              <ChevronDown
                className={cn(
                  "agents-sidebar__drawer-chevron",
                  !specialistOpen && "agents-sidebar__drawer-chevron--closed",
                )}
                size={12}
              />
              <span>SPECIALISTS ({specialist.length})</span>
            </button>
            {specialistOpen && (
              <div className="agents-sidebar__drawer-content">
                {specialist.map((agent) => (
                  <AgentSidebarCard
                    {...sharedCardProps}
                    agent={agent}
                    density="compact"
                    key={agent.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Lane({
  label,
  tone,
  count,
  children,
}: {
  label: string;
  tone: "active" | "standby";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`agents-sidebar__lane agents-sidebar__lane--${tone}`}>
      <div className="agents-sidebar__lane-header">
        <span className="agents-sidebar__lane-label">{label}</span>
        {count > 0 && (
          <span className="agents-sidebar__lane-count" aria-hidden>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

type AgentSidebarCardProps = Omit<AgentsSidebarProps, "agents" | "onAddAgent"> & {
  agent: WorkbenchAgent;
  /**
   * "full" = active/standby lane (provider + model selectors visible).
   * "compact" = specialist drawer (collapsed actions, click → settings drawer).
   */
  density: "full" | "compact";
  totalAgentCount: number;
  occupiedProviderIds: Set<string>;
};

function AgentSidebarCard({
  agent,
  agentActivityById,
  agentVisualsById,
  density,
  modelCatalog,
  modelWindowStartByAgentId,
  occupiedProviderIds,
  onAssignModel,
  onAssignProvider,
  onOpenAgentSettings,
  onRemoveAgent,
  onSelectAgent,
  onShiftModelWindow,
  profiles,
  selectedAgentId,
  totalAgentCount,
}: AgentSidebarCardProps) {
  const activityStatus = agentActivityById[agent.id] ?? "idle";
  const isSelected = agent.id === selectedAgentId;
  const summary = agentRoleLabel(agent.role);

  // Specialist drawer cards stay compact — avatar + name + role only.
  // Clicking the row opens the agent settings drawer (provider / model /
  // permissions live there) rather than crowding the sidebar.
  if (density === "compact") {
    return (
      <button
        aria-label={`${agent.name} 설정 열기`}
        className={cn(
          "agents-sidebar__row agents-sidebar__row--compact",
          isSelected && "agents-sidebar__row--selected",
        )}
        onClick={() => {
          onSelectAgent(agent.id);
          onOpenAgentSettings(agent.id);
        }}
        type="button"
      >
        <AgentAvatar agent={agent} size="small" visual={agentVisualsById[agent.id]} />
        <div className="agents-sidebar__row-body">
          <strong className="agents-sidebar__row-name">{agent.name}</strong>
          <span className="agents-sidebar__row-summary">{summary}</span>
        </div>
      </button>
    );
  }

  // Full card — used by active / standby lanes.
  const providerModels = agent.providerProfileId
    ? (modelCatalog[agent.providerProfileId] ?? [])
    : [];
  const modelWindowStart = modelWindowStartByAgentId[agent.id] ?? 0;
  const visibleModels = providerModels.slice(modelWindowStart, modelWindowStart + modelWindowSize);
  const hasModelOverflow = providerModels.length > modelWindowSize;
  const canShiftModelsLeft = hasModelOverflow && modelWindowStart > 0;
  const canShiftModelsRight =
    hasModelOverflow && modelWindowStart + modelWindowSize < providerModels.length;

  return (
    <div
      className={cn(
        "agents-sidebar__row agents-sidebar__row--full",
        isSelected && "agents-sidebar__row--selected",
      )}
    >
      <button
        className="agents-sidebar__row-select"
        onClick={() => onSelectAgent(agent.id)}
        type="button"
      >
        <span className="agent-avatar-status">
          <AgentAvatar agent={agent} size="small" visual={agentVisualsById[agent.id]} />
          {(() => {
            const display = deriveDisplayState(agent, activityStatus);
            return (
              <span
                aria-label={`${agent.name} ${display}`}
                className={`agent-dot ${agent.enabled ? "enabled" : ""} ${activityStatus} agent-dot--${display}`}
                title={displayStateLabel(display)}
              />
            );
          })()}
        </span>
        <div className="agents-sidebar__row-body">
          <strong className="agents-sidebar__row-name">{agent.name}</strong>
          <span className="agents-sidebar__row-summary" title={summary}>
            {summary}
          </span>
        </div>
      </button>

      <div className="agents-sidebar__row-actions">
        <button
          aria-label={`${agent.name} 설정`}
          className="agent-rename-button"
          onClick={() => onOpenAgentSettings(agent.id)}
          title="agent 설정"
          type="button"
        >
          <Pencil size={14} />
        </button>
        <button
          aria-label={`${agent.name} 제거`}
          className="agent-remove-button"
          disabled={totalAgentCount <= 1}
          onClick={() => onRemoveAgent(agent.id)}
          type="button"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <select
        aria-label={`${agent.name} provider 선택`}
        className="agent-provider-select"
        onChange={(event) => onAssignProvider(agent.id, event.target.value)}
        value={agent.providerProfileId ?? ""}
      >
        <option disabled value="">
          provider 선택
        </option>
        {profiles.map((profile) => {
          // A provider is "occupied" only by *other* agents; agent itself
          // is allowed to stay on its current provider.
          const isOccupied =
            occupiedProviderIds.has(profile.id) && agent.providerProfileId !== profile.id;
          return (
            <option disabled={isOccupied} key={profile.id} value={profile.id}>
              {profile.name}
              {isOccupied ? " (in use)" : ""}
            </option>
          );
        })}
      </select>

      <div
        className={`agent-model-row ${hasModelOverflow ? "with-window-controls" : "single-window"}`}
      >
        {hasModelOverflow && (
          <button
            aria-label={`${agent.name} model 이전`}
            className="model-shift-button"
            disabled={!canShiftModelsLeft}
            onClick={() => onShiftModelWindow(agent.id, -1)}
            type="button"
          >
            <ChevronLeft size={14} />
          </button>
        )}
        <select
          aria-label={`${agent.name} model 선택`}
          className="agent-model-select"
          disabled={providerModels.length === 0}
          onChange={(event) => onAssignModel(agent.id, event.target.value)}
          value={agent.modelId ?? visibleModels[0]?.id ?? ""}
        >
          {visibleModels.length === 0 && <option value="">model pending</option>}
          {visibleModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        {hasModelOverflow && (
          <button
            aria-label={`${agent.name} model 다음`}
            className="model-shift-button"
            disabled={!canShiftModelsRight}
            onClick={() => onShiftModelWindow(agent.id, 1)}
            type="button"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * design-decisions.md §2 — 7-state agent vocabulary
 *   active · ready · gated · waiting_approval · blocked · watch_only · standby
 *
 * 현재 runtime data 가 3-state (idle | preparing | responding) 만 노출하므로
 * 여기서 derived state 5개를 매핑. `waiting_approval` 과 `blocked` 는 별도
 * snapshot (permission queue, error log) 이 sidebar 까지 흘러올 때 추가.
 */
type DisplayState =
  | "active"
  | "ready"
  | "gated"
  | "waiting_approval"
  | "blocked"
  | "watch_only"
  | "standby";

function deriveDisplayState(
  agent: WorkbenchAgent,
  activityStatus: AgentActivityStatus,
): DisplayState {
  if (!agent.enabled) return "standby";
  if (agent.role === "auditor" || agent.role === "watchdog") return "watch_only";
  if (activityStatus === "responding") return "active";
  if (activityStatus === "preparing") return "gated";
  return "ready";
}

function displayStateLabel(state: DisplayState): string {
  const labels: Record<DisplayState, string> = {
    active: "활성 (LLM call 중)",
    ready: "대기 (호출 가능)",
    gated: "권한 셋업 중",
    waiting_approval: "사용자 승인 대기",
    blocked: "오류 / 의존성 실패",
    watch_only: "관찰 전용",
    standby: "비활성",
  };
  return labels[state];
}
