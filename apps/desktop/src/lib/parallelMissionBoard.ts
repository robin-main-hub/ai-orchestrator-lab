import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import type { LoopStatus } from "./closedLoopController";
import type { ParallelMissionSpec } from "./parallelAutonomy";
import type { MissionResult, MissionUpdate } from "./parallelMissions";
import type { SummonContext } from "./personaSummon";
import { headerOnlyPersona, parseVerificationSteps } from "./autonomyRunForm";
import type { AutonomyStepRow } from "./autonomyTimeline";

/**
 * Pure form + board model for the parallel mission console (the Manus/Kimi-style
 * multi-terminal board). Lives outside React so the queue→spec assembly and the
 * live board reducer are unit-tested directly — the desktop has no DOM test env,
 * so components are only checked via static markup.
 */

export type ParallelMissionDraft = {
  id: string;
  personaName: string;
  role: TmuxPaneRole;
  goal: string;
  /** newline-separated verification plan */
  verificationStepsText: string;
  kickoffTask?: string;
};

export type DraftVerdict = { ok: boolean; reason?: string };

export function isDraftRunnable(draft: ParallelMissionDraft): DraftVerdict {
  if (!draft.personaName.trim()) return { ok: false, reason: "페르소나 이름이 필요합니다" };
  if (!draft.goal.trim()) return { ok: false, reason: "목표(goal)가 필요합니다" };
  if (parseVerificationSteps(draft.verificationStepsText).length === 0) {
    return { ok: false, reason: "검증 단계가 최소 1개 필요합니다" };
  }
  return { ok: true };
}

/** True only when there is at least one draft and every draft is runnable. */
export function areDraftsRunnable(drafts: ReadonlyArray<ParallelMissionDraft>): DraftVerdict {
  if (drafts.length === 0) return { ok: false, reason: "미션을 최소 1개 추가하세요" };
  for (const draft of drafts) {
    const verdict = isDraftRunnable(draft);
    if (!verdict.ok) return { ok: false, reason: `${draft.personaName || draft.id}: ${verdict.reason}` };
  }
  return { ok: true };
}

export function buildMissionSpecs(
  drafts: ReadonlyArray<ParallelMissionDraft>,
  deps: {
    sessionId: string;
    personaFor?: (personaName: string) => LoadedPersona;
  },
): ParallelMissionSpec[] {
  return drafts.map((draft) => {
    const personaName = draft.personaName.trim();
    return {
      id: draft.id,
      summon: { personaName, sessionId: `${deps.sessionId}_${draft.id}`, preferredRole: draft.role },
      persona: deps.personaFor?.(personaName) ?? headerOnlyPersona(personaName),
      packet: {
        goal: draft.goal.trim(),
        context: [],
        decisions: [],
        rejectedOptions: [],
        constraints: [],
        filesToInspect: [],
        implementationPlan: [],
        verificationPlan: parseVerificationSteps(draft.verificationStepsText),
        reviewerNotes: [],
      },
      kickoffTask: draft.kickoffTask?.trim() || undefined,
    };
  });
}

export type BoardCardStatus = "queued" | "running" | "done" | "rejected";

export type ParallelBoardCard = {
  id: string;
  personaName: string;
  role: TmuxPaneRole;
  goal: string;
  status: BoardCardStatus;
  loopStatus?: LoopStatus;
  /** allocation rejection reason, when status === "rejected" */
  rejection?: "no_free_pane" | "already_summoned";
  paneId?: string;
  /** isolated git worktree branch this mission works on, when workspace isolation is enabled */
  branch?: string;
  steps: AutonomyStepRow[];
};

export type ParallelBoard = { cards: ParallelBoardCard[] };

export function createParallelBoard(drafts: ReadonlyArray<ParallelMissionDraft>): ParallelBoard {
  return {
    cards: drafts.map((draft) => ({
      id: draft.id,
      personaName: draft.personaName.trim() || draft.id,
      role: draft.role,
      goal: draft.goal.trim(),
      status: "queued",
      steps: [],
    })),
  };
}

function patchCard(board: ParallelBoard, id: string, patch: (card: ParallelBoardCard) => ParallelBoardCard): ParallelBoard {
  return { cards: board.cards.map((card) => (card.id === id ? patch(card) : card)) };
}

/** tag a mission's card with its isolated worktree branch. */
export function applyMissionBranch(board: ParallelBoard, missionId: string, branch: string): ParallelBoard {
  return patchCard(board, missionId, (card) => ({ ...card, branch }));
}

/** running/done phase transition from the live mission stream. */
export function applyMissionUpdate(board: ParallelBoard, update: MissionUpdate): ParallelBoard {
  return patchCard(board, update.missionId, (card) => {
    if (update.phase === "running") return { ...card, status: "running" };
    return { ...card, status: "done", loopStatus: update.loopStatus ?? card.loopStatus };
  });
}

/** append a closed-loop step row to a mission's terminal feed. */
export function applyMissionStep(board: ParallelBoard, missionId: string, row: AutonomyStepRow): ParallelBoard {
  return patchCard(board, missionId, (card) => ({ ...card, steps: [...card.steps, row] }));
}

/** fold the final allocation/loop results (rejections + pane bindings). */
export function applyMissionResults(board: ParallelBoard, results: ReadonlyArray<MissionResult>): ParallelBoard {
  let next = board;
  for (const result of results) {
    next = patchCard(next, result.missionId, (card) =>
      result.ok
        ? { ...card, status: "done", loopStatus: result.loopStatus, paneId: result.session.paneId }
        : { ...card, status: "rejected", rejection: result.reason },
    );
  }
  return next;
}

export type BoardSummary = { total: number; completed: number; failed: number; awaiting: number; rejected: number; running: number };

export function summarizeBoard(board: ParallelBoard): BoardSummary {
  const summary: BoardSummary = { total: board.cards.length, completed: 0, failed: 0, awaiting: 0, rejected: 0, running: 0 };
  for (const card of board.cards) {
    if (card.status === "rejected") summary.rejected += 1;
    else if (card.status === "running" || card.status === "queued") summary.running += 1;
    else if (card.loopStatus === "completed") summary.completed += 1;
    else if (card.loopStatus === "failed") summary.failed += 1;
    else if (card.loopStatus === "awaiting_human") summary.awaiting += 1;
  }
  return summary;
}

let draftSeq = 0;
/** deterministic-ish unique draft id (no Date.now/Math.random in this codebase). */
export function nextDraftId(prefix = "m"): string {
  draftSeq += 1;
  return `${prefix}${draftSeq}`;
}

export function emptyDraft(role: TmuxPaneRole = "code"): ParallelMissionDraft {
  return {
    id: nextDraftId(),
    personaName: "",
    role,
    goal: "",
    verificationStepsText: "pnpm typecheck\npnpm test\npnpm build",
  };
}

export type { SummonContext };
