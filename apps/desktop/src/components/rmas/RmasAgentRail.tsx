import type { ProviderProfile, RmasAgentLiveStatus, RmasAgentSlotConfig, RmasPattern } from "@ai-orchestrator/protocol";
import { Badge } from "../../ui/badge";
import { agentDotMeta, formatTokenCount, PATTERN_DESCRIPTION } from "./rmasViewModel";

/**
 * Left rail: one card per configured agent slot with a live status dot
 * (idle/thinking/done/error from `perAgentStatus`), the slot name, and a
 * provider badge. Below the cards: live token counters and the one-line
 * pattern description.
 */
export function RmasAgentRail({
  agents,
  perAgentStatus,
  providers,
  tokens,
  pattern,
}: {
  agents: RmasAgentSlotConfig[];
  perAgentStatus: Record<string, RmasAgentLiveStatus>;
  providers: ReadonlyArray<ProviderProfile>;
  tokens: { input: number; output: number; total: number };
  pattern: RmasPattern;
}) {
  const providerLabel = (providerProfileId: string): string => {
    const profile = providers.find((candidate) => candidate.id === providerProfileId);
    return profile?.kind ?? profile?.name ?? providerProfileId;
  };

  const enabledAgents = agents.filter((agent) => agent.enabled);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-3 border-r border-border bg-card/40 p-3" aria-label="에이전트 목록">
      <div className="flex flex-col gap-2 overflow-y-auto">
        {enabledAgents.length === 0 ? (
          <p className="px-1 py-4 text-xs text-muted-foreground">활성화된 에이전트가 없습니다. 설정에서 추가하세요.</p>
        ) : (
          enabledAgents.map((agent) => {
            const dot = agentDotMeta(perAgentStatus[agent.id]);
            return (
              <div
                key={agent.id}
                className="flex items-center gap-2.5 rounded-md border border-border bg-background/60 px-3 py-2"
                data-slot-id={agent.id}
                data-status={dot.tone}
              >
                <span className={dot.className} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{agent.name}</div>
                  <div className="text-[11px] text-muted-foreground">{dot.label}</div>
                </div>
                <Badge variant="secondary" className="max-w-[6.5rem] truncate" title={providerLabel(agent.providerProfileId)}>
                  {providerLabel(agent.providerProfileId)}
                </Badge>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <TokenStat label="입력 토큰" value={tokens.input} />
          <TokenStat label="출력 토큰" value={tokens.output} />
          <TokenStat label="총 토큰" value={tokens.total} />
        </dl>
        <p className="rounded-md bg-muted/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          {PATTERN_DESCRIPTION[pattern]}
        </p>
      </div>
    </aside>
  );
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-1.5 py-1.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="text-xs font-semibold tabular-nums text-foreground">{formatTokenCount(value)}</dd>
    </div>
  );
}
