import { useState } from "react";
import { loadPersona, type LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket, EventEnvelope, TerminalHostKind } from "@ai-orchestrator/protocol";
import { runAutonomousPersonaTask } from "../lib/autonomousRun";
import { createAutonomyRunEvents, type AutonomyRunEventContext } from "../lib/autonomyRunEvents";
import { projectAutonomyRunHistory } from "../lib/autonomyRunHistory";
import { rosterFromRegistry } from "../lib/autonomyRoster";
import { createAutonomyRunMemoryCandidate } from "../lib/autonomyRunMemory";
import type { DebateDecisionReadinessState } from "../lib/debateDecisionReadiness";
import { evaluateExecutionHandoffGate } from "../lib/executionHandoffGate";
import type { MemoryCuratorCandidate } from "../lib/memoryCuratorApproval";
import type { SummonRegistry } from "../lib/personaSummon";
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
import { personaAvatars, personaSprites } from "../lib/personaAvatarSource";
import { classifyExpression } from "../lib/expressionClassifier";
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
  decisionReadiness,
  onRunMemory,
  registry,
  onRegistryChange,
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
  /** debate decision readiness — gates/forces the handoff mode when provided */
  decisionReadiness?: DebateDecisionReadinessState;
  /** receives a long-term memory candidate summarizing a finished run */
  onRunMemory?: (candidate: MemoryCuratorCandidate) => void;
  /** persistent shared pane pool; when provided, runs allocate from and update it */
  registry?: SummonRegistry;
  onRegistryChange?: (registry: SummonRegistry) => void;
}) {
  const [form, setForm] = useState<AutonomyRunForm>(() =>
    seedPacket ? codingPacketToAutonomyForm(seedPacket) : DEFAULT_AUTONOMY_FORM,
  );
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<PersonaTaskOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AutonomyStepRow[]>([]);

  const gate =
    decisionReadiness !== undefined
      ? evaluateExecutionHandoffGate({ readiness: decisionReadiness, requestedMode: form.mode })
      : undefined;

  const baseRunnable = isRunnable(form);
  const runnable = gate && !gate.allowed ? { ok: false, reason: gate.reason } : baseRunnable;
  const notice = gate && gate.allowed && gate.modeDowngraded ? gate.reason : undefined;

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
    // The handoff gate may downgrade the mode (e.g. needs_review -> human).
    const effectiveForm = gate ? { ...form, mode: gate.effectiveMode } : form;
    try {
      const persona = await loadPersonaOrHeader(effectiveForm.personaName.trim());
      const input = buildAutonomyRunInput(effectiveForm, {
        sessionId,
        persona,
        ctx: {
          now: startedAt,
          makeSessionId: (personaName, paneId) => `as_${personaName}_${paneId}_${stamp}`,
        },
        server: { serverBaseUrl, host, tmuxSessionName },
        runId,
        registry,
        onStep: (result) => {
          const row = stepRowFromReduce(result, collected.length + 1);
          collected.push(row);
          setSteps((current) => [...current, row]);
        },
      });
      const result = await runAutonomousPersonaTask(input);
      setOutcome(result);
      if (onRegistryChange && result.ok) {
        onRegistryChange(result.registry);
      }
      if (onRunEvents) {
        const ctx: AutonomyRunEventContext = {
          sessionId,
          runId,
          personaName: effectiveForm.personaName.trim(),
          role: effectiveForm.role,
          mode: effectiveForm.mode,
          goal: effectiveForm.goal.trim(),
          now: startedAt,
        };
        onRunEvents(createAutonomyRunEvents(ctx, collected, result));
      }
      if (onRunMemory && result.ok) {
        onRunMemory(
          createAutonomyRunMemoryCandidate({
            runId,
            sessionId,
            personaName: effectiveForm.personaName.trim(),
            role: effectiveForm.role,
            goal: effectiveForm.goal.trim(),
            loopStatus: result.loopStatus,
            stepCount: collected.length,
            createdAt: startedAt,
          }),
        );
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
      expression={classifyExpression({
        outcome: running ? steps[steps.length - 1]?.outcome : undefined,
        loopStatus: outcome?.ok ? outcome.loopStatus : undefined,
        running,
      })}
      notice={notice}
      personaAvatars={personaAvatars}
      personaSprites={personaSprites}
      roster={registry ? rosterFromRegistry(registry) : undefined}
      onLoadFromPacket={seedPacket ? () => setForm(codingPacketToAutonomyForm(seedPacket)) : undefined}
      outcome={outcome}
      personaOptions={bundledPersonaNames}
      runnable={runnable}
      running={running}
      steps={steps}
    />
  );
}
