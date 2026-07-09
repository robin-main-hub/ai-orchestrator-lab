import { useEffect, useRef, useState } from "react";
import type { ProviderProfile, RmasAgentLiveStatus, RmasAgentSlotConfig, RmasPattern } from "@ai-orchestrator/protocol";
import { agentDotMeta, formatTokenCount, PATTERN_DESCRIPTION } from "./rmasViewModel";

/**
 * Left rail: one card per configured agent slot with a live status dot
 * (idle/thinking/done/error from `perAgentStatus`), the slot name, and a
 * provider badge. Below the cards: live token counters (입력/출력/총, mono,
 * count-up on change) and the one-line pattern description.
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
    <aside className="rmas__rail" aria-label="에이전트 목록">
      <div className="rmas__rail-agents">
        {enabledAgents.length === 0 ? (
          <p className="rmas__rail-empty">활성화된 에이전트가 없습니다. 설정에서 추가하세요.</p>
        ) : (
          enabledAgents.map((agent) => {
            const dot = agentDotMeta(perAgentStatus[agent.id]);
            return (
              <div key={agent.id} className="rmas-agent" data-slot-id={agent.id} data-status={dot.tone}>
                <span className="rmas-dot" data-tone={dot.tone} aria-hidden />
                <div className="min-w-0">
                  <div className="rmas-agent__name">{agent.name}</div>
                  <div className="rmas-agent__state">{dot.label}</div>
                </div>
                <span className="rmas-agent__provider" title={providerLabel(agent.providerProfileId)}>
                  {providerLabel(agent.providerProfileId)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="rmas__rail-foot">
        <dl className="rmas__tokens">
          <TokenStat label="입력" value={tokens.input} />
          <TokenStat label="출력" value={tokens.output} />
          <TokenStat label="총" value={tokens.total} />
        </dl>
        <p className="rmas__pattern-desc">{PATTERN_DESCRIPTION[pattern]}</p>
      </div>
    </aside>
  );
}

function TokenStat({ label, value }: { label: string; value: number }) {
  const display = useCountUp(value);
  return (
    <div className="rmas__token">
      <dt>{label} 토큰</dt>
      <dd className="rmas-mono">{formatTokenCount(display)}</dd>
    </div>
  );
}

/**
 * Animates the displayed number toward `value` over ~420ms (cubic ease-out) so
 * token counters visibly tick up as the run streams. Honors reduced-motion (and
 * SSR / no-rAF environments) by snapping straight to the target.
 */
function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    fromRef.current = to;
    if (from === to) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof requestAnimationFrame !== "function") {
      setDisplay(to);
      return;
    }

    const duration = 420;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return display;
}
