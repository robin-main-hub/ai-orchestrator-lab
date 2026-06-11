import { useEffect, useMemo, useRef, useState , useSyncExternalStore} from "react";
import { CircleStop, FileDiff, GitBranch, Hammer, PanelRightOpen, Plus, RotateCcw, Send, ShieldCheck, Telescope, Terminal, Trash2, XCircle } from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import {
  addUsage,
  appendUserMessage,
  beginAssistantMessage,
  buildSystemPrompt,
  compactSession,
  shouldAutoCompact,
  createCodingSession,
  extractMentions,
  parseSlashCommand,
  pushCheckpoint,
  sessionToMarkdown,
  setAssistantDraftText,
  setAssistantParts,
  setSessionError,
  setSessionStatus,
  SLASH_COMMANDS,
  toProviderMessages,
  redoLastUndo,
  undoToLastCheckpoint,
  updateToolCall,
  type AgentMode,
  type CodingSession,
  type ToolCall,
} from "../../lib/codingChat";
import { requestCompletion, streamCompletion } from "../../lib/codingAgentClient";
import { loadCodingSessions, saveCodingSessions } from "../../lib/codingChatStore";
import { createGatedToolExecutor, runCodingTurn, toolToCommand } from "../../lib/codingTurnRunner";
import { workspaceChangeLedger } from "../../lib/workspaceChangeLedger";
import { createApprovalStrategy, type AutonomyMode } from "../../lib/autonomousRun";
import { createClosedLoopEffects } from "../../lib/closedLoopRuntime";
import {
  createMission,
  workbenchMissionStore,
  type MissionStatus,
  type WorkbenchMission,
} from "../../lib/workbenchMissions";
import { CodingThread } from "./CodingThread";





function statusLabel(status: MissionStatus): string {
  return { running: "running", done: "done", blocked: "blocked", failed: "failed", needs_review: "needs_review", killed: "killed", cleanup_ready: "cleanup_ready" }[status];
}

/**
 * 코딩 워크벤치 — the opencode-class coding surface. Sessions on the left,
 * the agent thread in the center, a prompt bar with slash commands and @file
 * mentions below. The agent's tools (bash/read/grep/glob/write) execute
 * through the SAME permission/approval/redaction gate as every other command
 * in the OS; PLAN mode locks mutating tools. Chat transport is the server's
 * provider-completion endpoints (SSE streaming with non-stream fallback).
 */

export function CodingWorkbench({
  sessionId = "session_desktop_coding",
  serverBaseUrl,
  providerProfiles = [],
  workingDir,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  providerProfiles?: ProviderProfile[];
  workingDir?: string;
}) {
  const [sessions, setSessions] = useState<CodingSession[]>(() => loadCodingSessions());
  const [activeId, setActiveId] = useState<string | null>(() => loadCodingSessions()[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [missionPanelOpen, setMissionPanelOpen] = useState(true);
  const missions = useSyncExternalStore(
    workbenchMissionStore.subscribe,
    workbenchMissionStore.getSnapshot,
    workbenchMissionStore.getSnapshot,
  );
  const setMissions = workbenchMissionStore.setMissions;
  const [approvalMode, setApprovalMode] = useState<AutonomyMode>("human");
  const cancelRef = useRef(false);
  const modelSelectRef = useRef<HTMLInputElement | null>(null);

  const active = sessions.find((session) => session.id === activeId) ?? null;

  const slashSuggestions = useMemo(() => {
    if (!draft.trim().startsWith("/")) return [];
    const needle = draft.trim().toLowerCase();
    return SLASH_COMMANDS.filter((command) => command.name.startsWith(needle)).slice(0, 12);
  }, [draft]);

  const persist = (next: CodingSession[]) => {
    setSessions(next);
    saveCodingSessions(next);
  };

  const patchSession = (id: string, map: (session: CodingSession) => CodingSession) => {
    setSessions((current) => {
      const next = current.map((session) => (session.id === id ? map(session) : session));
      saveCodingSessions(next);
      return next;
    });
  };

  const newSession = () => {
    const now = new Date().toISOString();
    const session = createCodingSession({
      id: `cs_${Date.now()}`,
      now,
      providerProfileId: providerProfiles[0]?.id,
      modelId: providerProfiles[0]?.defaultModel ?? "",
    });
    persist([session, ...sessions]);
    setActiveId(session.id);
    return session;
  };

  const removeSession = (id: string) => {
    const next = sessions.filter((session) => session.id !== id);
    persist(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  // ── gated tool effects, one lane per workbench session ──────────────────
  const buildEffects = (session: CodingSession) => {
    const strategy = createApprovalStrategy(approvalMode, { serverBaseUrl });
    let seq = 0;
    return createClosedLoopEffects({
      sessionId,
      role: "code",
      paneId: "role:code",
      serverBaseUrl,
      awaitApprovalDecision: strategy,
      newId: (stepIndex) => `coding_${session.id}_${seq++}_${stepIndex}`,
      now: () => new Date().toISOString(),
    });
  };

  const runTurn = async (session: CodingSession, userText: string) => {
    if (!session.providerProfileId || !session.modelId) {
      setNotice("프로바이더/모델을 먼저 선택하세요 (/models)");
      return;
    }
    setRunning(true);
    setNotice(null);
    cancelRef.current = false;
    const now = () => new Date().toISOString();

    let working = pushCheckpoint(session, { id: `cp_${Date.now()}`, label: userText.slice(0, 40), now: now() });
    working = appendUserMessage(working, { id: `u_${Date.now()}`, text: userText, now: now() });
    patchSession(session.id, () => working);

    const mentions = extractMentions(userText);
    const system = buildSystemPrompt({ agentMode: working.agentMode, mentions, workingDir });
    const effects = buildEffects(working);
    const gatedExecutor = createGatedToolExecutor(effects);
    // Phase A: 모든 도구 호출을 워크스페이스 변경 원장에 기록 — 대화 탭 Diff/Files 패널이 구독
    const executeTool: typeof gatedExecutor = async (call) => {
      workspaceChangeLedger.recordToolCall(call);
      return gatedExecutor(call);
    };

    let assistantMessageId = "";
    let requestSeq = 0;

    const complete = async (
      messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
      hooks: { onDelta?: (text: string) => void },
    ) => {
      requestSeq += 1;
      const request = {
        id: `creq_${working.id}_${Date.now()}_${requestSeq}`,
        sessionId,
        providerProfileId: working.providerProfileId,
        modelId: working.modelId,
        messages,
        // 코드/diff가 든 답변은 길다 — 어댑터 기본 512에서 끊기지 않게 상한을 올린다
        maxOutputTokens: 8192,
        source: "desktop" as const,
        routePreference: "server_proxy" as const,
        requestContext: { userId: "owner", routeType: "personal" as const, humanInitiated: true },
        createdAt: new Date().toISOString(),
      };
      try {
        return await streamCompletion(request, { serverBaseUrl, onDelta: hooks.onDelta });
      } catch {
        // SSE unavailable (proxy/buffering) — fall back to the plain endpoint
        const response = await requestCompletion(request, { serverBaseUrl });
        if (response.status !== "succeeded" || !response.content) {
          throw new Error(response.error ?? `completion ${response.status}`);
        }
        return { content: response.content, usage: response.usage };
      }
    };

    try {
      const outcome = await runCodingTurn({
        messages: [{ role: "system", content: system }, ...toProviderMessages(working)],
        agentMode: working.agentMode,
        complete,
        executeTool,
        makeToolId: (round, index) => `tool_${Date.now()}_${round}_${index}`,
        isCancelled: () => cancelRef.current,
        maxToolRounds: 8,
        onEvent: (event) => {
          const stamp = now();
          if (event.type === "assistant_begin") {
            assistantMessageId = `a_${Date.now()}_${event.round}`;
            patchSession(session.id, (current) =>
              setSessionStatus(beginAssistantMessage(current, { id: assistantMessageId, now: stamp }), "thinking", stamp),
            );
          } else if (event.type === "assistant_delta") {
            const messageId = assistantMessageId;
            patchSession(session.id, (current) => setAssistantDraftText(current, { messageId, text: event.text, now: stamp }));
          } else if (event.type === "assistant_parts") {
            const messageId = assistantMessageId;
            patchSession(session.id, (current) =>
              setSessionStatus(setAssistantParts(current, { messageId, parts: event.parts, now: stamp }), "tooling", stamp),
            );
          } else if (event.type === "tool_status") {
            const messageId = assistantMessageId;
            patchSession(session.id, (current) => updateToolCall(current, { messageId, call: event.call, now: stamp }));
          } else if (event.type === "usage") {
            patchSession(session.id, (current) => {
              const next = addUsage(current, event.usage, stamp);
              // MT-OSC 자동 응축 — 입력 토큰이 임계를 넘고 Decider가 허용하면 백그라운드 압축
              if (shouldAutoCompact(next, event.usage.inputTokens ?? 0)) {
                return compactSession(next, { now: stamp });
              }
              return next;
            });
          }
        },
      });
      patchSession(session.id, (current) => setSessionStatus(current, "idle", now()));
      if (outcome.status === "max_rounds") {
        setNotice("도구 라운드 한도(8)에 도달했습니다. 이어서 지시를 주세요.");
      } else if (outcome.status === "cancelled") {
        setNotice("중단됨.");
      }
    } catch (error) {
      patchSession(session.id, (current) =>
        setSessionError(current, error instanceof Error ? error.message : String(error), now()),
      );
    } finally {
      setRunning(false);
    }
  };

  const appendMissionEvent = (missionId: string | undefined, text: string, status?: MissionStatus) => {
    const targetId = missionId ?? missions[0]?.id;
    if (!targetId) {
      setNotice("대상 Mission이 없습니다. 먼저 /fork role=Implementer task=... 를 실행하세요.");
      setMissionPanelOpen(true);
      return;
    }
    const now = new Date().toISOString();
    setMissions((current) =>
      current.map((mission) =>
        mission.id === targetId
          ? {
              ...mission,
              status: status ?? mission.status,
              heartbeat: now,
              lastOutput: text,
              events: [{ id: `ev_${Date.now()}`, at: now, text }, ...mission.events].slice(0, 12),
            }
          : mission,
      ),
    );
    setMissionPanelOpen(true);
  };

  const handleSlash = async (session: CodingSession, raw: string): Promise<boolean> => {
    const command = parseSlashCommand(raw);
    if (!command) return false;
    const now = new Date().toISOString();
    switch (command.kind) {
      case "new":
        newSession();
        break;
      case "sessions":
        setNotice("좌측 세션 목록에서 선택하세요.");
        break;
      case "models":
        modelSelectRef.current?.focus();
        setNotice("모델/프로바이더를 좌측에서 선택하세요.");
        break;
      case "compact":
        patchSession(session.id, (current) => compactSession(current, { now }));
        setNotice("대화를 압축했습니다.");
        break;
      case "undo":
        patchSession(session.id, (current) => undoToLastCheckpoint(current, now));
        setNotice("마지막 턴을 되돌렸습니다. /redo 로 다시 적용할 수 있습니다.");
        break;
      case "redo":
        patchSession(session.id, (current) => redoLastUndo(current, now));
        setNotice("되돌린 턴을 다시 적용했습니다.");
        break;
      case "clear":
        patchSession(session.id, (current) => ({ ...current, messages: [], checkpoints: [], redoStack: [], compactedSummary: undefined }));
        break;
      case "share":
        try {
          await navigator.clipboard.writeText(sessionToMarkdown(session));
          setNotice("대화를 마크다운으로 클립보드에 복사했습니다.");
        } catch {
          setNotice("클립보드 접근이 거부되었습니다.");
        }
        break;
      case "plan":
        patchSession(session.id, (current) => ({ ...current, agentMode: "plan" }));
        break;
      case "build":
        patchSession(session.id, (current) => ({ ...current, agentMode: "build" }));
        break;
      case "fork": {
        const mission = createMission({ role: command.role, task: command.task, model: session.modelId, baseBranch: "main" });
        setMissions((current) => [mission, ...current]);
        setMissionPanelOpen(true);
        setNotice(`Mission ${mission.id} 생성: ${mission.role} · ${mission.title}`);
        break;
      }
      case "missions":
        setMissionPanelOpen(true);
        setNotice("Mission Board를 열었습니다.");
        break;
      case "attach":
        appendMissionEvent(command.missionId, "Attach requested. tmux capture is not connected in this browser session, so a safe worker surface fallback was opened.", "running");
        break;
      case "diff":
        appendMissionEvent(command.missionId, "Diff preview requested. No diff artifact is present yet; awaiting worker output before human review.", "needs_review");
        break;
      case "verify":
        appendMissionEvent(command.missionId, "Verify requested. Run pnpm typecheck/build/test in the worker before approval; fallback event recorded.", "needs_review");
        break;
      case "kill":
        appendMissionEvent(command.missionId, "Kill 요청됨 — 위험한 tmux kill은 게이트 통과 필요. 승인 전까지 종료되지 않습니다.", "blocked");
        break;
      case "cleanup":
        appendMissionEvent(command.missionId, "Cleanup requested. Worktree/tmux/branch cleanup is staged and must be confirmed before destructive action.", "cleanup_ready");
        break;
      case "init":
        void runTurn(session, "이 저장소를 조사해서 (read/grep/glob 사용) AGENTS.md 초안을 제안해줘. 빌드/테스트 명령과 컨벤션을 포함해서. 기존 파일은 사용자 승인 없이 덮어쓰지 말고 preview만 제시해.");
        break;
      case "help":
        setNotice(SLASH_COMMANDS.map((entry) => `${entry.name} — ${entry.description}`).join("  ·  "));
        break;
      case "unknown":
        setNotice(`알 수 없는 명령: ${command.name} (/help 참고)`);
        break;
    }
    return true;
  };

  const onSend = async () => {
    const text = draft.trim();
    if (!text || running) return;
    const session = active ?? newSession();
    setDraft("");
    if (await handleSlash(session, text)) return;
    await runTurn(session, text);
  };

  const onApplyEdit = async (call: ToolCall) => {
    if (!active || running) return;
    const path = String(call.input.path ?? "");
    const diff = String(call.input.diff ?? "");
    if (!path || !diff) return;
    setRunning(true);
    setNotice(`패치 적용 중: ${path}`);
    try {
      const effects = buildEffects(active);
      const command = `cat > /tmp/orch_patch.diff <<'__ORCH_EOF__'\n${diff}\n__ORCH_EOF__\ngit apply --verbose /tmp/orch_patch.diff || patch -p1 < /tmp/orch_patch.diff`;
      await effects.dispatch(command, { stepIndex: -900 });
      const output = await effects.capture();
      setNotice(`적용 결과: ${output.slice(0, 160) || "(출력 없음)"}`);
    } catch (error) {
      setNotice(`적용 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const setMode = (mode: AgentMode) => {
    if (!active) return;
    patchSession(active.id, (current) => ({ ...current, agentMode: mode }));
  };

  return (
    <div className="coding-workbench">
      <aside className="coding-sidebar">
        <button className="coding-sidebar__new" onClick={newSession} type="button">
          <Plus size={14} aria-hidden /> 새 세션
        </button>
        <ul className="coding-sessions">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                className={`coding-sessions__item ${session.id === activeId ? "active" : ""}`}
                onClick={() => setActiveId(session.id)}
                type="button"
              >
                <span className="coding-sessions__title">{session.title}</span>
                <span className="coding-sessions__meta">
                  {session.messages.length}개 · {session.agentMode === "plan" ? "플랜" : "빌드"}
                </span>
              </button>
              <button
                aria-label="세션 삭제"
                className="coding-sessions__delete"
                onClick={() => removeSession(session.id)}
                type="button"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <div className="coding-settings">
          <label>
            프로바이더
            <select
              value={active?.providerProfileId ?? ""}
              onChange={(event) =>
                active && patchSession(active.id, (current) => ({ ...current, providerProfileId: event.target.value }))
              }
              disabled={!active || running}
            >
              <option value="">선택…</option>
              {providerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            모델
            <input
              ref={modelSelectRef}
              value={active?.modelId ?? ""}
              onChange={(event) => active && patchSession(active.id, (current) => ({ ...current, modelId: event.target.value }))}
              placeholder={providerProfiles.find((profile) => profile.id === active?.providerProfileId)?.defaultModel ?? "모델 ID"}
              disabled={!active || running}
            />
          </label>
          <label>
            승인 모드
            <select
              value={approvalMode}
              onChange={(event) => setApprovalMode(event.target.value as AutonomyMode)}
              disabled={running}
            >
              <option value="human">사람 승인</option>
              <option value="auto_safe">safe 자동승인</option>
            </select>
          </label>
        </div>
      </aside>

      <section className="coding-main">
        <header className="coding-main__bar">
          <div className="coding-mode" role="tablist" aria-label="에이전트 모드">
            <button
              className={`coding-mode__tab ${active?.agentMode !== "plan" ? "active" : ""}`}
              onClick={() => setMode("build")}
              type="button"
            >
              <Hammer size={13} aria-hidden /> 빌드
            </button>
            <button
              className={`coding-mode__tab ${active?.agentMode === "plan" ? "active" : ""}`}
              onClick={() => setMode("plan")}
              type="button"
            >
              <Telescope size={13} aria-hidden /> 플랜
            </button>
          </div>
          {active ? (
            <span className="coding-usage" title="누적 토큰 (입력/출력)">
              ⌁ {active.usage.inputTokens.toLocaleString()} in · {active.usage.outputTokens.toLocaleString()} out
            </span>
          ) : null}
          {active?.status === "error" && active.error ? (
            <StatusBadge variant="danger">{active.error.slice(0, 80)}</StatusBadge>
          ) : null}
        </header>

        <div className="coding-scroll">
          <CodingThread
            messages={active?.messages ?? []}
            thinking={running && active?.status === "thinking"}
            onApplyEdit={onApplyEdit}
          />
        </div>

        {notice ? <p className="coding-notice">{notice}</p> : null}

        <footer className="coding-prompt">
          {slashSuggestions.length > 0 ? (
            <ul className="coding-slash">
              {slashSuggestions.map((command) => (
                <li key={command.name}>
                  <button onClick={() => setDraft(`${command.name} `)} type="button">
                    <code>{command.name}</code>
                    <span>{command.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="coding-prompt__row">
            <textarea
              className="coding-prompt__input"
              placeholder={active?.agentMode === "plan" ? "플랜 모드 — 조사/계획만 합니다…" : "무엇을 만들까요? (@경로 멘션, / 명령)"}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSend();
                }
              }}
            />
            {running ? (
              <button
                className="coding-prompt__stop"
                onClick={() => {
                  cancelRef.current = true;
                }}
                type="button"
              >
                <CircleStop size={15} aria-hidden /> 중단
              </button>
            ) : (
              <button className="coding-prompt__send" disabled={!draft.trim()} onClick={() => void onSend()} type="button">
                <Send size={15} aria-hidden /> 전송
              </button>
            )}
          </div>
        </footer>
      </section>
      {missionPanelOpen ? (
        <aside className="coding-mission-board" aria-label="Mission Board">
          <header className="coding-mission-board__header">
            <div>
              <p>Mission Board</p>
              <span>worktree · tmux · diff · approval fallback</span>
            </div>
            <button onClick={() => setMissionPanelOpen(false)} type="button" aria-label="Mission Board 닫기">
              <XCircle size={14} aria-hidden />
            </button>
          </header>
          {missions.length === 0 ? (
            <div className="coding-mission-empty">
              <GitBranch size={18} aria-hidden />
              <p>/fork role=Implementer task=&quot;작업 설명&quot; 으로 Mission을 만들 수 있습니다.</p>
              <button onClick={() => {
                const mission = createMission({ role: "Implementer", task: "첫 병렬 코딩 mission", model: active?.modelId });
                setMissions((current) => [mission, ...current]);
              }} type="button">샘플 Mission 생성</button>
            </div>
          ) : (
            <ul className="coding-missions-board-list">
              {missions.map((mission) => (
                <li key={mission.id} className="coding-mission-card">
                  <div className="coding-mission-card__top">
                    <strong>{mission.title}</strong>
                    <span data-status={mission.status}>{statusLabel(mission.status)}</span>
                  </div>
                  <dl className="coding-mission-meta">
                    <div><dt>role</dt><dd>{mission.role}</dd></div>
                    <div><dt>agent/model</dt><dd>{mission.agent} · {mission.model}</dd></div>
                    <div><dt>branch</dt><dd>{mission.worktree.branch}</dd></div>
                    <div><dt>tmux</dt><dd>{mission.tmux.session}:{mission.tmux.window}.{mission.tmux.pane}</dd></div>
                  </dl>
                  <p className="coding-mission-output">{mission.lastOutput}</p>
                  <div className="coding-mission-actions">
                    <button onClick={() => appendMissionEvent(mission.id, "Attach 대기 — tmux 라우트가 연결되면 캡처 출력이 여기 누적됩니다. (아직 연결 안 됨)", "blocked")} type="button"><Terminal size={13} aria-hidden /> attach</button>
                    <button onClick={() => appendMissionEvent(mission.id, `Diff artifact: ${mission.diffPath}. Awaiting changed files/stat before approval.`, "needs_review")} type="button"><FileDiff size={13} aria-hidden /> diff</button>
                    <button onClick={() => appendMissionEvent(mission.id, `Verify artifact: ${mission.testOutputPath}. Typecheck/build/test gate queued.`, "needs_review")} type="button"><ShieldCheck size={13} aria-hidden /> verify</button>
                    <button onClick={() => appendMissionEvent(mission.id, "Kill 승인 대기 — tmux send-keys/kill-pane 전에 명시적 승인이 필요합니다. (아직 종료 안 됨)", "blocked")} type="button"><CircleStop size={13} aria-hidden /> kill</button>
                    <button onClick={() => appendMissionEvent(mission.id, "Cleanup staged: remove worktree, close tmux window, delete branch after approval.", "cleanup_ready")} type="button"><RotateCcw size={13} aria-hidden /> cleanup</button>
                  </div>
                  <details className="coding-mission-events">
                    <summary>event timeline · gates · artifacts</summary>
                    <p><b>gates:</b> {mission.gates.join(" · ")}</p>
                    <p><b>paths:</b> allow {mission.allowedPaths.join(", ")} / deny {mission.deniedPaths.join(", ")}</p>
                    {mission.events.map((event) => <p key={event.id}><time>{new Date(event.at).toLocaleTimeString()}</time> {event.text}</p>)}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </aside>
      ) : (
        <button className="coding-mission-board-toggle" onClick={() => setMissionPanelOpen(true)} type="button">
          <PanelRightOpen size={14} aria-hidden /> Missions
        </button>
      )}
    </div>
  );
}

export { toolToCommand };
