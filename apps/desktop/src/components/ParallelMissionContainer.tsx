import { useRef, useState } from "react";
import { Megaphone, Play, Plus, Trash2, X } from "lucide-react";
import { buildLorebookFragment, loadPersona, scanLorebooks, type LoadedPersona } from "@ai-orchestrator/agents";
import type { TerminalHostKind, TmuxPaneRole } from "@ai-orchestrator/protocol";
import {
  broadcastToMissions,
  createCheckInTargets,
  runParallelAutonomy,
  type LiveMissionTarget,
  type MissionRuntimeBinding,
} from "../lib/parallelAutonomy";
import type { AutonomyMode } from "../lib/autonomousRun";
import { SELECTABLE_PANE_ROLES, headerOnlyPersona, modeLabel } from "../lib/autonomyRunForm";
import { stepRowFromReduce } from "../lib/autonomyTimeline";
import { createCheckInState, runCheckInSweep, startCheckInLoop, type CheckInState } from "../lib/missionCheckIn";
import { bundledLorebooks, bundledLorebookTenants } from "../lib/lorebookSource";
import { personaFileSource, bundledPersonaNames } from "../lib/personaBundleSource";
import { DEFAULT_HERMES_RESET_COMMAND, resolvePersonaAgentSet, type PersonaAgentSet } from "../lib/personaAgentSet";
import { acquireHermesSlot, summarizeHermesPool } from "../lib/hermesSlotPool";
import { loadHermesPool, saveHermesPool } from "../lib/hermesPoolStore";
import { createSummonRegistry } from "../lib/personaSummon";
import { buildWorkspacePlan, workspaceSafePrefixes } from "../lib/missionWorkspace";
import {
  applyMissionBranch,
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
import {
  VERIFICATION_PRESETS,
  addCustom,
  customCommands,
  isPresetActive,
  removeCommand,
  togglePreset,
} from "../lib/autonomyVerificationChips";

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
  seedPersonaName,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  host?: TerminalHostKind;
  tmuxSessionName?: string;
  maxConcurrency?: number;
  /** 도감 소환: 첫 미션 드래프트에 이 페르소나를 프리필 */
  seedPersonaName?: string;
}) {
  const [drafts, setDrafts] = useState<ParallelMissionDraft[]>(() => {
    if (!seedPersonaName) return [emptyDraft("code"), emptyDraft("qa")];
    const set = resolvePersonaAgentSet(seedPersonaName);
    const seeded = emptyDraft(set.preferredPaneRole ?? "code");
    return [{ ...seeded, personaName: seedPersonaName }, emptyDraft("qa")];
  });
  const [mode, setMode] = useState<AutonomyMode>("human");
  const [running, setRunning] = useState(false);
  // transient per-draft custom-command input text (keyed by draft id) — never
  // part of any draft payload, so the mission field shape stays unchanged.
  const [pendingCustom, setPendingCustom] = useState<Record<string, string>>({});
  const [board, setBoard] = useState<ParallelBoard>({ cards: [] });
  const [error, setError] = useState<string | null>(null);
  // git worktree isolation (the OSS-orchestrator consensus primitive): when on,
  // every mission gets its own worktree + branch in the shared repo.
  const [isolate, setIsolate] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  // Tmux-Orchestrator-style self check-ins: every N minutes, sweep the running
  // missions and nudge the ones whose pane output stopped moving.
  const [checkInEnabled, setCheckInEnabled] = useState(true);
  const [checkInMinutes, setCheckInMinutes] = useState(5);
  const [checkInNote, setCheckInNote] = useState<string | null>(null);
  // Hermes slot pool: persona ↔ agent bindings are sticky; a reset is dispatched
  // only when a recycled slot changes hands. Spare exhausted -> provision one.
  const [hermesPool, setHermesPool] = useState(() => loadHermesPool());
  const [resetCommand, setResetCommand] = useState(DEFAULT_HERMES_RESET_COMMAND);
  // OPTIONAL lorebook/world-info: OFF by default; multi-tenant via tenant id.
  const [loreEnabled, setLoreEnabled] = useState(false);
  const [loreTenant, setLoreTenant] = useState("default");
  // NTM-style broadcast: one instruction to every live mission at once.
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastNote, setBroadcastNote] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  // Live run bindings (filled by onAllocations, pruned as missions finish) so
  // broadcast/check-in can reach the panes while runParallelAutonomy is in flight.
  const allocationsRef = useRef<ReadonlyArray<LiveMissionTarget>>([]);
  const doneIdsRef = useRef<Set<string>>(new Set());
  const checkInStateRef = useRef<CheckInState>(createCheckInState());
  const bindingRef = useRef<MissionRuntimeBinding | null>(null);

  const liveTargets = () => allocationsRef.current.filter((t) => !doneIdsRef.current.has(t.missionId));

  const verdict = areDraftsRunnable(drafts);

  const patchDraft = (id: string, patch: Partial<ParallelMissionDraft>) =>
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  const addDraft = () => setDrafts((current) => [...current, emptyDraft("code")]);
  const removeDraft = (id: string) => setDrafts((current) => current.filter((draft) => draft.id !== id));

  const onBroadcast = async () => {
    const message = broadcastText.trim();
    if (!message || broadcasting) return;
    const targets = liveTargets();
    if (targets.length === 0 || !bindingRef.current) {
      setBroadcastNote("실행 중인 미션이 없습니다.");
      return;
    }
    setBroadcasting(true);
    setBroadcastNote("전송 중…");
    try {
      const results = await broadcastToMissions({ targets, message, binding: bindingRef.current });
      const ok = results.filter((r) => r.ok).length;
      setBroadcastNote(`브로드캐스트 ${ok}/${results.length} 전송됨`);
      if (ok > 0) setBroadcastText("");
    } catch (caught) {
      setBroadcastNote(`브로드캐스트 실패: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBroadcasting(false);
    }
  };

  const onRun = async () => {
    if (running || !verdict.ok) return;
    setRunning(true);
    setError(null);
    setBroadcastNote(null);
    setCheckInNote(null);
    allocationsRef.current = [];
    doneIdsRef.current = new Set();
    checkInStateRef.current = createCheckInState();
    const stamp = `${Date.now()}`;
    const workspaceConfig =
      isolate && repoPath.trim()
        ? { repoPath: repoPath.trim(), baseBranch: baseBranch.trim() || "main" }
        : undefined;
    const workspaceByMission = new Map(
      workspaceConfig
        ? drafts.map((draft) => [draft.id, buildWorkspacePlan(`par_${stamp}_${draft.id}`, workspaceConfig)] as const)
        : [],
    );
    let initialBoard = createParallelBoard(drafts);
    for (const [missionId, plan] of workspaceByMission) {
      initialBoard = applyMissionBranch(initialBoard, missionId, plan.branchName);
    }
    setBoard(initialBoard);

    // Acquire a sticky Hermes slot per mission (sequentially over the shared
    // pool): same persona -> her own agent; new persona -> spare; exhausted ->
    // provision exactly one new agent. Persisted so bindings survive restarts.
    let nextPool = loadHermesPool();
    const agentSetByMission = new Map<string, PersonaAgentSet>();
    for (const draft of drafts) {
      const personaName = draft.personaName.trim();
      const acquisition = acquireHermesSlot(nextPool, personaName);
      nextPool = acquisition.pool;
      agentSetByMission.set(
        draft.id,
        resolvePersonaAgentSet(personaName, {
          slotId: acquisition.slot.id,
          bootSteps: acquisition.requiresBoot ? [resetCommand.trim() || DEFAULT_HERMES_RESET_COMMAND] : [],
        }),
      );
    }
    saveHermesPool(nextPool);
    setHermesPool(nextPool);

    const server = { serverBaseUrl, host, tmuxSessionName };
    bindingRef.current = { mode, server, runId: `parallel_${stamp}` };

    let checkInLoop: { stop: () => void } | null = null;
    if (checkInEnabled) {
      checkInLoop = startCheckInLoop({
        intervalMs: Math.max(1, checkInMinutes) * 60_000,
        tick: async () => {
          const targets = liveTargets();
          if (targets.length === 0 || !bindingRef.current) return;
          const bound = createCheckInTargets({ targets, binding: bindingRef.current });
          const result = await runCheckInSweep({ targets: bound, state: checkInStateRef.current });
          checkInStateRef.current = result.state;
          const nudged = result.rows.filter((row) => row.nudged).length;
          setCheckInNote(`마지막 체크인: 대상 ${result.rows.length} · 무응답 nudge ${nudged}`);
        },
      });
    }

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
      }).map((spec) => {
        // optional world info: scan this mission's own text against the active tenant's books
        const draft = drafts.find((d) => d.id === spec.id);
        const worldInfo =
          loreEnabled && draft
            ? buildLorebookFragment(
                scanLorebooks(
                  bundledLorebooks,
                  `${draft.goal}\n${draft.verificationStepsText}\n${draft.kickoffTask ?? ""}`,
                  { tenantId: loreTenant.trim() || "default" },
                ),
              ) || undefined
            : undefined;
        return {
          ...spec,
          workspace: workspaceByMission.get(spec.id),
          // sticky Hermes slot per persona: soul + agents + role + agent move as one set
          agentSet: agentSetByMission.get(spec.id),
          worldInfo,
        };
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
        server,
        maxConcurrency,
        runId: `parallel_${stamp}`,
        // in auto_safe mode, repo-scoped `worktree add` may auto-approve; teardown never does
        extraSafePrefixes: workspaceConfig ? workspaceSafePrefixes(workspaceConfig) : undefined,
        onAllocations: (allocations) => {
          allocationsRef.current = allocations;
        },
        onMissionUpdate: (update) => {
          if (update.phase === "done") doneIdsRef.current.add(update.missionId);
          setBoard((current) => applyMissionUpdate(current, update));
        },
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
      checkInLoop?.stop();
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

      <div className="parallel-workspace">
        <label className="parallel-workspace__toggle">
          <input
            type="checkbox"
            checked={isolate}
            onChange={(event) => setIsolate(event.target.checked)}
            disabled={running}
          />
          워크트리 격리 — 미션마다 전용 git worktree + 브랜치에서 작업 (같은 레포 동시 수정 가능)
        </label>
        {isolate ? (
          <div className="parallel-workspace__fields">
            <input
              className="parallel-workspace__repo"
              placeholder="레포 절대 경로 (실행 호스트 기준, 예: /home/robin/ai-orchestrator-lab)"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              disabled={running}
            />
            <input
              className="parallel-workspace__base"
              placeholder="베이스 브랜치"
              value={baseBranch}
              onChange={(event) => setBaseBranch(event.target.value)}
              disabled={running}
            />
          </div>
        ) : null}
        {isolate && !repoPath.trim() && !running ? (
          <p className="parallel-console__hint">레포 경로를 입력해야 워크트리 격리가 적용됩니다.</p>
        ) : null}
        <div className="parallel-workspace__toggle parallel-slots">
          <span className="parallel-slots__summary">
            Hermes 슬롯: 사용 {summarizeHermesPool(hermesPool).bound} · 여유 {summarizeHermesPool(hermesPool).spare}
            {" "}(총 {summarizeHermesPool(hermesPool).total})
          </span>
          — 페르소나마다 고정(스티키) 슬롯에 SOUL·AGENTS·역할이 한 세트로 주입. 여유 소진 시 1개씩 자동 증설, 슬롯 재활용 시에만 리셋:
          <input
            className="parallel-agentset__boot"
            value={resetCommand}
            onChange={(event) => setResetCommand(event.target.value)}
            disabled={running}
            aria-label="슬롯 재활용 리셋 명령"
            title="재활용된 슬롯에 다른 캐릭터가 들어올 때만 디스패치 (기본 /new)"
          />
        </div>
        <label className="parallel-workspace__toggle">
          <input
            type="checkbox"
            checked={checkInEnabled}
            onChange={(event) => setCheckInEnabled(event.target.checked)}
            disabled={running}
          />
          자가 체크인 — 무응답 에이전트에게 자동으로 진행 보고를 요구 (Tmux-Orchestrator 패턴)
          <select
            className="parallel-checkin__interval"
            value={checkInMinutes}
            onChange={(event) => setCheckInMinutes(Number(event.target.value))}
            disabled={running || !checkInEnabled}
            aria-label="체크인 주기"
          >
            {[1, 5, 10, 30].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}분마다
              </option>
            ))}
          </select>
        </label>
        {checkInNote ? <p className="parallel-console__hint">{checkInNote}</p> : null}
        <label className="parallel-workspace__toggle">
          <input
            type="checkbox"
            checked={loreEnabled}
            onChange={(event) => setLoreEnabled(event.target.checked)}
            disabled={running}
          />
          로어북 주입 (옵션) — 미션 텍스트에 키워드가 등장하는 월드인포만 정체성에 덧붙임 · 테넌트:
          <input
            className="parallel-lore__tenant"
            list="parallel-lore-tenants"
            value={loreTenant}
            onChange={(event) => setLoreTenant(event.target.value)}
            disabled={running || !loreEnabled}
            aria-label="로어북 테넌트"
            title="이 테넌트 소유 + shared 로어북만 스캔됩니다 (멀티테넌트 격리)"
          />
          <datalist id="parallel-lore-tenants">
            {bundledLorebookTenants.map((tenant) => (
              <option key={tenant} value={tenant} />
            ))}
          </datalist>
        </label>
      </div>

      {running ? (
        <div className="parallel-broadcast">
          <Megaphone size={14} aria-hidden />
          <input
            className="parallel-broadcast__input"
            placeholder="실행 중인 모든 에이전트에게 일괄 지시 (브로드캐스트)"
            value={broadcastText}
            onChange={(event) => setBroadcastText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void onBroadcast();
            }}
            disabled={broadcasting}
          />
          <button
            type="button"
            className="parallel-broadcast__send"
            onClick={() => void onBroadcast()}
            disabled={broadcasting || !broadcastText.trim()}
          >
            {broadcasting ? "전송 중…" : "전체 지시"}
          </button>
          {broadcastNote ? <span className="parallel-broadcast__note">{broadcastNote}</span> : null}
        </div>
      ) : null}

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
                onChange={(event) => {
                  const personaName = event.target.value;
                  // role travels with the persona: a registered character pulls
                  // its declared pane role in automatically (still overridable)
                  const set = resolvePersonaAgentSet(personaName.trim());
                  patchDraft(
                    draft.id,
                    set.preferredPaneRole ? { personaName, role: set.preferredPaneRole } : { personaName },
                  );
                }}
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
            <div className="autonomy-verify-field">
              <span className="autonomy-verify-hint">실행할 검사를 켜세요</span>
              <div className="verify-chip-row" role="group" aria-label="검증 프리셋">
                {VERIFICATION_PRESETS.map((preset) => {
                  const active = isPresetActive(draft.verificationStepsText, preset.id);
                  return (
                    <button
                      key={preset.id}
                      className={`verify-chip${active ? " is-on" : ""}`}
                      type="button"
                      aria-pressed={active}
                      disabled={running}
                      onClick={() =>
                        patchDraft(draft.id, {
                          verificationStepsText: togglePreset(draft.verificationStepsText, preset.id),
                        })
                      }
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              {customCommands(draft.verificationStepsText).length > 0 ? (
                <div className="verify-chip-row verify-custom-row">
                  {customCommands(draft.verificationStepsText).map((command) => (
                    <span key={command} className="verify-chip verify-custom is-on">
                      <span className="verify-custom-label">{command}</span>
                      <button
                        className="verify-chip-remove"
                        type="button"
                        aria-label={`${command} 제거`}
                        disabled={running}
                        onClick={() =>
                          patchDraft(draft.id, {
                            verificationStepsText: removeCommand(draft.verificationStepsText, command),
                          })
                        }
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <input
                className="verify-custom-input"
                disabled={running}
                value={pendingCustom[draft.id] ?? ""}
                onChange={(event) =>
                  setPendingCustom((prev) => ({ ...prev, [draft.id]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const value = (pendingCustom[draft.id] ?? "").trim();
                  if (!value) return;
                  patchDraft(draft.id, {
                    verificationStepsText: addCustom(draft.verificationStepsText, value),
                  });
                  setPendingCustom((prev) => ({ ...prev, [draft.id]: "" }));
                }}
                placeholder="+ 직접 입력"
                type="text"
              />
            </div>
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
