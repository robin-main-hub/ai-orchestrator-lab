import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Check, Eye, Layers, Terminal, X } from "lucide-react";
import type {
  ApprovalRequest,
  CodingPacket,
  ConversationMessage,
  TerminalTimelineBlock,
  TmuxPaneRole,
} from "@ai-orchestrator/protocol";
import {
  requestTmuxCapture,
  requestTmuxDispatch,
  type DesktopTmuxDispatchRequest,
} from "../runtime/stage33TmuxServer";
import type { AgentActivityStatus, AgentVisualSettings, WorkbenchAgent } from "../types";
import { StatusBadge } from "@/ui/status-badge";
import { Button } from "@/ui/button";
import { AgentPortrait, AgentStatePill, type AgentState } from "./shared/AgentActivity";
import { makeSyntheticBlock, TmuxPaneTimeline } from "./TmuxPaneTimeline";
import { codexByPaneRole } from "../lib/personaPaneRoster";
import { personaAvatars } from "../lib/personaAvatarSource";
import {
  compactTmuxPreview,
  formatTmuxDifficultyLabel,
  formatTmuxPaneCountLabel,
  formatTmuxPaneSurfaceLabel,
  sanitizeTmuxWorkbenchText,
  tmuxPaneStateLabel,
  tmuxPaneRoleLabel,
  tmuxWorkbenchCopy,
  type TmuxWorkbenchDifficulty,
} from "../lib/tmuxWorkbenchPresentation";

type TmuxPaneDefinition = {
  id: string;
  roleKey: TmuxPaneRole;
  title: string;
  role: string;
  state: string;
  agent?: WorkbenchAgent;
  signal: string;
};

type PaneBusyState = "capture" | "dispatch";
type TmuxOperationKind = "capture" | "dispatch";
type CodexRoster = ReturnType<typeof codexByPaneRole>;

export type TmuxApprovalQueuedInput = {
  approval: ApprovalRequest;
  request: DesktopTmuxDispatchRequest;
};

export const tmuxBoardCopyLabels = {
  fallbackApprovalTitle: "승인 대기",
  rejectFromQueueNotice: "Tmux 명령어 실행 거부는 우측 상단의 승인 대기열 패널에서 처리해 주세요.",
} as const;

export function TmuxSwarmBoard({
  activeSessionId,
  agentActivityById,
  agentVisualsById,
  agents,
  messages,
  onApprovalQueued,
  packet,
  commandDrafts,
  onCommandDraftChange,
  statuses,
  onStatusChange,
  outputs,
  onOutputChange,
  timelineBlocks,
  onTimelineBlocksChange,
}: {
  activeSessionId: string;
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  agents: WorkbenchAgent[];
  messages: ConversationMessage[];
  onApprovalQueued?: (input: TmuxApprovalQueuedInput) => void;
  packet: CodingPacket;
  commandDrafts: Record<string, string>;
  onCommandDraftChange: Dispatch<SetStateAction<Record<string, string>>>;
  statuses: Record<string, string>;
  onStatusChange: Dispatch<SetStateAction<Record<string, string>>>;
  outputs: Record<string, string>;
  onOutputChange: Dispatch<SetStateAction<Record<string, string>>>;
  timelineBlocks: Record<string, TerminalTimelineBlock[]>;
  onTimelineBlocksChange: Dispatch<SetStateAction<Record<string, TerminalTimelineBlock[]>>>;
}) {
  const roleAgent = (role: WorkbenchAgent["role"]) => agents.find((agent) => agent.role === role);
  const recommendation = createTmuxSwarmRecommendation(packet, messages);
  // 캐릭터↔pane 배치표는 렌더마다 불변(PERSONA_CODEX 상수 유래) — 1회만 계산해 로스터/디테일/초상 해석이 공유한다.
  const codexRoster = useMemo(() => codexByPaneRole(), []);
  const [busyByRole, setBusyByRole] = useState<Record<string, PaneBusyState | undefined>>({});
  const [boardNotice, setBoardNotice] = useState<string>(tmuxWorkbenchCopy.gatedNotice);
  const panes = createTmuxPanes(roleAgent, recommendation);
  const visiblePanes = panes.slice(0, recommendation.recommendedCount);
  const [selectedRole, setSelectedRole] = useState<TmuxPaneRole>(visiblePanes[0]?.roleKey ?? "discussion");

  // visiblePanes 축소 시, selectedRole이 범위를 초과하는 경우 첫 번째 Pane으로 동기화 복구
  useEffect(() => {
    const firstPane = visiblePanes[0];
    if (firstPane && !visiblePanes.some((pane) => pane.roleKey === selectedRole)) {
      setSelectedRole(firstPane.roleKey);
    }
  }, [visiblePanes, selectedRole]);
  const selectedPane = useMemo(
    () => visiblePanes.find((pane) => pane.roleKey === selectedRole) ?? visiblePanes[0],
    [selectedRole, visiblePanes],
  );
  const commandCenter = selectedPane
    ? deriveTmuxCommandCenterForTest({
        commandDraft: commandDrafts[selectedPane.roleKey] ?? defaultTmuxCommandForRole(selectedPane.roleKey),
        lastOutput: outputs[selectedPane.roleKey],
        paneRoleLabel: tmuxPaneRoleLabel(selectedPane.roleKey),
        paneStateLabel: tmuxPaneStateLabel(
          statuses[selectedPane.roleKey] ??
            (selectedPane.agent ? agentActivityById[selectedPane.agent.id] ?? selectedPane.state : selectedPane.state),
        ),
        paneTitle: selectedPane.title,
      })
    : undefined;
  // pane별 실상태를 1회만 해석한 뒤 함대 카운트를 집계한다(기존 pane당 4회 재계산 제거).
  const paneStates = visiblePanes.map((pane) => resolvePaneAgentState(pane, statuses, agentActivityById));
  const fleetCounts = summarizeTmuxFleetCounts(paneStates);

  function appendBlock(roleKey: TmuxPaneRole, block: TerminalTimelineBlock) {
    appendBlocks(roleKey, [block]);
  }

  function appendBlocks(roleKey: TmuxPaneRole, blocks: TerminalTimelineBlock[]) {
    onTimelineBlocksChange((current) => ({
      ...current,
      [roleKey]: [...(current[roleKey] ?? []), ...blocks],
    }));
  }

  function updateCommandDraft(role: TmuxPaneRole, value: string) {
    onCommandDraftChange((current) => ({
      ...current,
      [role]: value,
    }));
  }

  async function handleCapturePane(pane: TmuxPaneDefinition) {
    setBusyByRole((current) => ({ ...current, [pane.roleKey]: "capture" }));
    onStatusChange((current) => ({ ...current, [pane.roleKey]: "capturing" }));
    appendBlock(
      pane.roleKey,
      createTmuxOperationStartedBlock({
        activeSessionId,
        commandPreview: "",
        operation: "capture",
        paneRole: pane.roleKey,
        paneTitle: pane.title,
      }),
    );
    try {
      const result = await requestTmuxCapture({
        request: {
          id: `tmux_capture_${pane.roleKey}_${Date.now()}`,
          sessionId: activeSessionId,
          terminalSessionId: "terminal_session_ai_swarm",
          role: pane.roleKey,
          host: "dgx_02",
          paneId: `role:${pane.roleKey}`,
          lines: 120,
          tmuxSessionName: "ai-swarm",
          createdAt: new Date().toISOString(),
        },
      });
      onStatusChange((current) => ({ ...current, [pane.roleKey]: result.status }));
      onOutputChange((current) => ({
        ...current,
        [pane.roleKey]: compactTmuxPreview(result.payload?.outputPreview || result.reason),
      }));
      appendBlocks(
        pane.roleKey,
        resolveTmuxTimelineBlocks(result.timelineBlocks, [
          makeSyntheticBlock({
          paneId: `role:${pane.roleKey}`,
          role: pane.roleKey,
          host: "dgx_02",
          sessionId: activeSessionId,
          terminalSessionId: "terminal_session_ai_swarm",
          kind: "capture",
          status: result.status === "captured" ? "completed" : "stale",
          title: `${pane.title} 수집`,
          summary: result.reason,
          outputPreview: result.payload?.outputPreview,
          redactionApplied: result.payload?.redactionApplied ?? false,
        }),
        ]),
      );
      setBoardNotice(sanitizeTmuxWorkbenchText(`${pane.title}: ${result.reason}`));
    } catch (error) {
      const message = sanitizeTmuxWorkbenchText(error instanceof Error ? error.message : String(error));
      onStatusChange((current) => ({ ...current, [pane.roleKey]: "capture failed" }));
      onOutputChange((current) => ({ ...current, [pane.roleKey]: message }));
      appendBlock(
        pane.roleKey,
        createTmuxOperationFailedBlock({
          activeSessionId,
          message,
          operation: "capture",
          paneRole: pane.roleKey,
          paneTitle: pane.title,
        }),
      );
      setBoardNotice(`${pane.title}: capture 실패 - ${message}`);
    } finally {
      setBusyByRole((current) => ({ ...current, [pane.roleKey]: undefined }));
    }
  }

  async function handleDispatchPane(pane: TmuxPaneDefinition) {
    const commandPreview = (commandDrafts[pane.roleKey] || defaultTmuxCommandForRole(pane.roleKey)).trim();
    const request: DesktopTmuxDispatchRequest = {
      id: `tmux_dispatch_${pane.roleKey}_${Date.now()}`,
      sessionId: activeSessionId,
      terminalSessionId: "terminal_session_ai_swarm",
      role: pane.roleKey,
      host: "dgx_02",
      paneId: `role:${pane.roleKey}`,
      commandPreview,
      approvalState: "required",
      dispatchMode: "execute_if_approved",
      tmuxSessionName: "ai-swarm",
      createdAt: new Date().toISOString(),
    };

    setBusyByRole((current) => ({ ...current, [pane.roleKey]: "dispatch" }));
    onStatusChange((current) => ({ ...current, [pane.roleKey]: "dispatching" }));
    appendBlock(
      pane.roleKey,
      createTmuxOperationStartedBlock({
        activeSessionId,
        commandPreview,
        operation: "dispatch",
        paneRole: pane.roleKey,
        paneTitle: pane.title,
      }),
    );
    try {
      const result = await requestTmuxDispatch({ request });
      onStatusChange((current) => ({ ...current, [pane.roleKey]: result.dispatch.status }));
      onOutputChange((current) => ({
        ...current,
        [pane.roleKey]: result.approval
          ? sanitizeTmuxWorkbenchText(`승인 대기: ${result.approval.reason}`)
          : sanitizeTmuxWorkbenchText(`${tmuxPaneStateLabel(result.dispatch.status)}: ${result.dispatch.reason}`),
      }));
      const fallbackTimelineBlocks: TerminalTimelineBlock[] = [
        makeSyntheticBlock({
          paneId: `role:${pane.roleKey}`,
          role: pane.roleKey,
          host: "dgx_02",
          sessionId: activeSessionId,
          terminalSessionId: "terminal_session_ai_swarm",
          kind: "command_intent",
          status: "planned",
          title: commandPreview || `${pane.title} 실행 의도`,
          summary: `의도: ${commandPreview}`,
        }),
      ];
      if (result.approval) {
        fallbackTimelineBlocks.push(
          makeSyntheticBlock({
            paneId: `role:${pane.roleKey}`,
            role: pane.roleKey,
            host: "dgx_02",
            sessionId: activeSessionId,
            terminalSessionId: "terminal_session_ai_swarm",
            kind: "approval",
            status: "pending_approval",
            title: tmuxBoardCopyLabels.fallbackApprovalTitle,
            summary: result.approval.reason,
            approvalId: result.approval.id,
          }),
        );
        onApprovalQueued?.({ approval: result.approval, request });
      } else {
        fallbackTimelineBlocks.push(
          makeSyntheticBlock({
            paneId: `role:${pane.roleKey}`,
            role: pane.roleKey,
            host: "dgx_02",
            sessionId: activeSessionId,
            terminalSessionId: "terminal_session_ai_swarm",
            kind: "dispatch",
            status:
              result.dispatch.status === "recorded" || result.dispatch.status === "sent" || result.dispatch.status === "dry_run"
                ? "completed"
                : result.dispatch.status === "blocked"
                  ? "blocked"
                  : result.dispatch.status === "pending_approval"
                    ? "pending_approval"
                    : "failed",
            title: `${pane.title} 전송`,
            summary: result.dispatch.reason,
          }),
        );
      }
      appendBlocks(pane.roleKey, resolveTmuxTimelineBlocks(result.timelineBlocks, fallbackTimelineBlocks));
      setBoardNotice(sanitizeTmuxWorkbenchText(`${pane.title}: ${result.dispatch.reason}`));
    } catch (error) {
      const message = sanitizeTmuxWorkbenchText(error instanceof Error ? error.message : String(error));
      onStatusChange((current) => ({ ...current, [pane.roleKey]: "dispatch failed" }));
      onOutputChange((current) => ({ ...current, [pane.roleKey]: message }));
      appendBlock(
        pane.roleKey,
        createTmuxOperationFailedBlock({
          activeSessionId,
          message,
          operation: "dispatch",
          paneRole: pane.roleKey,
          paneTitle: pane.title,
        }),
      );
      setBoardNotice(`${pane.title}: 전송 실패 - ${message}`);
    } finally {
      setBusyByRole((current) => ({ ...current, [pane.roleKey]: undefined }));
    }
  }

  return (
    <section
      aria-label={tmuxWorkbenchCopy.kicker}
      className="cockpit-bridge flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100 focus:outline-none"
      data-focus-id="tmux-swarm-board-container"
      tabIndex={-1}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/60 bg-zinc-950 px-4 md:px-5">
        <div className="flex items-center gap-3">
          <Layers className="h-4 w-4 text-amber-400" />
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              워커 함대
            </span>
            <h1 className="text-sm font-medium text-zinc-100">스웜 작업대</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <FleetStat dotClass="bg-emerald-500" label="작업" value={fleetCounts.active} />
          {fleetCounts.pending > 0 ? <FleetStat dotClass="bg-amber-500 os-breathe" label="승인 대기" value={fleetCounts.pending} /> : null}
          {fleetCounts.error > 0 ? <FleetStat dotClass="bg-rose-500" label="오류" value={fleetCounts.error} /> : null}
          <span className="hidden sm:inline">{formatTmuxPaneCountLabel(visiblePanes.length)}</span>
        </div>
      </header>

      <details className="group border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-2 md:px-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs text-zinc-400 transition-colors hover:text-zinc-100">
          <span className="font-semibold">{tmuxWorkbenchCopy.recommendationLabel}</span>
          <span className="text-[11px] text-zinc-600 group-open:hidden">작업 구성 보기</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-300">{recommendation.summary}</p>
          <div className="flex flex-wrap gap-1 sm:ml-auto">
            {recommendation.recommendedRoles.map((role) => (
              <StatusBadge variant="muted" size="sm" key={role}>
                {tmuxPaneRoleLabel(role)}
              </StatusBadge>
            ))}
          </div>
        </div>
      </details>

      {commandCenter ? <TmuxCommandCenter summary={commandCenter} /> : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 읽기 전용 관측 — 각 에이전트가 지금 뭘 하고 무슨 결론을 냈는지 한눈에.
            명령/지시는 여기가 아니라 대화 탭에서 상대를 바꿔가며 한다. */}
        <p className="shrink-0 px-3 pt-2 text-[11px] text-zinc-500">
          관측 전용 — 에이전트의 활동·결론을 한눈에 봅니다. 지시·수정은 대화 탭에서 상대를 바꿔가며 하세요.
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2 overflow-y-auto p-3 max-md:grid-cols-1">
          {visiblePanes.map((pane) => (
            <TmuxFleetRow
              key={pane.id}
              codexRoster={codexRoster}
              pane={{
                ...pane,
                state:
                  statuses[pane.roleKey] ??
                  (pane.agent ? agentActivityById[pane.agent.id] ?? pane.state : pane.state),
              }}
              isSelected={selectedPane?.roleKey === pane.roleKey}
              onSelect={() => setSelectedRole(pane.roleKey)}
              latestOutput={outputs[pane.roleKey]}
            />
          ))}
        </div>

        {/* 선택 pane 상세 — 그리드 아래 풀와이드(VSCode 터미널 패턴). 입력은 카드에 있으므로 끔 */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800/60">
          {selectedPane ? (
            <TmuxPaneDetail
              busy={busyByRole[selectedPane.roleKey]}
              codexRoster={codexRoster}
              commandDraft={commandDrafts[selectedPane.roleKey] ?? defaultTmuxCommandForRole(selectedPane.roleKey)}
              lastOutput={outputs[selectedPane.roleKey]}
              onCapture={() => void handleCapturePane(selectedPane)}
              onDispatch={() => void handleDispatchPane(selectedPane)}
              onReject={() => {
                updateCommandDraft(selectedPane.roleKey, "");
                setBoardNotice(sanitizeTmuxWorkbenchText(`${selectedPane.title}: 대기 중인 명령을 취소했습니다.`));
              }}
              pane={{
                ...selectedPane,
                state:
                  statuses[selectedPane.roleKey] ??
                  (selectedPane.agent ? agentActivityById[selectedPane.agent.id] ?? selectedPane.state : selectedPane.state),
              }}
              timelineBlocks={timelineBlocks[selectedPane.roleKey] ?? []}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">위에서 작업창을 선택하세요</div>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/60 bg-zinc-900/30 p-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2">
          <Terminal className="h-4 w-4 shrink-0 text-zinc-500" />
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
            {sanitizeTmuxWorkbenchText(boardNotice)}
          </p>
          <span className="hidden text-[10px] text-zinc-500 sm:inline">
            세션 {activeSessionId.slice(-12)}
          </span>
        </div>
      </footer>
    </section>
  );
}

export function resolveTmuxTimelineBlocks(
  serverBlocks: TerminalTimelineBlock[] | undefined,
  fallbackBlocks: TerminalTimelineBlock[],
): TerminalTimelineBlock[] {
  return serverBlocks && serverBlocks.length > 0 ? serverBlocks : fallbackBlocks;
}

export function deriveTmuxCommandCenterForTest({
  commandDraft,
  lastOutput,
  paneRoleLabel,
  paneStateLabel,
  paneTitle,
}: {
  commandDraft: string | undefined;
  lastOutput: string | undefined;
  paneRoleLabel: string;
  paneStateLabel: string;
  paneTitle: string;
}) {
  return {
    commandLabel: sanitizeTmuxWorkbenchText(commandDraft?.trim() || "명령 초안 대기"),
    outputLabel: sanitizeTmuxWorkbenchText(lastOutput?.trim() || "아직 결과 없음"),
    roleLabel: paneRoleLabel,
    statusLabel: paneStateLabel,
    title: paneTitle,
  };
}

function TmuxCommandCenter({
  summary,
}: {
  summary: ReturnType<typeof deriveTmuxCommandCenterForTest>;
}) {
  return (
    <section className="shrink-0 border-b border-amber-400/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(24,24,27,0.50)_48%,rgba(6,182,212,0.08))] px-4 py-3 md:px-5">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-lg border border-amber-300/15 bg-black/20 px-3 py-2">
          <p className="text-[10px] font-semibold text-amber-100">선택 작업창</p>
          <p className="mt-1 truncate text-sm font-semibold text-zinc-50" title={summary.title}>
            {summary.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{summary.roleLabel} · {summary.statusLabel}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-cyan-300/15 bg-cyan-400/10 px-3 py-2">
          <p className="text-[10px] font-semibold text-cyan-100">다음 명령</p>
          <p className="mt-1 truncate font-mono text-xs text-cyan-50" title={summary.commandLabel}>
            {summary.commandLabel}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-2">
          <p className="text-[10px] font-semibold text-zinc-400">최근 결과</p>
          <p className="mt-1 truncate text-xs text-zinc-200" title={summary.outputLabel}>
            {summary.outputLabel}
          </p>
        </div>
      </div>
    </section>
  );
}

export function createTmuxOperationStartedBlock({
  activeSessionId,
  commandPreview,
  operation,
  paneRole,
  paneTitle,
}: {
  activeSessionId: string;
  commandPreview: string;
  operation: TmuxOperationKind;
  paneRole: TmuxPaneRole;
  paneTitle: string;
}): TerminalTimelineBlock {
  const isDispatch = operation === "dispatch";
  return makeSyntheticBlock({
    paneId: `role:${paneRole}`,
    role: paneRole,
    host: "dgx_02",
    sessionId: activeSessionId,
    terminalSessionId: "terminal_session_ai_swarm",
    kind: operation,
    status: "running",
    title: `${paneTitle} ${isDispatch ? "전송 중" : "읽는 중"}`,
    summary: isDispatch
      ? `명령 전송을 준비하고 있습니다. 미리보기: ${sanitizeTmuxWorkbenchText(commandPreview || "명령 없음")}`
      : `${paneTitle} 패널의 최신 출력을 읽고 있습니다.`,
    redactionApplied: true,
  });
}

export function createTmuxOperationFailedBlock({
  activeSessionId,
  message,
  operation,
  paneRole,
  paneTitle,
}: {
  activeSessionId: string;
  message: string;
  operation: TmuxOperationKind;
  paneRole: TmuxPaneRole;
  paneTitle: string;
}): TerminalTimelineBlock {
  const isDispatch = operation === "dispatch";
  return makeSyntheticBlock({
    paneId: `role:${paneRole}`,
    role: paneRole,
    host: "dgx_02",
    sessionId: activeSessionId,
    terminalSessionId: "terminal_session_ai_swarm",
    kind: operation,
    status: "failed",
    title: `${paneTitle} ${isDispatch ? "전송 실패" : "읽기 실패"}`,
    summary: sanitizeTmuxWorkbenchText(message),
    redactionApplied: true,
  });
}

function FleetStat({ dotClass, label, value }: { dotClass: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {value} {label}
    </span>
  );
}

/**
 * pane 초상 해석: 배정 에이전트의 personaName → 역할 슬러그(agents/<role>) →
 * 이 워크스테이션의 첫 소환 후보 순으로 아바타를 찾는다. 후보조차 없는
 * 역할 전용 pane(프론트/백엔드 등)만 이니셜로 남는다.
 */
function panePortraitUrl(pane: TmuxPaneDefinition, codexRoster: CodexRoster): string | undefined {
  if (pane.agent?.personaName && personaAvatars[pane.agent.personaName]) {
    return personaAvatars[pane.agent.personaName];
  }
  if (pane.agent && personaAvatars[pane.agent.role]) {
    return personaAvatars[pane.agent.role];
  }
  for (const entry of codexRoster[pane.roleKey] ?? []) {
    const url = personaAvatars[entry.personaName];
    if (url) return url;
  }
  return undefined;
}

/** 마지막 출력에서 "결론" 한 줄을 뽑는다 — 마지막 비어있지 않은 줄(요약 관측용). */
function latestConclusionLine(output: string | undefined): string | undefined {
  if (!output) return undefined;
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  if (!last) return undefined;
  return last.length > 140 ? `${last.slice(0, 139)}…` : last;
}

function TmuxFleetRow({
  pane,
  isSelected,
  onSelect,
  latestOutput,
  codexRoster,
}: {
  pane: TmuxPaneDefinition;
  isSelected: boolean;
  onSelect: () => void;
  /** 이 워커의 마지막 작업창 출력 — "무슨 답을 했는지/결론" 요약 표시(읽기 전용) */
  latestOutput?: string;
  codexRoster: CodexRoster;
}) {
  const state = mapTmuxPaneStateToAgentState(pane.state);
  const initials = pane.agent ? getInitials(pane.agent.name) : getInitials(pane.title);
  const surfaceLabel = formatTmuxPaneSurfaceLabel(pane.id);
  const codex = codexRoster[pane.roleKey] ?? [];
  const conclusion = latestConclusionLine(latestOutput);

  // 읽기 전용 관측 카드 — 클릭하면 아래 풀와이드에서 전체 출력/타임라인을 본다.
  return (
    <button
      aria-label={`${pane.title} 관측 — ${tmuxPaneStateLabel(pane.state)}`}
      className={`flex w-full flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isSelected ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-zinc-800/70 hover:border-zinc-700"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex w-full items-center gap-3">
        <AgentPortrait avatarUrl={panePortraitUrl(pane, codexRoster)} initials={initials} state={state} size="sm" tintClassName="bg-zinc-800 text-zinc-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{pane.title}</span>
            <span className="shrink-0 text-[10px] text-zinc-600">· {surfaceLabel}</span>
          </div>
          <p className="truncate text-xs text-zinc-500">
            {pane.agent?.name ?? tmuxPaneRoleLabel(pane.roleKey)} · {pane.role}
          </p>
          {codex.length > 0 ? (
            <p className="truncate text-[10px] text-violet-300/80">
              ★ {codex.map((entry) => entry.displayName).join(" · ")}
            </p>
          ) : null}
        </div>
        <AgentStatePill state={state} />
      </div>
      {/* 최근 결론/답변 한 줄 — 한눈에 "무슨 생각·결론" (읽기 전용) */}
      <div className="flex items-start gap-1.5 rounded-lg border border-zinc-800/70 bg-zinc-950/50 px-2 py-1.5">
        <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
        <span className={`min-w-0 flex-1 font-mono text-[11px] leading-snug ${conclusion ? "text-zinc-300" : "text-zinc-600"}`}>
          {conclusion ?? "아직 출력 없음 — 활동을 기다리는 중"}
        </span>
      </div>
    </button>
  );
}

function TmuxPaneDetail({
  busy,
  codexRoster,
  commandDraft,
  lastOutput,
  onCapture,
  onDispatch,
  onReject,
  pane,
  timelineBlocks,
}: {
  busy?: PaneBusyState;
  codexRoster: CodexRoster;
  commandDraft: string;
  lastOutput?: string;
  onCapture: () => void;
  onDispatch: () => void;
  onReject: () => void;
  pane: TmuxPaneDefinition;
  timelineBlocks: TerminalTimelineBlock[];
}) {
  const state = mapTmuxPaneStateToAgentState(pane.state);
  const surfaceLabel = formatTmuxPaneSurfaceLabel(pane.id);
  const summonCandidates = codexRoster[pane.roleKey] ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/60 px-5 py-3.5">
        <AgentPortrait avatarUrl={panePortraitUrl(pane, codexRoster)} initials={pane.agent ? getInitials(pane.agent.name) : getInitials(pane.title)} state={state} size="md" tintClassName="bg-zinc-800 text-zinc-200" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-medium text-zinc-100">{pane.title}</h2>
            <span className="text-[10px] text-zinc-600">{surfaceLabel}</span>
          </div>
          <p className="truncate text-xs text-zinc-500">{pane.agent?.name ?? "담당 에이전트 미정"} · {pane.role}</p>
          {summonCandidates.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider text-zinc-600">소환 후보</span>
              {summonCandidates.map((entry) => (
                <span
                  className="rounded-full border border-violet-400/20 bg-violet-500/10 px-1.5 py-px text-[10px] text-violet-200"
                  key={entry.personaName}
                  title={entry.caption}
                >
                  {entry.displayName}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <AgentStatePill state={state} />
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-4 rounded-xl border border-zinc-800/60 bg-zinc-900/35 p-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">운영 신호</div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{pane.signal}</p>
        </div>

        {pane.state.includes("approval") || pane.state.includes("pending") ? (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 os-breathe" />
              승인 게이트 대기
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950/80 px-3 py-2 font-mono text-xs text-zinc-100">
              {commandDraft}
            </pre>
            <div className="mt-3 flex items-center gap-2">
              <Button className="h-8 gap-1.5 bg-emerald-600 px-3 text-xs hover:bg-emerald-700" disabled={Boolean(busy)} onClick={onDispatch} size="sm">
                <Check className="h-3.5 w-3.5" />
                승인 요청
              </Button>
              <Button
                className="h-8 gap-1.5 border-rose-500/30 px-3 text-xs text-rose-300 hover:bg-rose-500/10"
                onClick={onReject}
                size="sm"
                variant="outline"
              >
                <X className="h-3.5 w-3.5" />
                거부
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 px-0.5 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          <Eye className="h-3 w-3" />
          최근 출력
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 p-4">
          {lastOutput ? (
            <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">{compactTmuxPreview(lastOutput)}</p>
          ) : (
            <p className="font-mono text-xs text-zinc-500">아직 실행 기록이 없습니다.</p>
          )}
        </div>

        <div className="mt-4">
          <TmuxPaneTimeline blocks={timelineBlocks} />
        </div>
      </div>

      {/* 관측 전용 — 명령 입력 없이 "읽기(새로고침)"만. 지시는 대화 탭에서. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/60 px-4 py-2.5">
        <span className="text-[11px] text-zinc-500">관측 전용 · 지시는 대화 탭에서 상대를 바꿔가며 하세요</span>
        <Button className="h-7 gap-1.5 px-2.5 text-xs" disabled={Boolean(busy)} onClick={onCapture} size="sm" variant="ghost">
          <Eye className="h-3.5 w-3.5" />
          읽기 새로고침
        </Button>
      </div>
    </div>
  );
}

type TmuxSwarmDifficulty = TmuxWorkbenchDifficulty;

function createTmuxPanes(
  roleAgent: (role: WorkbenchAgent["role"]) => WorkbenchAgent | undefined,
  recommendation: ReturnType<typeof createTmuxSwarmRecommendation>,
): TmuxPaneDefinition[] {
  return [
    {
      id: "pane-0",
      roleKey: "discussion",
      title: "논의와 계획",
      role: "요구사항 / 제품 / 아키텍처 논의",
      state: "chat active",
      agent: roleAgent("orchestrator"),
      signal: "사용자와 먼저 논의하고, 바로 실행하지 않습니다.",
    },
    {
      id: "pane-1",
      roleKey: "orchestrator",
      title: "오케스트레이터 지휘",
      role: "작업 분해 / 역할 배정 / 지휘",
      state: "dispatch gated",
      agent: roleAgent("orchestrator"),
      signal: "실제 tmux send는 승인과 서버 env gate 이후에만 열립니다.",
    },
    {
      id: "pane-2",
      roleKey: "status",
      title: "상태 감시",
      role: "진행 로그 / 테스트 / 멈춘 실행 감시",
      state: "watch only",
      signal: "작업 기록 장부에 남길 실행 의도와 수집 상태를 봅니다.",
    },
    {
      id: "pane-3",
      roleKey: "code",
      title: "코드 작업자",
      role: "핵심 로직 / 리팩터링 / 복잡 구현",
      state: "idle",
      agent: roleAgent("builder"),
      signal: "코딩 패킷이 생기면 핵심 로직 작업 후보가 됩니다.",
    },
    {
      id: "pane-4",
      roleKey: "architect",
      title: "설계 작업자",
      role: "프로토콜 / 작업 기록 / 타입 경계",
      state: "ready",
      agent: roleAgent("architect"),
      signal: "실행 슬롯, 에이전트 세션, 실행 이벤트 타입 경계를 담당합니다.",
    },
    {
      id: "pane-5",
      roleKey: "frontend",
      title: "프론트 작업자",
      role: "데스크톱 UI / 작업대 / 실행 슬롯",
      state: "active",
      signal: "터미널 작업대와 승인 동선을 담당합니다.",
    },
    {
      id: "pane-6",
      roleKey: "backend",
      title: "백엔드 작업자",
      role: "server / sync / DGX 연결 지점",
      state: "idle",
      signal: "DGX-02를 기본 서버로 보고, DGX-01은 잠금 상태로 둡니다.",
    },
    {
      id: "pane-7",
      roleKey: "qa",
      title: "검증과 보안",
      role: "테스트 / 권한 / 마스킹 / 회귀검사",
      state: "guarding",
      agent: roleAgent("reviewer") ?? roleAgent("verifier"),
      signal: "비밀값, 명령, 승인, 이벤트 기록 회귀를 우선 확인합니다.",
    },
    {
      id: "pane-8",
      roleKey: "research",
      title: "조사 작업자",
      role: "외부 문서 / repo / 레퍼런스 조사",
      state: recommendation.recommendedRoles.includes("research") ? "recommended" : "standby",
      agent: roleAgent("skeptic"),
      signal: "새 API나 라이브러리 검토가 필요할 때만 투입합니다.",
    },
    {
      id: "pane-9",
      roleKey: "memory",
      title: "기억 관리자",
      role: "기억 호출 / 결정 기록 / 인계 정리",
      state: recommendation.recommendedRoles.includes("memory") ? "recommended" : "standby",
      agent: roleAgent("memory_curator"),
      signal: "장기 프로젝트, 백업, 인계가 걸리면 기억 정리를 전담합니다.",
    },
  ];
}

function createTmuxSwarmRecommendation(packet: CodingPacket, messages: ConversationMessage[]) {
  const text = [
    packet.goal,
    ...packet.context,
    ...packet.decisions,
    ...packet.constraints,
    ...packet.implementationPlan,
    ...packet.verificationPlan,
    ...messages.slice(-6).map((message) => message.content),
  ]
    .join(" ")
    .toLowerCase();
  const keywordWeights: Array<[string, number]> = [
    ["tmux", 2],
    ["dgx", 2],
    ["server", 1],
    ["permission", 2],
    ["redaction", 2],
    ["보안", 2],
    ["백업", 1],
    ["provider", 1],
    ["프로바이더", 1],
    ["memory", 1],
    ["memento", 1],
    ["event", 1],
    ["테스트", 1],
    ["끝까지", 2],
    ["완성", 2],
  ];
  const score =
    2 +
    packet.implementationPlan.length +
    packet.verificationPlan.length +
    packet.constraints.length +
    keywordWeights.reduce((total, [keyword, weight]) => total + (text.includes(keyword) ? weight : 0), 0);
  const difficulty: TmuxSwarmDifficulty =
    score >= 15 ? "critical" : score >= 10 ? "complex" : score >= 6 ? "standard" : "light";
  const recommendedCount = difficulty === "critical" ? 10 : difficulty === "complex" ? 8 : difficulty === "standard" ? 6 : 4;
  const baseRoles: TmuxPaneRole[] = ["discussion", "orchestrator", "status", "architect"];
  const byDifficulty: Record<TmuxSwarmDifficulty, TmuxPaneRole[]> = {
    light: ["frontend"],
    standard: ["frontend", "backend", "qa"],
    complex: ["code", "architect", "frontend", "backend", "qa"],
    critical: ["code", "architect", "frontend", "backend", "qa", "research", "memory"],
  };
  const recommendedRoles = Array.from(new Set<TmuxPaneRole>([...baseRoles, ...byDifficulty[difficulty]])).slice(
    0,
    recommendedCount,
  );

  return {
    difficulty,
    recommendedCount,
    recommendedRoles,
    score,
    summary:
      difficulty === "critical"
        ? "서버, 권한, 기억, 백업, 실행이 함께 걸린 작업이라 10명 구성이 안전합니다."
        : difficulty === "complex"
          ? "프론트와 백엔드, 검증이 동시에 필요한 복합 작업이라 8명 구성을 추천합니다."
          : difficulty === "standard"
            ? "구현과 검증이 함께 필요한 일반 작업이라 6명 구성을 추천합니다."
            : "작은 수정이나 검토 중심 작업이라 4명 구성으로 충분합니다.",
  };
}

export function defaultTmuxCommandForRole(role: TmuxPaneRole) {
  const prompts: Record<TmuxPaneRole, string> = {
    discussion: "echo '요구사항을 먼저 논의한다. 직접 실행하지 않는다.'",
    orchestrator: "codex '현재 요청을 역할별 작업으로 나눠라. 명령은 실행하지 마라.'",
    status: "git status --short",
    code: "codex '현재 코딩 패킷을 검토하고 구현 단계를 제안하라.'",
    architect: "codex '현재 작업의 프로토콜과 이벤트 경계를 검토하라.'",
    frontend: "codex '데스크톱 tmux 워크벤치 UI를 검토하고 다음 UI 패치를 제안하라.'",
    backend: "codex '서버 tmux 게이트를 검토하고 빠진 안전장치를 찾아라.'",
    qa: "corepack pnpm typecheck && corepack pnpm test",
    research: "codex '현재 구현 결정에 필요한 레퍼런스를 수집하라.'",
    memory: "codex '현재 세션에서 Memento에 남길 지속 결정을 추출하라.'",
  };
  return prompts[role];
}

function resolvePaneAgentState(
  pane: TmuxPaneDefinition,
  statuses: Record<string, string>,
  agentActivityById: Record<string, AgentActivityStatus>,
): AgentState {
  return mapTmuxPaneStateToAgentState(
    statuses[pane.roleKey] ?? (pane.agent ? agentActivityById[pane.agent.id] ?? pane.state : pane.state),
  );
}

/**
 * tmux 캡처/디스패치 라이프사이클의 정본 상태 문자열 → AgentState 정확 매칭 테이블.
 * 핵심: `captured`(캡처 완료)는 done(=success/"완료")로, `capturing`(진행 중)은 responding으로 구분한다.
 * 기존 `includes("captur")`는 완료와 진행을 뭉뚱그려 완료된 pane을 계속 "응답 중"으로 오분류했고,
 * 그 결과 헤더 "작업" 카운트가 완료 pane까지 계속 집계하는 버그가 있었다(스펙 §2.4 버그 수정).
 */
const TMUX_STATE_TO_AGENT_STATE: Record<string, AgentState> = {
  capturing: "responding",
  captured: "success",
  "capture failed": "error",
  disabled: "idle",
  dispatching: "responding",
  "dispatch failed": "error",
  recorded: "success",
  sent: "success",
  dry_run: "success",
  blocked: "error",
  pending_approval: "waiting_approval",
};

export function mapTmuxPaneStateToAgentState(state: string): AgentState {
  const normalized = state.toLowerCase().trim();
  const exact = TMUX_STATE_TO_AGENT_STATE[normalized];
  if (exact) return exact;
  // 서술형 시드 상태("chat active"·"watch only"·"guarding" 등)는 아래 휴리스틱으로 폴백한다.
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("blocked")) return "error";
  if (normalized.includes("approval") || normalized.includes("gated") || normalized.includes("pending")) return "waiting_approval";
  if (normalized.includes("dispatch") || normalized.includes("running")) return "responding";
  if (normalized.includes("active") || normalized.includes("guard") || normalized.includes("recommended")) return "working";
  if (normalized.includes("ready") || normalized.includes("recorded") || normalized.includes("sent")) return "success";
  return "idle";
}

/**
 * 함대 카운트 집계: "작업"은 진행 상태(working/responding)만 센다.
 * 완료(success/done)·유휴(idle)는 "작업"에서 제외한다(스펙 §2.4 "작업 카운트 done 제외").
 */
export function summarizeTmuxFleetCounts(states: AgentState[]): { active: number; pending: number; error: number } {
  let active = 0;
  let pending = 0;
  let error = 0;
  for (const state of states) {
    if (state === "working" || state === "responding") active += 1;
    else if (state === "waiting_approval") pending += 1;
    else if (state === "error") error += 1;
  }
  return { active, pending, error };
}

function getInitials(name: string): string {
  return name.replace(/[^A-Za-z가-힣]/g, "").slice(0, 2).toUpperCase() || "AG";
}
