import { Bot, Star, Users } from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import type { AgentActivityStatus, WorkbenchAgent } from "../types";
import type { AgentRoleToolRuntimeAudit } from "../lib/agentRuntimeConfig";

/**
 * Read-only agent catalog (the `library.agents` shell surface).
 *
 * Presentational only. It renders agent read models already held in App state —
 * the `agents` roster (profile metadata), the per-agent runtime activity map, and
 * the sanitized capability/tool audit summary — passed via props. It never fetches,
 * never creates / deletes / edits / activates / assigns / dispatches an agent, and
 * shows no system-prompt / SOUL / AGENTS / identity body, no credential or secret
 * reference values, and no hidden provider URL or path. The `AgentProfile` schema
 * carries only metadata (name, role, kind, enabled, soul/config mode, binding
 * presence), so only sanitized labels reach the screen. Honest empty state when
 * there are no agents; missing optional status is shown as such, never fabricated.
 */
function enabledVariant(enabled: boolean): StatusBadgeVariant {
  return enabled ? "success" : "muted";
}

function kindVariant(kind: WorkbenchAgent["kind"]): StatusBadgeVariant {
  return kind === "real" ? "success" : "muted";
}

function activityVariant(status: AgentActivityStatus): StatusBadgeVariant {
  if (status === "error") return "danger";
  if (status === "idle") return "muted";
  if (status === "waiting_approval") return "warning";
  return "success";
}

export function ReadOnlyAgentCatalogPanel({
  agents,
  activityById,
  capabilityAudit,
}: {
  agents: WorkbenchAgent[];
  activityById: Record<string, AgentActivityStatus>;
  capabilityAudit: AgentRoleToolRuntimeAudit;
}) {
  const enabledCount = agents.filter((agent) => agent.enabled).length;
  const realCount = agents.filter((agent) => agent.kind === "real").length;
  const sorted = [...agents].sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) ||
      Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-3" aria-label="에이전트 카탈로그">
      {/* roster summary — read-only counts + sanitized capability audit */}
      <div className="rounded-lg border border-border bg-card/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <strong className="text-sm text-foreground">에이전트 로스터</strong>
          <StatusBadge variant="muted">전체 {agents.length}명</StatusBadge>
          <StatusBadge variant="success">사용 {enabledCount}명</StatusBadge>
          <StatusBadge variant="muted">실에이전트 {realCount}명</StatusBadge>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>도구 계약 {capabilityAudit.coveredCount}/{capabilityAudit.totalAgents}</span>
          <span>{capabilityAudit.summary}</span>
        </div>
      </div>

      {/* agent catalog — profile metadata + runtime status only, no body, no controls */}
      {agents.length === 0 ? (
        <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          등록된 에이전트가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sorted.map((agent) => {
            const activity = activityById[agent.id];
            return (
              <li className="rounded-md border border-border/60 bg-card/30 px-2 py-1.5" key={agent.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Bot className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground">{agent.name}</span>
                  {agent.isDefault ? <Star className="h-3 w-3 text-primary" /> : null}
                  <StatusBadge variant={kindVariant(agent.kind)}>{agent.kind}</StatusBadge>
                  <StatusBadge variant="muted">{agent.role}</StatusBadge>
                  <StatusBadge variant={enabledVariant(agent.enabled)}>
                    {agent.enabled ? "사용" : "비활성"}
                  </StatusBadge>
                  {activity ? (
                    <StatusBadge variant={activityVariant(activity)}>{activity}</StatusBadge>
                  ) : (
                    <StatusBadge variant="muted">상태 없음</StatusBadge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                  <span>소울 {agent.soulMode}</span>
                  <span>· 설정 {agent.configSource}</span>
                  {agent.authBinding ? (
                    <span>· 바인딩 {agent.authBinding.mode}</span>
                  ) : agent.providerProfileId ? (
                    <span>· 공급자 바인딩됨</span>
                  ) : null}
                  {agent.modelId ? <span>· 모델 바인딩됨</span> : null}
                  {agent.permissionLevel ? <span>· 권한 {agent.permissionLevel}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
