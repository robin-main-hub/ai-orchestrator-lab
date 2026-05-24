import { Bot, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { modelWindowSize } from "../lib/appConstants";
import { agentRoleLabel } from "../lib/helpers";
import type { AgentActivityStatus, AgentVisualSettings, ModelCatalog, WindowAuditItem, WorkbenchAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { WindowChecklist } from "./WindowChecklist";

export function AgentStatePanel({
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
}: {
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
}) {
  const auditItems: WindowAuditItem[] = [
    {
      id: "dynamic-agents",
      label: "추가/삭제",
      status: "ready",
      detail: "에이전트 수는 고정 4명이 아니라 필요할 때 계속 늘리고 줄입니다.",
    },
    {
      id: "provider-lock",
      label: "Provider 점유",
      status: "ready",
      detail: "다른 agent가 쓰는 provider는 선택창에서 비활성화합니다.",
    },
    {
      id: "model-window",
      label: "모델 선택",
      status: "ready",
      detail: "모델이 8개를 넘으면 좌우 이동으로 고를 수 있습니다.",
    },
    {
      id: "agent-profile",
      label: "프로필/Soul",
      status: "ready",
      detail: "연필 메뉴에서 이름, 역할, 프로필 사진을 바꾸고 중앙에서 SOUL.md/AGENTS.md를 다룹니다.",
    },
  ];

  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <Bot size={17} />
        <h2>Agents</h2>
        <button className="icon-button" onClick={onAddAgent} type="button" aria-label="봇 추가">
          <Plus size={15} />
        </button>
      </header>
      <div className="agent-list">
        {agents.map((agent) => {
          const activityStatus = agentActivityById[agent.id] ?? "idle";
          const providerModels = agent.providerProfileId ? (modelCatalog[agent.providerProfileId] ?? []) : [];
          const modelWindowStart = modelWindowStartByAgentId[agent.id] ?? 0;
          const visibleModels = providerModels.slice(modelWindowStart, modelWindowStart + modelWindowSize);
          const hasModelOverflow = providerModels.length > modelWindowSize;
          const canShiftModelsLeft = hasModelOverflow && modelWindowStart > 0;
          const canShiftModelsRight = hasModelOverflow && modelWindowStart + modelWindowSize < providerModels.length;
          const occupiedProviderIds = new Set(
            agents
              .filter((otherAgent) => otherAgent.id !== agent.id)
              .map((otherAgent) => otherAgent.providerProfileId)
              .filter((providerId): providerId is string => Boolean(providerId)),
          );
          const agentSummary = agentRoleLabel(agent.role);
          return (
            <div className={`agent-row ${agent.id === selectedAgentId ? "selected" : ""}`} key={agent.id}>
            <button className="agent-select-button" onClick={() => onSelectAgent(agent.id)} type="button">
              <span className="agent-avatar-status">
                <AgentAvatar agent={agent} size="small" visual={agentVisualsById[agent.id]} />
                <span
                  aria-label={`${agent.name} ${activityStatus}`}
                  className={`agent-dot ${agent.enabled ? "enabled" : ""} ${activityStatus}`}
                  title={activityStatus}
                />
              </span>
              <strong>{agent.name}</strong>
              <span className="agent-summary-line" title={agentSummary}>
                {agentSummary}
              </span>
            </button>
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
              disabled={agents.length <= 1}
              onClick={() => onRemoveAgent(agent.id)}
              type="button"
            >
              <Trash2 size={14} />
            </button>
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
                const isOccupied = occupiedProviderIds.has(profile.id);
                return (
                  <option disabled={isOccupied} key={profile.id} value={profile.id}>
                    {profile.name}{isOccupied ? " (in use)" : ""}
                  </option>
                );
              })}
            </select>
            <div className={`agent-model-row ${hasModelOverflow ? "with-window-controls" : "single-window"}`}>
              {hasModelOverflow ? (
                <button
                  aria-label={`${agent.name} model 이전`}
                  className="model-shift-button"
                  disabled={!canShiftModelsLeft}
                  onClick={() => onShiftModelWindow(agent.id, -1)}
                  type="button"
                >
                  <ChevronLeft size={14} />
                </button>
              ) : null}
              <select
                aria-label={`${agent.name} model 선택`}
                className="agent-model-select"
                disabled={providerModels.length === 0}
                onChange={(event) => onAssignModel(agent.id, event.target.value)}
                value={agent.modelId ?? visibleModels[0]?.id ?? ""}
              >
                {visibleModels.length === 0 ? (
                  <option value="">model pending</option>
                ) : null}
                {visibleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              {hasModelOverflow ? (
                <button
                  aria-label={`${agent.name} model 다음`}
                  className="model-shift-button"
                  disabled={!canShiftModelsRight}
                  onClick={() => onShiftModelWindow(agent.id, 1)}
                  type="button"
                >
                  <ChevronRight size={14} />
                </button>
              ) : null}
            </div>
            </div>
          );
        })}
      </div>
      <WindowChecklist items={auditItems} title="Agents 창 점검" />
    </section>
  );
}
