import { useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, Download, FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import { requestCompletion, streamCompletion } from "../../lib/codingAgentClient";
import { personaAvatars } from "../../lib/personaAvatarSource";
import { PERSONA_CODEX } from "../../lib/personaCodex";
import {
  appendStep,
  createResearchSwarm,
  derivePlanProgress,
  failedAgentCount,
  finishAgent,
  markAgentRunning,
  markSwarmOffline,
  progressDots,
  progressLabel,
  settleStep,
  setViewing,
  type ResearchSwarmState,
} from "../../lib/researchSwarm";
import {
  buildResearchSystemPrompt,
  createKnowledgeStepExecutor,
  runResearchAgent,
  type ResearchWireMessage,
} from "../../lib/researchSwarmRunner";
import { buildResearchNote, combineResearchReport, safeNotePath } from "../../lib/researchWorkspace";
import { ResearchAgentComputer } from "./ResearchAgentComputer";

/**
 * 리서치 스웜 — Kimi Agent Swarm + Manus research 를 합친 조사 콘솔.
 *  - 좌측: 마스터 플랜(체크리스트 + Task Progress) + 요원 명단(아바타·임무·진행도트)
 *  - 우측: Agent's Computer (선택 요원의 활동 타임라인)
 *  - 하단: 요원 스트립 (아바타+번호+회전 동사 상태)
 * 1차는 completion 기반(게이트/tmux/curl 우회). 노트는 다운로드로 보관.
 */

const DEFAULT_PLAN = ["요원 배치", "광역 탐색", "교차 검증", "노트 작성", "종합 보고"];

/** 도감에서 조사에 적합한 요원 6명을 기본 시드 */
const RESEARCH_ROLES = ["researcher", "domain_expert", "verifier", "auditor", "mediator", "watchdog"];
const seedAgents = () =>
  RESEARCH_ROLES.map((role) => PERSONA_CODEX.find((entry) => entry.role === role)).filter(
    (entry): entry is (typeof PERSONA_CODEX)[number] => Boolean(entry),
  );

type Draft = { id: string; personaName: string; displayName: string; task: string };

export function ResearchSwarmContainer({
  sessionId = "session_desktop_research",
  serverBaseUrl,
  providerProfiles = [],
  seed,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  providerProfiles?: ProviderProfile[];
  /** 대화창 "스웜 서치"에서 넘어온 자동 편성 — 주제 + 동적 4~16명 요원 프리필 */
  seed?: { id: string; topic: string; drafts: Array<{ personaName: string; displayName: string; task: string }> };
}) {
  const [topic, setTopic] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    seedAgents().map((entry, index) => ({
      id: `d${index}`,
      personaName: entry.personaName,
      displayName: entry.displayName,
      task: "",
    })),
  );
  const [providerProfileId, setProviderProfileId] = useState(providerProfiles[0]?.id ?? "");
  const [modelId, setModelId] = useState(providerProfiles[0]?.defaultModel ?? "");
  const [swarm, setSwarm] = useState<ResearchSwarmState | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const notesRef = useRef<Map<string, { agentName: string; task: string; path: string; content: string }>>(new Map());

  // 대화창 "스웜 서치" 자동 편성을 받으면 주제 + 요원 명단을 프리필한다(새 seed.id마다 1회).
  const appliedSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seed || appliedSeedRef.current === seed.id) return;
    appliedSeedRef.current = seed.id;
    setTopic(seed.topic);
    setDrafts(
      seed.drafts.map((draft, index) => ({
        id: `seed_${index}`,
        personaName: draft.personaName,
        displayName: draft.displayName,
        task: draft.task,
      })),
    );
    setNotice(`대화에서 「${seed.topic}」 주제로 ${seed.drafts.length}명 요원을 자동 편성했습니다. 스웜 배치로 시작하세요.`);
  }, [seed]);

  const viewing = swarm?.agents.find((run) => run.id === swarm.viewingAgentId) ?? null;
  const viewingIndex = swarm ? swarm.agents.findIndex((run) => run.id === swarm.viewingAgentId) + 1 : 0;
  const failed = swarm ? failedAgentCount(swarm) : 0;

  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  const addDraft = () =>
    setDrafts((current) => [...current, { id: `d${Date.now()}`, personaName: "", displayName: "새 요원", task: "" }]);
  const removeDraft = (id: string) => setDrafts((current) => current.filter((draft) => draft.id !== id));

  const completeFor = (agentId: string) => async (
    messages: ResearchWireMessage[],
    hooks: { onDelta?: (text: string) => void },
  ) => {
    const request = {
      id: `rreq_${agentId}_${Date.now()}_${Math.round(performance.now())}`,
      sessionId,
      providerProfileId,
      modelId,
      messages,
      source: "desktop" as const,
      routePreference: "server_proxy" as const,
      requestContext: { userId: "owner", routeType: "personal" as const, humanInitiated: true },
      createdAt: new Date().toISOString(),
    };
    try {
      return await streamCompletion(request, { serverBaseUrl, onDelta: hooks.onDelta });
    } catch {
      const response = await requestCompletion(request, { serverBaseUrl });
      if (response.status !== "succeeded" || !response.content) {
        throw new Error(response.error ?? `completion ${response.status}`);
      }
      return { content: response.content, usage: response.usage };
    }
  };

  const onRun = async () => {
    if (running) return;
    const cleanTopic = topic.trim();
    if (!cleanTopic) return setNotice("조사 주제를 입력하세요.");
    if (!providerProfileId || !modelId) return setNotice("프로바이더/모델을 선택하세요.");
    const agents = drafts
      .filter((draft) => draft.personaName.trim() || draft.displayName.trim())
      .map((draft, index) => ({
        id: `a${index}`,
        personaName: draft.personaName.trim() || draft.displayName.trim(),
        displayName: draft.displayName.trim() || draft.personaName.trim(),
        task: draft.task.trim() || `"${cleanTopic}"의 한 측면을 조사`,
      }));
    if (agents.length === 0) return setNotice("요원을 최소 1명 구성하세요.");

    setRunning(true);
    setNotice(null);
    cancelRef.current = false;
    notesRef.current = new Map();
    let state = createResearchSwarm({ topic: cleanTopic, plan: DEFAULT_PLAN, agents, now: new Date().toISOString() });
    setSwarm(state);

    const commit = (next: ResearchSwarmState) => {
      state = derivePlanProgress(next);
      setSwarm(state);
    };

    let serverDown = false;
    // 요원들을 동시에 — 단, completion 실패가 곧 헬스체크 (적대검증 #5)
    await Promise.all(
      agents.map(async (agent) => {
        commit(markAgentRunning(state, agent.id));
        const executor = createKnowledgeStepExecutor((rawPath, content) => {
          const safe = safeNotePath(rawPath);
          const path = safe.ok ? safe.path : `research/${agent.id}.md`;
          notesRef.current.set(agent.id, { agentName: agent.displayName, task: agent.task, path, content });
        });
        let stepSeq = 0;
        try {
          const outcome = await runResearchAgent({
            systemPrompt: buildResearchSystemPrompt({ topic: cleanTopic, persona: agent.displayName, task: agent.task }),
            kickoff: `"${cleanTopic}" — 너의 임무(${agent.task})를 시작해. 검색·열람·생각 스텝으로 조사하고 노트를 남겨.`,
            complete: completeFor(agent.id),
            executeStep: executor,
            isCancelled: () => cancelRef.current,
            makeStepId: () => `${agent.id}_s${stepSeq++}`,
            onEvent: (event) => {
              if (event.type === "step_begin") {
                commit(
                  appendStep(state, agent.id, {
                    id: event.id,
                    kind: event.directive.kind,
                    title: event.directive.title,
                    output: event.directive.detail,
                    at: new Date().toISOString(),
                  }),
                );
              } else if (event.type === "step_settle") {
                commit(
                  settleStep(state, agent.id, event.id, {
                    output: event.result.output,
                    resultCount: event.result.resultCount,
                    status: event.result.status,
                  }),
                );
              }
            },
          });
          commit(finishAgent(state, agent.id, { status: "done", conclusion: outcome.conclusion }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/failed to fetch|HTTP|unreachable|completion/i.test(message)) serverDown = true;
          commit(finishAgent(state, agent.id, { status: serverDown ? "offline" : "failed", error: message }));
        }
      }),
    );

    if (serverDown) {
      commit(markSwarmOffline(state, "서버에 연결할 수 없습니다 (provider-completions). 서버를 켜고 다시 시도하세요."));
      setNotice("서버 오프라인 · completion 엔드포인트에 연결 실패. 모든 요원을 오프라인 처리했습니다.");
    } else if (cancelRef.current) {
      setNotice("중단됨.");
    } else {
      setNotice(`조사 완료 · 노트 ${notesRef.current.size}건. 아래에서 보고서를 내려받으세요.`);
    }
    setRunning(false);
  };

  const downloadReport = () => {
    if (!swarm) return;
    const sections = [...notesRef.current.values()].map((note) => ({
      agentName: note.agentName,
      task: note.task,
      body: note.content,
    }));
    const report = sections.length
      ? combineResearchReport({ topic: swarm.topic, createdAt: new Date().toISOString(), sections })
      : swarm.agents
          .map((run) =>
            buildResearchNote({
              topic: swarm.topic,
              agentName: run.displayName,
              task: run.task,
              body: run.conclusion ?? "(결론 없음)",
              createdAt: new Date().toISOString(),
            }),
          )
          .join("\n\n---\n\n");
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `research-${swarm.topic.slice(0, 24).replace(/\s+/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const providerModels = useMemo(
    () => providerProfiles.find((profile) => profile.id === providerProfileId)?.defaultModel,
    [providerProfiles, providerProfileId],
  );

  return (
    <div className="research-swarm">
      {!swarm ? (
        <div className="research-setup">
          <header className="research-setup__head">
            <FlaskConical size={20} aria-hidden className="research-setup__icon" />
            <div>
              <h2 className="research-setup__title">리서치 스웜</h2>
              <p className="research-setup__subtitle">
                여러 요원이 각자의 시점에서 한 주제를 병렬로 조사합니다. (Kimi 스웜 + Manus 리서치 방식)
              </p>
            </div>
          </header>
          <input
            className="research-setup__topic"
            placeholder="조사 주제 — 예: 멀티에이전트 코딩 성공 사례와 오픈소스 설계"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
          <div className="research-setup__providers">
            <label>
              프로바이더
              <select value={providerProfileId} onChange={(event) => setProviderProfileId(event.target.value)}>
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
              <input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder={providerModels ?? "모델 ID"} />
            </label>
          </div>
          <div className="research-setup__agents">
            <span className="research-setup__agents-label">요원 구성</span>
            {drafts.map((draft) => (
              <div className="research-setup__agent" key={draft.id}>
                {personaAvatars[draft.personaName] ? (
                  <img className="research-setup__avatar" src={personaAvatars[draft.personaName]} alt="" />
                ) : (
                  <span className="research-setup__avatar research-setup__avatar--ph">?</span>
                )}
                <input
                  className="research-setup__agent-name"
                  list="research-persona-options"
                  value={draft.displayName}
                  onChange={(event) => {
                    const codex = PERSONA_CODEX.find((entry) => entry.displayName === event.target.value);
                    patchDraft(draft.id, {
                      displayName: event.target.value,
                      personaName: codex?.personaName ?? draft.personaName,
                    });
                  }}
                  placeholder="요원 이름"
                />
                <input
                  className="research-setup__agent-task"
                  value={draft.task}
                  onChange={(event) => patchDraft(draft.id, { task: event.target.value })}
                  placeholder="임무 (비우면 자동 분담)"
                />
                <button className="research-setup__agent-remove" onClick={() => removeDraft(draft.id)} type="button" aria-label="제거">
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
            ))}
            <datalist id="research-persona-options">
              {PERSONA_CODEX.map((entry) => (
                <option key={entry.personaName} value={entry.displayName} />
              ))}
            </datalist>
            <button className="research-setup__add" onClick={addDraft} type="button">
              <Plus size={13} aria-hidden /> 요원 추가
            </button>
          </div>
          {notice ? <p className="research-setup__notice">{notice}</p> : null}
          <button className="research-setup__run" onClick={onRun} disabled={running} type="button">
            <Play size={15} aria-hidden /> 스웜 배치
          </button>
        </div>
      ) : (
        <div className="research-board">
          <aside className="research-left">
            <header className="research-left__head">
              <span className="research-left__title">{swarm.topic}</span>
              <StatusBadge variant={failed > 0 ? "warning" : "primary"}>
                Task Progress {progressLabel(swarm)}
              </StatusBadge>
            </header>
            <ol className="research-plan">
              {swarm.plan.map((phase, index) => (
                <li className={`research-plan__phase ${phase.done ? "done" : ""}`} key={index}>
                  <span className="research-plan__dot" aria-hidden />
                  {phase.title}
                </li>
              ))}
            </ol>
            {failed > 0 ? <p className="research-left__warn">실패/오프라인 {failed}명</p> : null}
            <div className="research-roster">
              {swarm.agents.map((run, index) => (
                <button
                  className={`research-roster__item ${run.id === swarm.viewingAgentId ? "viewing" : ""}`}
                  key={run.id}
                  onClick={() => setSwarm(setViewing(swarm, run.id))}
                  type="button"
                >
                  {personaAvatars[run.personaName] ? (
                    <img className="research-roster__avatar" src={personaAvatars[run.personaName]} alt="" />
                  ) : (
                    <span className="research-roster__avatar research-roster__avatar--ph">?</span>
                  )}
                  <span className="research-roster__main">
                    <span className="research-roster__name">{run.displayName}</span>
                    <span className="research-roster__task" title={run.task}>{run.task}</span>
                    <span className="research-roster__dots" aria-hidden>
                      {progressDots(run).map((on, dotIndex) => (
                        <span className={on ? "on" : ""} key={dotIndex} />
                      ))}
                    </span>
                  </span>
                  <span className={`research-roster__num research-roster__num--${run.status}`}>
                    {run.id === swarm.viewingAgentId ? "Viewing " : ""}
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="research-main">
            <ResearchAgentComputer run={viewing} index={viewingIndex} atLatest onBackToLatest={undefined} />
            <footer className="research-strip">
              {swarm.agents.map((run, index) => (
                <button
                  className={`research-strip__agent ${run.id === swarm.viewingAgentId ? "active" : ""}`}
                  key={run.id}
                  onClick={() => setSwarm(setViewing(swarm, run.id))}
                  type="button"
                >
                  {personaAvatars[run.personaName] ? (
                    <img src={personaAvatars[run.personaName]} alt={run.displayName} />
                  ) : (
                    <span className="research-strip__ph">?</span>
                  )}
                  <span className="research-strip__num">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`research-strip__verb research-strip__verb--${run.status}`}>{run.statusVerb}</span>
                </button>
              ))}
            </footer>
          </main>

          <div className="research-actionbar">
            {notice ? <span className="research-actionbar__notice">{notice}</span> : null}
            <span className="research-actionbar__spacer" />
            {running ? (
              <button className="research-actionbar__stop" onClick={() => (cancelRef.current = true)} type="button">
                <CircleStop size={14} aria-hidden /> 중단
              </button>
            ) : (
              <>
                <button className="research-actionbar__report" onClick={downloadReport} type="button">
                  <Download size={14} aria-hidden /> 보고서 내려받기
                </button>
                <button className="research-actionbar__new" onClick={() => setSwarm(null)} type="button">
                  새 조사
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
