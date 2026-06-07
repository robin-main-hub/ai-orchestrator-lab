import { Settings } from "lucide-react";
import type {
  ContextPackTier,
  ModelDescriptor,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import { Button } from "@/ui/button";
import type { WorkbenchAgent, AgentConfigTab, AgentPersonaSettings } from "../../types";
import { agentPrimaryDisplayName } from "../../lib/agentDisplay";
import { getAgentToolBadgeLabels, getAgentToolProfile } from "../../lib/agentToolProfiles";
import { agentRoleLabel, formatModelDisplayName, providerDisplayLabel } from "../../lib/helpers";
import {
  creativityLevelLabel,
  soulModeLabel,
  contextPackTierLabel,
} from "../../lib/uiLabels";

export function WorkbenchHeader({
  agents,
  contextPackTier,
  memoryMode,
  onContextPackTierChange,
  onOpenAgentConfig,
  onSelectAgent,
  persona,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
  sessionId,
}: {
  agents: WorkbenchAgent[];
  contextPackTier: ContextPackTier;
  memoryMode: string;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onSelectAgent: (agentId: string) => void;
  persona?: AgentPersonaSettings;
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
  sessionId: string;
}) {
  const toolProfile = selectedAgent ? getAgentToolProfile(selectedAgent.role) : undefined;
  const cycleContextPackTier = () => {
    const order: ContextPackTier[] = ["lite", "standard", "full"];
    const currentIndex = order.indexOf(contextPackTier);
    const nextTier = order[(currentIndex + 1) % order.length] ?? "standard";
    onContextPackTierChange(nextTier);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/30 px-4">
      {/* Left: Agent selector */}
      <div className="flex min-w-0 items-center gap-3">
        <select
          aria-label="현재 대화 봇 선택"
          className="min-w-0 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm font-semibold text-foreground hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none"
          onChange={(event) => onSelectAgent(event.target.value)}
          value={selectedAgentId ?? ""}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agentPrimaryDisplayName(agent)} · {agent.id === selectedAgentId
                ? formatModelDisplayName(selectedModel?.name ?? selectedModel?.id ?? agent.modelId)
                : formatModelDisplayName(agent.modelId)}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] text-muted-foreground">현재 대화 상대</span>
          <span className="truncate text-xs font-medium text-foreground">
            {selectedAgent ? agentPrimaryDisplayName(selectedAgent) : "봇 선택 필요"} ·{" "}
            {selectedProvider ? providerDisplayLabel(selectedProvider.name) : "모델 연결 대기"}
          </span>
        </div>
        {selectedAgent && toolProfile ? (
          <ToolBadgeStrip profile={toolProfile} role={selectedAgent.role} />
        ) : null}
      </div>

      {/* Center: session id */}
      <div className="hidden flex-col items-center md:flex">
        <span className="text-[10px] text-muted-foreground">세션</span>
        <span className="text-xs font-medium text-foreground">
          {sessionId.slice(-12)}
        </span>
      </div>

      {/* Right: Profile / Memory / Context / Preview chips */}
      <div className="flex items-center gap-2">
        <HeaderChip
          label="프로필"
          onClick={() => onOpenAgentConfig("profile")}
          value={selectedAgent ? agentRoleLabel(selectedAgent.role) : "대기"}
        />
        <HeaderChip
          label="SOUL"
          onClick={() => onOpenAgentConfig("soul")}
          value={selectedAgent ? soulModeLabel(selectedAgent.soulMode) : "off"}
        />
        <HeaderChip
          label="창의성"
          onClick={() => onOpenAgentConfig("creativity")}
          value={persona ? creativityLevelLabel(persona.creativityLevel) : "균형"}
        />
        <HeaderChip
          label="기억"
          onClick={() => onOpenAgentConfig("injection")}
          value={memoryMode}
        />
        <HeaderChip
          label="맥락"
          onClick={cycleContextPackTier}
          title="맥락 묶음: Lite → Standard → Full"
          value={contextPackTierLabel(contextPackTier)}
        />
        <Button
          aria-label="에이전트 설정"
          className="h-8 w-8"
          onClick={() => onOpenAgentConfig("edit")}
          size="icon"
          variant="ghost"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function ToolBadgeStrip({
  profile,
  role,
}: {
  profile: ReturnType<typeof getAgentToolProfile>;
  role: WorkbenchAgent["role"];
}) {
  const badgeLabels = getAgentToolBadgeLabels(role);
  return (
    <div
      aria-label={`${profile.label} 읽기 전용 참고 기능`}
      className="hidden max-w-[320px] items-center gap-1.5 overflow-hidden lg:flex"
      title={`읽기 전용 참고: ${profile.label} · ${badgeLabels.join(", ")}`}
    >
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
        잘하는 기능
      </span>
      {badgeLabels.slice(0, 3).map((tool) => (
        <span
          className="max-w-[92px] truncate rounded-full border border-border/80 bg-card/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          key={tool}
        >
          {tool}
        </span>
      ))}
    </div>
  );
}

function HeaderChip({
  label,
  value,
  onClick,
  title,
}: {
  label: string;
  value: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      className="flex flex-col items-end rounded-md px-2 py-1 text-[10px] transition-colors hover:bg-card/60"
      onClick={onClick}
      title={title}
      type="button"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </button>
  );
}
