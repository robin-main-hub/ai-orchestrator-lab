import { useState } from "react";
import type { TerminalHostKind } from "@ai-orchestrator/protocol";
import { runAutonomousPersonaTask } from "../lib/autonomousRun";
import {
  buildAutonomyRunInput,
  DEFAULT_AUTONOMY_FORM,
  isRunnable,
  type AutonomyRunForm,
} from "../lib/autonomyRunForm";
import type { PersonaTaskOutcome } from "../lib/personaTaskRunner";
import { AutonomyRunPanel } from "./AutonomyRunPanel";

/**
 * Stateful container that owns the Autonomy Run form and the run lifecycle, and
 * delegates rendering to the (tested) presentational panel. Kept thin: all the
 * input-assembly logic lives in `autonomyRunForm`, so this is just React glue.
 */
export function AutonomyRunContainer({
  sessionId = "session_desktop_001",
  serverBaseUrl,
  host = "dgx_02",
  tmuxSessionName = "ai-swarm",
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  host?: TerminalHostKind;
  tmuxSessionName?: string;
}) {
  const [form, setForm] = useState<AutonomyRunForm>(DEFAULT_AUTONOMY_FORM);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<PersonaTaskOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runnable = isRunnable(form);

  const onRun = async () => {
    if (running || !runnable.ok) {
      return;
    }
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      const stamp = Date.now();
      const input = buildAutonomyRunInput(form, {
        sessionId,
        ctx: {
          now: new Date().toISOString(),
          makeSessionId: (persona, paneId) => `as_${persona}_${paneId}_${stamp}`,
        },
        server: { serverBaseUrl, host, tmuxSessionName },
        runId: `desktop_${stamp}`,
      });
      setOutcome(await runAutonomousPersonaTask(input));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  };

  return (
    <AutonomyRunPanel
      error={error}
      form={form}
      onFieldChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      onRun={onRun}
      outcome={outcome}
      runnable={runnable}
      running={running}
    />
  );
}
