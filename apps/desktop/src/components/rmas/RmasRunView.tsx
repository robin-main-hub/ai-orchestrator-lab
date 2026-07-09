import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import type { ModelCatalog } from "../../types";
import { Button } from "../../ui/button";
import { RmasAgentRail } from "./RmasAgentRail";
import { RmasControlBar } from "./RmasControlBar";
import { RmasLogFeed } from "./RmasLogFeed";
import { RmasSettingsDialog } from "./RmasSettingsDialog";
import { useRmasRun } from "./useRmasRun";
import {
  buildRunConfig,
  formatElapsed,
  loadRmasSettings,
  PATTERN_LABEL,
  RMAS_PATTERNS,
  saveRmasSettings,
  type RmasSettings,
} from "./rmasViewModel";

/**
 * RecursiveMAS autonomous goal-loop dashboard ("목표 루프"). The desktop is a
 * viewer over a server-side loop: it starts runs, reattaches to the newest
 * running one on mount (survives app close), and renders the live trace +
 * status dots + token counters. Pattern tabs / elapsed timer / 설정 up top;
 * agent rail left; live feed center; goal input + 실행/중지 bottom.
 */
export function RmasRunView({
  providerProfiles,
  modelCatalog,
  serverBaseUrl,
  onContextEvent,
}: {
  providerProfiles: ProviderProfile[];
  modelCatalog: ModelCatalog;
  serverBaseUrl: string;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [settings, setSettings] = useState<RmasSettings>(() => loadRmasSettings(providerProfiles));
  const [goal, setGoal] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { record, trace, elapsedMs, running, busy, reattaching, error, start, stop } = useRmasRun({ serverBaseUrl });

  // While running, the rail/top-bar reflect the live run's config; when idle,
  // they reflect the settings the next run would use.
  const liveConfig = running ? record?.config : undefined;
  const displayAgents = liveConfig?.agents ?? settings.agents;
  const displayPattern = liveConfig?.pattern ?? settings.pattern;
  const perAgentStatus = record?.perAgentStatus ?? {};
  const tokens = record?.tokens ?? { input: 0, output: 0, total: 0 };

  const enabledCount = settings.agents.filter((slot) => slot.enabled).length;
  const canRun = goal.trim().length > 0 && enabledCount > 0;

  const commitSettings = (next: RmasSettings) => {
    setSettings(next);
    saveRmasSettings(next);
  };

  const selectPattern = (pattern: RmasSettings["pattern"]) => {
    if (running) return;
    commitSettings({ ...settings, pattern });
  };

  const handleRun = () => {
    const trimmed = goal.trim();
    if (!trimmed || enabledCount === 0) return;
    // Send the full slot set (incl. disabled toggles preserved); the server loop
    // runs the enabled slots only. Validation needs ≥1 agent, guaranteed above.
    const config = buildRunConfig(settings, trimmed);
    onContextEvent?.("rmas.run.requested", { pattern: config.pattern, agents: enabledCount });
    void start(config);
  };

  const elapsedLabel = useMemo(() => formatElapsed(elapsedMs), [elapsedMs]);

  return (
    <div className="nav-center-page flex h-full min-h-0 flex-col" data-page="rmas">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border bg-card/40 px-3 py-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="패턴">
          {RMAS_PATTERNS.map((pattern) => {
            const active = displayPattern === pattern;
            return (
              <button
                key={pattern}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={running}
                onClick={() => selectPattern(pattern)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {PATTERN_LABEL[pattern]}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-foreground" aria-label="경과 시간">
            {elapsedLabel}
          </span>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            설정
          </Button>
        </div>
      </div>

      {reattaching ? (
        <div className="border-b border-border bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
          진행 중인 실행을 확인하는 중…
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </div>
      ) : null}

      {/* Body: rail + feed */}
      <div className="flex min-h-0 flex-1">
        <RmasAgentRail
          agents={displayAgents}
          perAgentStatus={perAgentStatus}
          providers={providerProfiles}
          tokens={tokens}
          pattern={displayPattern}
        />
        <RmasLogFeed trace={trace} record={record} />
      </div>

      {/* Bottom control bar */}
      <RmasControlBar
        goal={goal}
        onGoalChange={setGoal}
        onRun={handleRun}
        onStop={() => void stop()}
        running={running}
        busy={busy}
        canRun={canRun}
      />

      <RmasSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={commitSettings}
        providers={providerProfiles}
        modelCatalog={modelCatalog}
        serverBaseUrl={serverBaseUrl}
      />
    </div>
  );
}
