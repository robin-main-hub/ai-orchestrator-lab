import { useEffect, useMemo, useRef, useState , useSyncExternalStore} from "react";
import type { ChangeEvent, ClipboardEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle, CircleStop, FileDiff, GitBranch, Hammer, PanelRightOpen, Paperclip, Plus, RefreshCcw, RotateCcw, Send, ShieldCheck, Telescope, Terminal, Trash2, X, XCircle } from "lucide-react";
import type { ModelDescriptor, ProviderCompletionAttachment, ProviderProfile, TmuxPaneRole } from "@ai-orchestrator/protocol";
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
import { requestTmuxCapture } from "../../runtime/stage33TmuxServer";
import { loadCodingSessions, saveCodingSessions } from "../../lib/codingChatStore";
import { createGatedToolExecutor, runCodingTurn, toolToCommand } from "../../lib/codingTurnRunner";
import { workspaceChangeLedger } from "../../lib/workspaceChangeLedger";
import { buildRepoMap } from "../../lib/repoMap";
import { createApprovalStrategy } from "../../lib/autonomousRun";
import {
  CODING_APPROVAL_MODES,
  CODING_APPROVAL_MODE_STORAGE_KEY,
  CODING_APPROVED_PREFIXES_STORAGE_KEY,
  CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY,
  CODING_AUTO_APPROVAL_WARNING,
  addApprovedPrefix,
  approvedPrefixCandidate,
  codingApprovalConfig,
  isAutoMode,
  parseStoredApprovalMode,
  parseStoredApprovedPrefixes,
  removeApprovedPrefix,
  shouldShowAutoApprovalWarning,
  type CodingApprovalMode,
} from "../../lib/codingAutoApproval";
import { createClosedLoopEffects } from "../../lib/closedLoopRuntime";
import {
  createMission,
  workbenchMissionStore,
  type MissionStatus,
  type WorkbenchMission,
} from "../../lib/workbenchMissions";
import { CodingThread } from "./CodingThread";
import { GithubConnectorChip } from "./GithubConnectorChip";
import { GithubPullRequestPanel } from "./GithubPullRequestPanel";
import { humanizeCodingError } from "../../lib/codingErrorMessage";
import { useDraftAttachments } from "../../lib/useDraftAttachments";
import { getModelInputModalities, formatAttachmentSize } from "../../lib/helpers";
import { maxDraftAttachments } from "../../lib/appConstants";
import { summarizeRejectedAttachments, attachmentDeliveryNote } from "../../lib/attachmentWarnings";
import { buildCodingAttachmentDelivery, describeCodingAttachmentDelivery } from "../../lib/codingAttachmentContext";
import type { DraftAttachment } from "../../types";
import { fetchGithubPullRequest } from "../../lib/githubConnector";
import { attachmentFromObservedResult, upsertContextAttachment } from "../../lib/githubContext";
import { assembleCodingRequestMessages, buildGithubContextTracePayload } from "../../lib/codingRequestAssembly";
import { codingInjectionBudgets } from "../../lib/contextBudget";
import {
  COMPOSER_INPUT_HEIGHT_STORAGE_KEY,
  composerHeightAfterKey,
  composerHeightFromDrag,
  parseStoredComposerHeight,
} from "../../lib/composerResize";
import {
  SIDEBAR_WIDTH_STORAGE_KEY,
  parseStoredSidebarWidth,
  sidebarWidthAfterKey,
  sidebarWidthFromPointerX,
} from "../../lib/sidebarResize";





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
  modelCatalog = {},
  workingDir,
  onContextEvent,
}: {
  sessionId?: string;
  serverBaseUrl?: string | string[];
  providerProfiles?: ProviderProfile[];
  /** providerProfileId → 발견된 모델 목록. 모델 입력을 텍스트가 아닌 드롭다운으로 채운다. */
  modelCatalog?: Record<string, ModelDescriptor[]>;
  workingDir?: string;
  /** redacted trace emit for GitHub context attach (D2) — wired to EventStorage */
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
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
  // 자동승인 — 4단계 모드(manual/auto_safe/session_allow/guided_auto). 기본 manual.
  // 자동 모드는 사용자가 명시적으로 켜야만 동작하며, 처음 켤 때 위험 경고 확인을 받는다.
  const [approvalMode, setApprovalMode] = useState<CodingApprovalMode>(() => {
    try {
      return parseStoredApprovalMode(window.localStorage.getItem(CODING_APPROVAL_MODE_STORAGE_KEY));
    } catch {
      return "manual";
    }
  });
  const [approvedPrefixes, setApprovedPrefixes] = useState<string[]>(() => {
    try {
      return parseStoredApprovedPrefixes(window.localStorage.getItem(CODING_APPROVED_PREFIXES_STORAGE_KEY));
    } catch {
      return [];
    }
  });
  const [prefixDraft, setPrefixDraft] = useState("");
  // 사용자가 자동승인을 처음 켤 때 위험 경고를 1회 확인 — 확인하면 시각을 기억(armed).
  const [autoApprovalArmedAt, setAutoApprovalArmedAt] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  // 모드 변경 시 경고가 필요하면 dialog로 띄울 모드(확인 대기).
  const [pendingModeIntent, setPendingModeIntent] = useState<CodingApprovalMode | null>(null);
  // 전략이 항상 최신 허용 목록을 읽도록 ref로 미러링(클로저 stale 방지).
  const approvedPrefixesRef = useRef<string[]>(approvedPrefixes);
  useEffect(() => {
    approvedPrefixesRef.current = approvedPrefixes;
    try {
      window.localStorage.setItem(CODING_APPROVED_PREFIXES_STORAGE_KEY, JSON.stringify(approvedPrefixes));
    } catch {
      // storage 불가 — 세션 내 유지
    }
  }, [approvedPrefixes]);
  useEffect(() => {
    try {
      window.localStorage.setItem(CODING_APPROVAL_MODE_STORAGE_KEY, approvalMode);
    } catch {
      // storage 불가 — 세션 내 유지
    }
  }, [approvalMode]);
  const cancelRef = useRef(false);
  const modelSelectRef = useRef<HTMLSelectElement | null>(null);
  // P0-3: read/write로 본 파일 내용을 세션 동안 누적 → repo-map(자동 파일 선택) 인덱스
  const fileCacheRef = useRef<Map<string, string>>(new Map());
  // P0-3 후속: 세션 첫 턴에 전체 레포를 인덱싱한 repo-map(scripts/repo-map.mjs 출력)
  const repoMapRef = useRef<string>("");
  const repoMapBootstrappedRef = useRef(false);

  const active = sessions.find((session) => session.id === activeId) ?? null;

  // 첨부 능력 판정의 근거가 되는 모델 modality. 카탈로그에서 현재 모델 디스크립터를
  // 찾고, 없으면 text-only로 본다 — 모르는 모델에 이미지 지원을 가정하지 않는다(정직).
  const activeModel = useMemo<ModelDescriptor | undefined>(() => {
    const providerId = active?.providerProfileId;
    const catalog = providerId ? modelCatalog[providerId] ?? [] : [];
    return catalog.find((model) => model.id === active?.modelId);
  }, [active?.providerProfileId, active?.modelId, modelCatalog]);
  const modelModalities = useMemo(
    () => (activeModel ? getModelInputModalities(activeModel) : ["text"]),
    [activeModel],
  );
  // 입력 컨텍스트 예산은 모델 컨텍스트 윈도우에 비례 — 큰 모델은 크게, 모델 미상이면 넉넉한 floor.
  // 작은 하드 클램프로 코딩하는 사람을 답답하게 하지 않는다.
  const injectionBudgets = useMemo(() => codingInjectionBudgets(activeModel), [activeModel]);
  const attachmentControl = useDraftAttachments({ modelModalities, maxCount: maxDraftAttachments });
  // 입력창 상하 리사이저 — 경계를 드래그해 textarea 높이를 키운다(긴 입력). localStorage 저장.
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    try {
      return parseStoredComposerHeight(window.localStorage.getItem(COMPOSER_INPUT_HEIGHT_STORAGE_KEY));
    } catch {
      return parseStoredComposerHeight(undefined);
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COMPOSER_INPUT_HEIGHT_STORAGE_KEY, String(composerHeight));
    } catch {
      // storage 불가 환경 — 세션 내에서만 유지
    }
  }, [composerHeight]);
  const onComposerResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 합성 이벤트 — window 리스너로 대체
    }
    const onMove = (moveEvent: globalThis.PointerEvent) =>
      setComposerHeight(composerHeightFromDrag(startHeight, startY, moveEvent.clientY));
    const onUp = () => window.removeEventListener("pointermove", onMove);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };
  // 사이드바 좌우 리사이저 — aside↔section 경계를 드래그해 사이드바 폭을 조절한다. localStorage 저장.
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      return parseStoredSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    } catch {
      return parseStoredSidebarWidth(undefined);
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // storage 불가 환경 — 세션 내에서만 유지
    }
  }, [sidebarWidth]);
  const onSidebarResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const containerLeft = workbenchRef.current?.getBoundingClientRect().left ?? 0;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 합성 이벤트 — window 리스너로 대체
    }
    const onMove = (moveEvent: globalThis.PointerEvent) =>
      setSidebarWidth(sidebarWidthFromPointerX(containerLeft, moveEvent.clientX));
    const onUp = () => window.removeEventListener("pointermove", onMove);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };
  const attachmentRejection = useMemo(
    () => summarizeRejectedAttachments(attachmentControl.rejectedPlans),
    [attachmentControl.rejectedPlans],
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    // 등급형 자동승인 + 기억된 계열 prefix. 위험 명령은 어떤 모드에서도 자동 승인되지 않는다.
    const { autonomyMode, autoApproveAll, patternPrefixesEnabled } = codingApprovalConfig(approvalMode);
    const strategy = createApprovalStrategy(autonomyMode, {
      serverBaseUrl,
      autoApproveAll,
      // 기억된 계열은 session_allow / guided_auto에서만 적용된다(나머지 모드는 prefix 무시).
      getApprovedPrefixes: patternPrefixesEnabled ? () => approvedPrefixesRef.current : undefined,
    });
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

  const runTurn = async (session: CodingSession, userText: string, attachments: DraftAttachment[] = []) => {
    if (!session.providerProfileId || !session.modelId) {
      setNotice("프로바이더/모델을 먼저 선택하세요 (/models)");
      return;
    }
    setRunning(true);
    // 첨부 전달은 정직하게: 이미지→provider rider, 텍스트→1라운드 본문 인라인,
    // metadata_only→미전달 명시. 전송 직후 무엇이 실제로 전달됐는지 한 줄로 알린다.
    const attachmentDelivery = buildCodingAttachmentDelivery(attachments, { totalCharBudget: injectionBudgets.totalCharBudget });
    setNotice(describeCodingAttachmentDelivery(attachmentDelivery) ?? null);
    cancelRef.current = false;
    const now = () => new Date().toISOString();

    let working = pushCheckpoint(session, { id: `cp_${Date.now()}`, label: userText.slice(0, 40), now: now() });
    working = appendUserMessage(working, { id: `u_${Date.now()}`, text: userText, now: now() });
    patchSession(session.id, () => working);

    const mentions = extractMentions(userText);
    const effects = buildEffects(working);
    const gatedExecutor = createGatedToolExecutor(effects);

    // P0-3 후속: 세션 첫 턴에 전체 레포를 한 번 인덱싱(scripts/repo-map.mjs)해
    // repo-map을 시드한다 — read 누적만으론 첫 턴 맵이 비어 있다. 읽기 전용
    // 명령이라 승인 게이트를 거쳐도 안전하고, 실패하면 read-누적 폴백으로 넘어간다.
    if (!repoMapBootstrappedRef.current) {
      repoMapBootstrappedRef.current = true;
      try {
        const mentionArg = mentions.length > 0 ? ` --chat ${mentions.join(",")}` : "";
        const boot = await gatedExecutor({
          id: `repomap_${session.id}`,
          tool: "bash",
          title: "repo-map 인덱싱",
          input: { command: `node scripts/repo-map.mjs --max-tokens 1200${mentionArg}` },
          status: "proposed",
        });
        if (boot.status === "completed" && boot.output.includes("저장소 맵")) {
          repoMapRef.current = boot.output.trim();
        }
      } catch {
        // 부트스트랩 실패 — read 누적 repo-map으로 폴백
      }
    }

    // 전체 인덱싱 결과가 있으면 우선, 없으면 지금까지 read/write로 본 파일들로 생성.
    const repoFiles = Array.from(fileCacheRef.current, ([path, content]) => ({ path, content }));
    const repoMap =
      repoMapRef.current ||
      (repoFiles.length >= 2
        ? buildRepoMap({ files: repoFiles, chatFiles: mentions, maxTokens: 800 }).repoMap
        : "");
    const system = buildSystemPrompt({ agentMode: working.agentMode, mentions, workingDir, repoMap });
    // Phase A: 모든 도구 호출을 워크스페이스 변경 원장에 기록 — 대화 탭 Diff/Files 패널이 구독
    const executeTool: typeof gatedExecutor = async (call) => {
      workspaceChangeLedger.recordToolCall(call);
      const result = await gatedExecutor(call);
      // P0-3: 파일 내용을 repo-map 인덱스에 누적 (write는 입력 콘텐츠, read는 출력)
      const path = String(call.input.path ?? "").trim();
      if (path) {
        if (call.tool === "write" && typeof call.input.content === "string") {
          fileCacheRef.current.set(path, call.input.content);
        } else if (call.tool === "read" && result.status === "completed" && result.output) {
          fileCacheRef.current.set(path, result.output);
        }
      }
      return result;
    };

    let assistantMessageId = "";
    let requestSeq = 0;

    const complete = async (
      messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
      hooks: { onDelta?: (text: string) => void },
    ) => {
      requestSeq += 1;
      // 첨부 본문/이미지는 첫 요청에만 싣는다 — tool 라운드마다 반복 주입하면 토큰이
      // 폭증한다. 이후 라운드에는 본문 없는 짧은 ref만 남겨 모델이 첨부 존재를 기억하게 한다.
      // 첨부 본문 + GitHub 컨텍스트는 첫 요청에만, 이후 라운드는 짧은 ref만 — 토큰 폭증 방지.
      const outgoingMessages = assembleCodingRequestMessages({
        messages,
        requestSeq,
        attachmentFirstContext: attachmentDelivery.firstRequestContext,
        attachmentFollowupContext: attachmentDelivery.followupContext,
        githubContext: working.githubContext,
        githubContextOpts: { maxChars: injectionBudgets.totalCharBudget },
      });
      const firstRequestRiders: ProviderCompletionAttachment[] | undefined =
        requestSeq === 1 ? attachmentDelivery.providerAttachments : undefined;
      const request = {
        id: `creq_${working.id}_${Date.now()}_${requestSeq}`,
        sessionId,
        providerProfileId: working.providerProfileId,
        modelId: working.modelId,
        messages: outgoingMessages,
        ...(firstRequestRiders && firstRequestRiders.length > 0 ? { attachments: firstRequestRiders } : {}),
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

  // 미션 역할 → 프로비저닝된 ai-swarm pane 역할
  const missionRoleToSwarmRole = (role: string): TmuxPaneRole => {
    const r = role.toLowerCase();
    if (r.includes("qa") || r.includes("verif") || r.includes("review")) return "qa";
    if (r.includes("architect") || r.includes("design")) return "architect";
    if (r.includes("research") || r.includes("scout")) return "research";
    if (r.includes("front")) return "frontend";
    if (r.includes("back")) return "backend";
    return "code";
  };

  // attach — ai-swarm의 미션 역할 pane을 실제 캡처해 미션 출력에 흘려준다 (레이어1, 읽기전용)
  const attachMission = async (missionId: string | undefined) => {
    const targetId = missionId ?? missions[0]?.id;
    const mission = missions.find((m) => m.id === targetId);
    if (!mission) {
      appendMissionEvent(missionId, "대상 Mission이 없습니다.", undefined);
      return;
    }
    const swarmRole = missionRoleToSwarmRole(mission.role);
    appendMissionEvent(mission.id, `Attach — ai-swarm ${swarmRole} pane 캡처 중…`, "running");
    try {
      const response = await requestTmuxCapture({
        request: {
          id: `mattach_${mission.id}_${Date.now()}`,
          sessionId,
          role: swarmRole,
          lines: 80,
          tmuxSessionName: "ai-swarm",
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl,
      });
      if (response.status === "captured" && response.payload) {
        appendMissionEvent(mission.id, response.payload.outputPreview || "(출력 없음)", "running");
      } else if (response.status === "disabled") {
        appendMissionEvent(mission.id, `캡처 비활성: ${response.reason}`, "blocked");
      } else {
        appendMissionEvent(mission.id, `캡처 실패: ${response.reason ?? "서버 도달 불가"} — dgx-02 ai-swarm이 떠 있어야 합니다.`, "blocked");
      }
    } catch (error) {
      appendMissionEvent(mission.id, `캡처 실패: ${error instanceof Error ? error.message : String(error)}`, "blocked");
    }
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
        await attachMission(command.missionId);
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
    // 전송 직전 첨부 스냅샷을 잡고 비운다 — 하이드레이트된 본문/이미지가 그대로 runTurn에 전달된다.
    const attachments = attachmentControl.attachments;
    setDraft("");
    attachmentControl.reset();
    // 슬래시 명령은 첨부를 사용하지 않는다(위에서 이미 비웠으므로 자연히 폐기).
    if (await handleSlash(session, text)) return;
    await runTurn(session, text, attachments);
  };

  const openModelPicker = () => modelSelectRef.current?.focus();

  // 자동승인 모드 변경 인텐트 — 자동 모드를 처음 켜는 경우 위험 경고 확인을 받는다.
  // manual로 돌아가는 건 즉시 적용(안전 방향), 위험을 키울 때만 게이트.
  const requestApprovalModeChange = (nextMode: CodingApprovalMode) => {
    if (nextMode === approvalMode) return;
    if (shouldShowAutoApprovalWarning(nextMode, autoApprovalArmedAt)) {
      setPendingModeIntent(nextMode);
      return;
    }
    setApprovalMode(nextMode);
  };
  const confirmAutoApprovalArm = () => {
    if (!pendingModeIntent) return;
    const now = new Date().toISOString();
    setAutoApprovalArmedAt(now);
    try {
      window.localStorage.setItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY, now);
    } catch {
      // storage 불가 — 세션 내 유지
    }
    onContextEvent?.("coding.auto_approval.armed", { mode: pendingModeIntent, armedAt: now });
    setApprovalMode(pendingModeIntent);
    setPendingModeIntent(null);
  };
  const cancelAutoApprovalIntent = () => setPendingModeIntent(null);

  const prefixCandidate = approvedPrefixCandidate(prefixDraft);

  const onPickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    attachmentControl.add(event.target.files);
    event.target.value = "";
  };

  const onComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // Win+Shift+S 등으로 클립보드에 들어온 이미지를 붙여넣으면 첨부로 흡수.
    // 텍스트 paste는 건드리지 않아 기존 입력 동작을 유지한다.
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    attachmentControl.add(imageFiles);
  };

  // D2: 사용자가 명시적으로 선택한 PR만 코딩 컨텍스트에 붙인다(자동 주입 아님).
  // 추가 시 서버가 PR을 다시 GET해 observed를 재확인 — 클라이언트가 들고 있던 내용을 믿지 않는다.
  const attachGithubContext = async (owner: string, repo: string, pullNumber: number) => {
    const session = active;
    if (!session) {
      setNotice("먼저 코딩 세션을 선택하세요");
      return;
    }
    const result = await fetchGithubPullRequest(serverBaseUrl, owner, repo, pullNumber);
    // observed 게이트 — 실제 200 재읽기일 때만 attachment를 만든다(아니면 null → 미attach).
    const attachment = attachmentFromObservedResult(result, `${owner}/${repo}`, {
      fallbackObservedAt: new Date().toISOString(),
      // PR 본문 발췌도 모델 예산에 맞춰 넉넉히(단일 PR이 컨텍스트를 독점하지 않게 절반까지).
      maxExcerptChars: injectionBudgets.prExcerptCharBudget,
    });
    if (!attachment) {
      setNotice(`GitHub 컨텍스트 추가 실패: ${result.message ?? result.outcome}`);
      return;
    }
    patchSession(session.id, (current) => ({
      ...current,
      githubContext: upsertContextAttachment(current.githubContext ?? [], attachment),
    }));
    setNotice(`GitHub PR #${pullNumber} 컨텍스트 추가됨 (관측 ${attachment.observedAt})`);
    // redacted trace — 본문 excerpt·토큰·헤더 제외, 참조/메타만(private raw body 미저장).
    onContextEvent?.("coding.github.context.attached", buildGithubContextTracePayload(attachment));
  };

  const detachGithubContext = (id: string) => {
    if (!active) return;
    patchSession(active.id, (current) => ({
      ...current,
      githubContext: (current.githubContext ?? []).filter((item) => item.id !== id),
    }));
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
    <div
      className="coding-workbench"
      ref={workbenchRef}
      style={{ "--coding-rail-w": `${sidebarWidth}px` } as CSSProperties}
    >
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
            {(() => {
              const providerId = active?.providerProfileId;
              const catalog = providerId ? modelCatalog[providerId] ?? [] : [];
              const defaultModel = providerProfiles.find((profile) => profile.id === providerId)?.defaultModel;
              // 프로바이더 선택 시 그 프로바이더의 모델만 탑다운으로. 카탈로그가 비어도
              // defaultModel과 현재 선택 모델은 항상 옵션으로 남겨 선택을 잃지 않는다.
              const ids = Array.from(
                new Set(
                  [
                    ...catalog.map((model) => model.id),
                    defaultModel,
                    active?.modelId || undefined,
                  ].filter((value): value is string => Boolean(value)),
                ),
              );
              const labelFor = (id: string) => catalog.find((model) => model.id === id)?.name ?? id;
              return (
                <select
                  ref={modelSelectRef}
                  value={active?.modelId ?? ""}
                  onChange={(event) =>
                    active && patchSession(active.id, (current) => ({ ...current, modelId: event.target.value }))
                  }
                  disabled={!active || !providerId || running}
                >
                  <option value="">{providerId ? "모델 선택…" : "프로바이더 먼저 선택"}</option>
                  {ids.map((id) => (
                    <option key={id} value={id}>
                      {labelFor(id)}
                    </option>
                  ))}
                </select>
              );
            })()}
          </label>
          <label>
            승인 모드
            <select
              value={approvalMode}
              onChange={(event) => requestApprovalModeChange(event.target.value as CodingApprovalMode)}
              disabled={running}
              title={CODING_APPROVAL_MODES.find((mode) => mode.id === approvalMode)?.hint}
            >
              {CODING_APPROVAL_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
            <span className="coding-approval__hint">{CODING_APPROVAL_MODES.find((mode) => mode.id === approvalMode)?.hint}</span>
          </label>
          {(approvalMode === "session_allow" || approvalMode === "guided_auto") ? (
            <div className="coding-approval__prefixes" aria-label="세션 자동승인 계열">
              <div className="coding-approval__prefixes-head">
                <span>이번 세션 동안 허용된 계열</span>
                {approvedPrefixes.length > 0 ? (
                  <button type="button" onClick={() => setApprovedPrefixes([])} title="모두 제거">
                    비우기
                  </button>
                ) : null}
              </div>
              {approvedPrefixes.length === 0 ? (
                <p className="coding-approval__empty">아직 없음 — 명령을 입력해 추가하세요(예: <code>pnpm test</code>).</p>
              ) : (
                <ul className="coding-approval__prefix-list">
                  {approvedPrefixes.map((prefix) => (
                    <li key={prefix}>
                      <code>{prefix}</code>
                      <button type="button" onClick={() => setApprovedPrefixes((list) => removeApprovedPrefix(list, prefix))} aria-label={`${prefix} 제거`}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="coding-approval__prefix-add">
                <input
                  value={prefixDraft}
                  onChange={(event) => setPrefixDraft(event.target.value)}
                  placeholder='추가할 명령 (예: "pnpm test")'
                  aria-label="자동승인 계열 추가"
                />
                <button
                  type="button"
                  disabled={!prefixCandidate.canAdd}
                  onClick={() => {
                    setApprovedPrefixes((list) => addApprovedPrefix(list, prefixDraft));
                    setPrefixDraft("");
                  }}
                  title={prefixCandidate.canAdd ? `계열 "${prefixCandidate.prefix}" 추가` : prefixCandidate.blockedReason}
                >
                  추가
                </button>
              </div>
              {prefixDraft.trim() && !prefixCandidate.canAdd ? (
                <p className="coding-approval__warn">{prefixCandidate.blockedReason}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      <button
        type="button"
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 폭 조절"
        className="coding-sidebar-resizer"
        title="드래그해서 사이드바 폭 조절 (←/→)"
        onPointerDown={onSidebarResizePointerDown}
        onKeyDown={(event) => {
          const next = sidebarWidthAfterKey(sidebarWidth, event.key, event.shiftKey);
          if (next !== undefined) {
            event.preventDefault();
            setSidebarWidth(next);
          }
        }}
      >
        <span className="coding-sidebar-resizer__grip" aria-hidden />
      </button>

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
            <StatusBadge variant="danger">
              <span title={active.error}>{humanizeCodingError(active.error)}</span>
            </StatusBadge>
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
          <button
            type="button"
            role="separator"
            aria-orientation="horizontal"
            aria-label="입력창 크기 조절"
            className="coding-prompt__resizer"
            title="드래그해서 입력창 높이 조절 (↑/↓)"
            onPointerDown={onComposerResizePointerDown}
            onKeyDown={(event) => {
              const next = composerHeightAfterKey(composerHeight, event.key, event.shiftKey);
              if (next !== undefined) {
                event.preventDefault();
                setComposerHeight(next);
              }
            }}
          >
            <span className="coding-prompt__resizer-grip" aria-hidden />
          </button>
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
          {attachmentRejection.count > 0 ? (
            <div className="coding-attach-reject" role="status">
              <AlertTriangle size={13} aria-hidden />
              <div className="coding-attach-reject__body">
                <strong>첨부 {attachmentRejection.count}개가 추가되지 않았습니다.</strong>
                {attachmentRejection.reasons.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </div>
              {attachmentRejection.showModelCta ? (
                <button type="button" className="coding-attach-reject__cta" onClick={openModelPicker}>
                  <RefreshCcw size={12} aria-hidden /> 모델 바꾸기
                </button>
              ) : null}
              <button type="button" className="coding-attach-reject__close" onClick={attachmentControl.clearRejected} aria-label="경고 닫기">
                <X size={12} aria-hidden />
              </button>
            </div>
          ) : null}
          {attachmentControl.attachments.length > 0 ? (
            <ul className="coding-attach-chips">
              {attachmentControl.attachments.map((attachment) => {
                const note = attachmentDeliveryNote(attachment);
                return (
                  <li key={attachment.id} className="coding-attach-chip" title={note ?? attachment.name}>
                    <Paperclip size={11} aria-hidden />
                    <span className="coding-attach-chip__name">{attachment.name}</span>
                    <span className="coding-attach-chip__size">{formatAttachmentSize(attachment.size)}</span>
                    {note ? <AlertTriangle size={11} aria-hidden className="coding-attach-chip__warn" /> : null}
                    <button
                      type="button"
                      className="coding-attach-chip__remove"
                      onClick={() => attachmentControl.remove(attachment.id)}
                      aria-label={`${attachment.name} 첨부 제거`}
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="coding-prompt__row">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={onPickFiles}
              aria-hidden
            />
            <button
              type="button"
              className="coding-prompt__attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={running || attachmentControl.attachments.length >= maxDraftAttachments}
              title={
                attachmentControl.attachments.length >= maxDraftAttachments
                  ? `첨부는 최대 ${maxDraftAttachments}개`
                  : "파일 첨부 (이미지·문서, Win+Shift+S 캡처는 입력창에 붙여넣기)"
              }
              aria-label="파일 첨부"
            >
              <Paperclip size={15} aria-hidden />
              <span className="coding-prompt__attach-count">
                {attachmentControl.attachments.length}/{maxDraftAttachments}
              </span>
            </button>
            <textarea
              className="coding-prompt__input"
              aria-label="코딩 지시 입력"
              placeholder={active?.agentMode === "plan" ? "플랜 모드 — 조사/계획만 합니다…" : "무엇을 만들까요? (@경로 멘션, / 명령)"}
              style={{ height: composerHeight }}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={onComposerPaste}
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
              <GithubConnectorChip serverBaseUrl={serverBaseUrl} />
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
                    <button onClick={() => void attachMission(mission.id)} type="button"><Terminal size={13} aria-hidden /> attach</button>
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
          <GithubPullRequestPanel
            serverBaseUrl={serverBaseUrl}
            attachedContext={active?.githubContext}
            onAttach={attachGithubContext}
            onDetach={detachGithubContext}
            onContextEvent={onContextEvent}
          />
        </aside>
      ) : (
        <button className="coding-mission-board-toggle" onClick={() => setMissionPanelOpen(true)} type="button">
          <PanelRightOpen size={14} aria-hidden /> Missions
        </button>
      )}
      {pendingModeIntent ? (
        <div className="coding-auto-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="coding-auto-approval-dialog-title">
          <div className="coding-auto-approval-dialog__card">
            <h2 id="coding-auto-approval-dialog-title">
              <AlertTriangle size={16} aria-hidden /> 자동승인 활성화
            </h2>
            <p className="coding-auto-approval-dialog__mode">
              모드: <strong>{CODING_APPROVAL_MODES.find((mode) => mode.id === pendingModeIntent)?.label}</strong>
            </p>
            <p className="coding-auto-approval-dialog__warning">{CODING_AUTO_APPROVAL_WARNING}</p>
            <p className="coding-auto-approval-dialog__note">
              위험 명령(rm·git push·sudo·shell 메타문자 등)은 자동 승인되지 않습니다. 자동 승인된 명령은 추적 로그에 남습니다.
            </p>
            <div className="coding-auto-approval-dialog__actions">
              <button type="button" onClick={cancelAutoApprovalIntent}>
                취소
              </button>
              <button type="button" className="coding-auto-approval-dialog__confirm" onClick={confirmAutoApprovalArm}>
                이해했고 활성화
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { toolToCommand };
