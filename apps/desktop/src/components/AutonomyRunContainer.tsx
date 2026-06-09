import { useState } from "react";
import { loadPersona, type LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket, EventEnvelope, TerminalHostKind } from "@ai-orchestrator/protocol";
import { runAutonomousPersonaTask } from "../lib/autonomousRun";
import { createAutonomyRunEvents, type AutonomyRunEventContext } from "../lib/autonomyRunEvents";
import { projectAutonomyRunHistory } from "../lib/autonomyRunHistory";
import {
  buildAutonomyRunInput,
  DEFAULT_AUTONOMY_FORM,
  headerOnlyPersona,
  isRunnable,
  type AutonomyRunForm,
} from "../lib/autonomyRunForm";
import { codingPacketToAutonomyForm } from "../lib/codingPacketToAutonomyForm";
import { stepRowFromReduce, type AutonomyStepRow } from "../lib/autonomyTimeline";
import { bundledPersonaNames, personaFileSource } from "../lib/personaBundleSource";
import type { PersonaTaskOutcome } from "../lib/personaTaskRunner";
import { AutonomyRunPanel } from "./AutonomyRunPanel";

async function loadPersonaOrHeader(personaName: string): Promise<LoadedPersona> {
  try {
    return await loadPersona(personaName, "soul_plus_agents", personaFileSource);
  } catch {
    // Persona has no bundled SOUL.md/AGENTS.md — fall back to a header-only identity.
    return headerOnlyPersona(personaName);
  }
}

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
  seedPacket,
  onRunEvents,
  historyEvents,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  host?: TerminalHostKind;
  tmuxSessionName?: string;
  /** prefill the form from a CodingPacket (e.g. the current debate/conversation packet) */
  seedPacket?: CodingPacket;
  /** receives the audit/replay event envelopes for a finished run */
  onRunEvents?: (events: EventEnvelope[]) => void;
  /** event log to project past autonomy runs from (for the history view) */
  historyEvents?: ReadonlyArray<EventEnvelope>;
}) {
  const [form, setForm] = useState<AutonomyRunForm>(() =>
    seedPacket ? codingPacketToAutonomyForm(seedPacket) : DEFAULT_AUTONOMY_FORM,
  );
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<PersonaTaskOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AutonomyStepRow[]>([]);

  const runnable = isRunnable(form);

  const onRun = async () => {
    if (running || !runnable.ok) {
      return;
    }
    setRunning(true);
    setError(null);
    setOutcome(null);
    setSteps([]);
    const collected: AutonomyStepRow[] = [];
    const stamp = Date.now();
    const runId = `desktop_${stamp}`;
    const startedAt = new Date().toISOString();
    try {
      const persona = await loadPersonaOrHeader(form.personaName.trim());
      const input = buildAutonomyRunInput(form, {
        sessionId,
        persona,
        ctx: {
          now: startedAt,
          makeSessionId: (personaName, paneId) => `as_${personaName}_${paneId}_${stamp}`,
        },
        server: { serverBaseUrl, host, tmuxSessionName },
        runId,
        onStep: (result) => {
          const row = stepRowFromReduce(result, collected.length + 1);
          collected.push(row);
          setSteps((current) => [...current, row]);
        },
      });
      const result = await runAutonomousPersonaTask(input);
      setOutcome(result);
      if (onRunEvents) {
        const ctx: AutonomyRunEventContext = {
          sessionId,
          runId,
          personaName: form.personaName.trim(),
          role: form.role,
          mode: form.mode,
          goal: form.goal.trim(),
          now: startedAt,
        };
        onRunEvents(createAutonomyRunEvents(ctx, collected, result));
      }
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
      history={historyEvents ? projectAutonomyRunHistory(historyEvents) : undefined}
      onLoadFromPacket={seedPacket ? () => setForm(codingPacketToAutonomyForm(seedPacket)) : undefined}
      outcome={outcome}
      personaOptions={bundledPersonaNames}
      runnable={runnable}
      running={running}
      steps={steps}
    />
  );
}
