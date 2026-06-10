import { useState } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { loadPersona, type LoadedPersona } from "@ai-orchestrator/agents";
import type { TerminalHostKind, TmuxPaneRole } from "@ai-orchestrator/protocol";
import { runParallelAutonomy } from "../lib/parallelAutonomy";
import type { AutonomyMode } from "../lib/autonomousRun";
import { SELECTABLE_PANE_ROLES, headerOnlyPersona, modeLabel } from "../lib/autonomyRunForm";
import { stepRowFromReduce } from "../lib/autonomyTimeline";
import { personaFileSource, bundledPersonaNames } from "../lib/personaBundleSource";
import { createSummonRegistry } from "../lib/personaSummon";
import {
  applyMissionResults,
  applyMissionStep,
  applyMissionUpdate,
  areDraftsRunnable,
  buildMissionSpecs,
  createParallelBoard,
  emptyDraft,
  type ParallelBoard,
  type ParallelMissionDraft,
} from "../lib/parallelMissionBoard";
import { ParallelMissionBoard } from "./ParallelMissionBoard";

const MODES: AutonomyMode[] = ["human", "auto_safe"];

async function loadPersonaOrHeader(personaName: string): Promise<LoadedPersona> {
  try {
    return await loadPersona(personaName, "soul_plus_agents", personaFileSource);
  } catch {
    return headerOnlyPersona(personaName);
  }
}

/**
 * Manus/Kimi-style parallel execution console. The user queues N persona
 * missions; pressing 병렬 실행 allocates each a distinct pane and drives all of
 * their closed loops concurrently, streaming each mission's step feed into its
 * own terminal card. Thin React glue over the tested engine
 * (`runParallelAutonomy`) and board reducer (`parallelMissionBoard`).
 */
export function ParallelMissionContainer({
  sessionId = "session_desktop_parallel",
  serverBaseUrl,
  host = "dgx_02",
  tmuxSessionName = "ai-swarm",
  maxConcurrency = 4,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  host?: TerminalHostKind;
  tmuxSessionName?: string;
  maxConcurrency?: number;
}) {
  const [drafts, setDrafts] = useState<ParallelMissionDraft[]>(() => [emptyDraft("code"), emptyDraft("qa")]);
  const [mode, setMode] = useState<AutonomyMode>("human");
  const [running, setRunning] = useState(false);
  const [board, setBoard] = useState<ParallelBoard>({ cards: [] });
  const [error, setError] = useState<string | null>(null);

  const verdict = areDraftsRunnable(drafts);

  const patchDraft = (id: string, patch: Partial<ParallelMissionDraft>) =>
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  const addDraft = () => setDrafts((current) => [...current, emptyDraft("code")]);
  const removeDraft = (id: string) => setDrafts((current) => current.filter((draft) => draft.id !== id));

  const onRun = async () => {
    if (running || !verdict.ok) return;
    setRunning(true);
    setError(null);
    setBoard(createParallelBoard(drafts));
    const stamp = drafts.map((d) => d.id).join("-");
    try {
      // Pre-load every persona so the spec builder can hand a sync map to the engine.
      const personaByName = new Map<string, LoadedPersona>();
      await Promise.all(
        drafts.map(async (draft) => {
          const name = draft.personaName.trim();
          if (name && !personaByName.has(name)) personaByName.set(name, await loadPersonaOrHeader(name));
        }),
      );

      const specs = buildMissionSpecs(drafts, {
        sessionId,
        personaFor: (name) => personaByName.get(name) ?? headerOnlyPersona(name),
      });

      // One pane per mission (matching its role) so every queued mission can be
      // allocated; the engine still rejects gracefully if capacity runs short.
      const panes = drafts.map((draft, index) => ({ paneId: `%par${index}`, role: draft.role as TmuxPaneRole }));
      const registry = createSummonRegistry(panes);

      const { results } = await runParallelAutonomy({
        registry,
        missions: specs,
        ctx: {
          now: new Date().toISOString(),
          makeSessionId: (personaName, paneId) => `as_${personaName}_${paneId}_${stamp}`,
        },
        mode,
        server: { serverBaseUrl, host, tmuxSessionName },
        maxConcurrency,
        runId: `parallel_${stamp}`,
        onMissionUpdate: (update) => setBoard((current) => applyMissionUpdate(current, update)),
        onMissionStep: (missionId, step) =>
          setBoard((current) => {
            const card = current.cards.find((c) => c.id === missionId);
            return applyMissionStep(current, missionId, stepRowFromReduce(step, (card?.steps.length ?? 0) + 1));
          }),
      });
      setBoard((current) => applyMissionResults(current, results));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="parallel-console">
      <header className="parallel-console__head">
        <div>
          <h2 className="parallel-console__title">병렬 실행 콘솔</h2>
          <p className="parallel-console__subtitle">
            여러 에이전트를 각자의 터미널(pane)에서 동시에 가동합니다. 모든 명령은 동일한 승인·권한 게이트를 통과합니다.
          </p>
        </div>
        <div className="parallel-console__controls">
          <label className="parallel-console__mode">
            모드
            <select value={mode} onChange={(event) => setMode(event.target.value as AutonomyMode)} disabled={running}>
              {MODES.map((value) => (
                <option key={value} value={value}>
                  {modeLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="parallel-console__run" onClick={onRun} disabled={running || !verdict.ok}>
            <Play size={14} aria-hidden />
            {running ? "실행 중…" : "병렬 실행"}
          </button>
        </div>
      </header>

      {!verdict.ok && !running ? <p className="parallel-console__hint">{verdict.reason}</p> : null}
      {error ? <p className="parallel-console__error">⚠ {error}</p> : null}

      <div className="parallel-console__drafts">
        {drafts.map((draft, index) => (
          <div key={draft.id} className="parallel-draft">
            <div className="parallel-draft__row">
              <input
                className="parallel-draft__persona"
                list="parallel-persona-options"
                placeholder="페르소나 (예: kurumi)"
                value={draft.personaName}
                onChange={(event) => patchDraft(draft.id, { personaName: event.target.value })}
                disabled={running}
              />
              <select
                className="parallel-draft__role"
                value={draft.role}
                onChange={(event) => patchDraft(draft.id, { role: event.target.value as TmuxPaneRole })}
                disabled={running}
              >
                {SELECTABLE_PANE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="parallel-draft__remove"
                onClick={() => removeDraft(draft.id)}
                disabled={running || drafts.length <= 1}
                aria-label={`미션 ${index + 1} 제거`}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
            <input
              className="parallel-draft__goal"
              placeholder="목표 (goal)"
              value={draft.goal}
              onChange={(event) => patchDraft(draft.id, { goal: event.target.value })}
              disabled={running}
            />
            <textarea
              className="parallel-draft__steps"
              placeholder="검증 단계 (줄바꿈으로 구분)&#10;예: pnpm test&#10;pnpm build"
              value={draft.verificationStepsText}
              onChange={(event) => patchDraft(draft.id, { verificationStepsText: event.target.value })}
              disabled={running}
              rows={2}
            />
          </div>
        ))}
        <datalist id="parallel-persona-options">
          {bundledPersonaNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button type="button" className="parallel-console__add" onClick={addDraft} disabled={running}>
          <Plus size={14} aria-hidden />
          미션 추가
        </button>
      </div>

      <ParallelMissionBoard board={board} />
    </div>
  );
}
