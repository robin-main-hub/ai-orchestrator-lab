import { Settings, ChevronDown, Volume2, VolumeX } from "lucide-react";
import type {
  ContextPackTier,
  ModelDescriptor,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import { Button } from "@/ui/button";
import type {
  WorkbenchAgent,
  AgentConfigTab,
  AgentPersonaSettings,
  AgentVisualSettings,
  AgentActivityStatus,
} from "../../types";
import { agentRoleLabel, providerDisplayLabel } from "../../lib/helpers";
import {
  creativityLevelLabel,
  soulModeLabel,
  contextPackTierLabel,
} from "../../lib/uiLabels";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/ui/dropdown-menu";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { StatusBadge } from "@/ui/status-badge";

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
  agentVisualsById,
  agentActivityById,
  isMuted,
  onToggleMute,
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
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
  isMuted?: boolean;
  onToggleMute?: () => void;
}) {
  const cycleContextPackTier = () => {
    const order: ContextPackTier[] = ["lite", "standard", "full"];
    const currentIndex = order.indexOf(contextPackTier);
    const nextTier = order[(currentIndex + 1) % order.length] ?? "standard";
    onContextPackTierChange(nextTier);
  };

  const core: WorkbenchAgent[] = [];
  const specialists: WorkbenchAgent[] = [];
  const companions: WorkbenchAgent[] = [];

  agents.forEach((agent) => {
    const cat = roleToCategory(agent.role);
    if (cat === "core") core.push(agent);
    else if (cat === "companion") companions.push(agent);
    else specialists.push(agent);
  });

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/30 px-4">
      {/* Left: Agent selector */}
      <div className="flex min-w-0 items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="현재 대화 봇 선택"
              className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/30 focus-visible:border-primary focus-visible:outline-none"
            >
              {selectedAgent ? (
                <>
                  <AvatarWithStatus
                    initials={selectedAgent.name.slice(0, 2).toUpperCase()}
                    roleColor={roleColorFromRole(selectedAgent.role)}
                    status={(() => {
                      const activity = agentActivityById?.[selectedAgent.id];
                      return activity === "responding"
                        ? "active"
                        : activity === "preparing"
                          ? "pending"
                          : activity === "idle"
                            ? "idle"
                            : "online";
                    })()}
                    avatarDataUrl={agentVisualsById?.[selectedAgent.id]?.avatarDataUrl}
                    isPrimary={selectedAgent.role === "orchestrator"}
                    size="sm"
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {selectedAgent.name}
                      </span>
                      {selectedAgent.role === "orchestrator" && (
                        <StatusBadge variant="orchestrator" size="sm">Primary</StatusBadge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {agentRoleLabel(selectedAgent.role)} · {selectedModel?.id ?? selectedAgent.modelId ?? "model pending"}
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">봇 선택 필요</span>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto bg-popover border border-border p-1.5 shadow-lg rounded-lg z-50">
            {/* Core Agents */}
            {core.length > 0 && (
              <>
                <div className="px-2 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Core Agents
                  </span>
                </div>
                {core.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 cursor-pointer transition-colors focus:bg-accent focus:text-accent-foreground outline-none",
                      agent.id === selectedAgentId && "bg-primary/10"
                    )}
                  >
                    <AvatarWithStatus
                      initials={agent.name.slice(0, 2).toUpperCase()}
                      roleColor={roleColorFromRole(agent.role)}
                      status={(() => {
                        const activity = agentActivityById?.[agent.id];
                        return activity === "responding"
                          ? "active"
                          : activity === "preparing"
                            ? "pending"
                            : activity === "idle"
                              ? "idle"
                              : "online";
                      })()}
                      avatarDataUrl={agentVisualsById?.[agent.id]?.avatarDataUrl}
                      isPrimary={agent.role === "orchestrator"}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {agent.name}
                        </span>
                        <StatusBadge variant={roleColorFromRole(agent.role)} size="sm">
                          {agentRoleLabel(agent.role)}
                        </StatusBadge>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {agent.modelId ?? "model pending"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            {/* Specialists */}
            {specialists.length > 0 && (
              <>
                <DropdownMenuSeparator className="bg-border -mx-1 my-1.5 h-px" />
                <div className="px-2 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Specialists
                  </span>
                </div>
                {specialists.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 cursor-pointer transition-colors focus:bg-accent focus:text-accent-foreground outline-none",
                      agent.id === selectedAgentId && "bg-primary/10"
                    )}
                  >
                    <AvatarWithStatus
                      initials={agent.name.slice(0, 2).toUpperCase()}
                      roleColor={roleColorFromRole(agent.role)}
                      status={(() => {
                        const activity = agentActivityById?.[agent.id];
                        return activity === "responding"
                          ? "active"
                          : activity === "preparing"
                            ? "pending"
                            : activity === "idle"
                              ? "idle"
                              : "online";
                      })()}
                      avatarDataUrl={agentVisualsById?.[agent.id]?.avatarDataUrl}
                      isPrimary={agent.role === "orchestrator"}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {agent.name}
                        </span>
                        <StatusBadge variant={roleColorFromRole(agent.role)} size="sm">
                          {agentRoleLabel(agent.role)}
                        </StatusBadge>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {agent.modelId ?? "model pending"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            {/* Companions */}
            {companions.length > 0 && (
              <>
                <DropdownMenuSeparator className="bg-border -mx-1 my-1.5 h-px" />
                <div className="px-2 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Companions
                  </span>
                </div>
                {companions.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 cursor-pointer transition-colors focus:bg-accent focus:text-accent-foreground outline-none",
                      agent.id === selectedAgentId && "bg-primary/10"
                    )}
                  >
                    <AvatarWithStatus
                      initials={agent.name.slice(0, 2).toUpperCase()}
                      roleColor={roleColorFromRole(agent.role)}
                      status={(() => {
                        const activity = agentActivityById?.[agent.id];
                        return activity === "responding"
                          ? "active"
                          : activity === "preparing"
                            ? "pending"
                            : activity === "idle"
                              ? "idle"
                              : "online";
                      })()}
                      avatarDataUrl={agentVisualsById?.[agent.id]?.avatarDataUrl}
                      isPrimary={agent.role === "orchestrator"}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {agent.name}
                        </span>
                        <StatusBadge variant={roleColorFromRole(agent.role)} size="sm">
                          {agentRoleLabel(agent.role)}
                        </StatusBadge>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {agent.modelId ?? "model pending"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] text-muted-foreground">현재 대화 상대</span>
          <span className="truncate text-xs font-medium text-foreground">
            {selectedAgent?.name ?? "봇 선택 필요"} ·{" "}
            {selectedProvider ? providerDisplayLabel(selectedProvider.name) : "provider pending"}
          </span>
        </div>
      </div>

      {/* Center: session id */}
      <div className="hidden flex-col items-center md:flex">
        <span className="text-[10px] text-muted-foreground">session</span>
        <span className="text-xs font-medium text-foreground">
          {sessionId.slice(-12)}
        </span>
      </div>

      {/* Right: Profile / Memory / Context / Preview chips */}
      <div className="flex items-center gap-2">
        <HeaderChip
          label="Profile"
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
          label="Memory"
          onClick={() => onOpenAgentConfig("injection")}
          value={memoryMode}
        />
        <HeaderChip
          label="Context"
          onClick={cycleContextPackTier}
          title="ContextPack: Lite → Standard → Full"
          value={contextPackTierLabel(contextPackTier)}
        />
        {onToggleMute && (
          <Button
            aria-label={isMuted ? "음소거 해제" : "음소거"}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleMute}
            size="icon"
            variant="ghost"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        )}
        <Button
          aria-label="agent settings"
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
