import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import type { StatusBadgeVariant } from "@/ui/status-badge";
import type { AutonomyMode, RunAutonomousPersonaTaskInput } from "./autonomousRun";
import type { LoopStatus } from "./closedLoopController";
import { createSummonRegistry, type SummonContext } from "./personaSummon";
import { isAutoApprovableCommand } from "./safeCommandPolicy";

/**
 * Pure form model + input assembly for the Autonomy Run panel. Keeps all the
 * "turn UI fields into a runAutonomousPersonaTask input" logic out of the React
 * component so it can be unit-tested directly (the desktop has no DOM test
 * environment — components are checked via static markup only).
 */

export type AutonomyRunForm = {
  personaName: string;
  role: TmuxPaneRole;
  goal: string;
  /** newline-separated verification plan steps */
  verificationStepsText: string;
  mode: AutonomyMode;
};

export const DEFAULT_AUTONOMY_FORM: AutonomyRunForm = {
  personaName: "",
  role: "qa",
  goal: "",
  verificationStepsText: "",
  // 완전 자동이 기본 — "목적만 주면 끝까지 자율완주". 사람 승인 게이트 없음(예산상한+중지버튼만).
  mode: "full_auto",
};

/** The pane roster the panel summons into until dynamic roles land. */
export const DEFAULT_SWARM_PANES: ReadonlyArray<{ paneId: string; role: TmuxPaneRole }> = [
  { paneId: "role:code", role: "code" },
  { paneId: "role:architect", role: "architect" },
  { paneId: "role:frontend", role: "frontend" },
  { paneId: "role:backend", role: "backend" },
  { paneId: "role:qa", role: "qa" },
  { paneId: "role:research", role: "research" },
  { paneId: "role:memory", role: "memory" },
];

export const SELECTABLE_PANE_ROLES: ReadonlyArray<TmuxPaneRole> = DEFAULT_SWARM_PANES.map((pane) => pane.role);

export function parseVerificationSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type RunnableVerdict = { ok: boolean; reason?: string };

/**
 * auto_safe 모드에서 자동승인되지 못할 검증 단계 목록. 입력 시점에 보여줘
 * "실행이 조용히 사람 승인 대기에 빠지는" 함정을 미리 알린다.
 */
export function nonAutoApprovableSteps(form: AutonomyRunForm): string[] {
  if (form.mode !== "auto_safe") {
    return [];
  }
  return parseVerificationSteps(form.verificationStepsText).filter(
    (step) => !isAutoApprovableCommand(step).allowed,
  );
}

export function isRunnable(form: AutonomyRunForm): RunnableVerdict {
  if (!form.personaName.trim()) {
    return { ok: false, reason: "페르소나 이름이 필요합니다" };
  }
  if (!form.goal.trim()) {
    return { ok: false, reason: "목표(goal)가 필요합니다" };
  }
  if (parseVerificationSteps(form.verificationStepsText).length === 0) {
    return { ok: false, reason: "검증 단계가 최소 1개 필요합니다" };
  }
  return { ok: true };
}

/**
 * Header-only persona used until real `agents/<name>/*.md` loading is wired in
 * the renderer. `buildPersonaInjectionPlan` falls back to a header line, so the
 * pane still gets an explicit identity tag.
 */
export function headerOnlyPersona(personaName: string): LoadedPersona {
  return { personaName, mode: "off", fragments: [], safetyContent: null };
}

export function buildAutonomyRunInput(
  form: AutonomyRunForm,
  deps: {
    sessionId: string;
    ctx: SummonContext;
    panes?: ReadonlyArray<{ paneId: string; role: TmuxPaneRole }>;
    persona?: LoadedPersona;
    server?: RunAutonomousPersonaTaskInput["server"];
    now?: () => string;
    maxIterations?: number;
    runId?: string;
    onStep?: RunAutonomousPersonaTaskInput["onStep"];
    /** reuse a persistent registry (shared pane pool) instead of a fresh one per run */
    registry?: RunAutonomousPersonaTaskInput["registry"];
    /** persona's atomic agent set: fresh Hermes session boot + declared role travel with the soul */
    agentSet?: RunAutonomousPersonaTaskInput["agentSet"];
    /** optional lorebook/world-info fragment appended to the identity injection */
    worldInfo?: string;
  },
): RunAutonomousPersonaTaskInput {
  const personaName = form.personaName.trim();
  const panes = deps.panes ?? DEFAULT_SWARM_PANES;
  return {
    registry: deps.registry ?? createSummonRegistry(panes.map((pane) => ({ paneId: pane.paneId, role: pane.role }))),
    summon: { personaName, sessionId: deps.sessionId, preferredRole: form.role },
    persona: deps.persona ?? headerOnlyPersona(personaName),
    packet: {
      goal: form.goal.trim(),
      context: [],
      decisions: [],
      rejectedOptions: [],
      constraints: [],
      filesToInspect: [],
      implementationPlan: [],
      verificationPlan: parseVerificationSteps(form.verificationStepsText),
      reviewerNotes: [],
    },
    ctx: deps.ctx,
    mode: form.mode,
    server: deps.server,
    now: deps.now,
    maxIterations: deps.maxIterations,
    runId: deps.runId,
    onStep: deps.onStep,
    agentSet: deps.agentSet,
    worldInfo: deps.worldInfo,
  };
}

export function loopStatusLabel(status: LoopStatus): string {
  switch (status) {
    case "completed":
      return "완료";
    case "failed":
      return "실패";
    case "awaiting_human":
      return "사람 승인 대기";
    case "running":
    default:
      return "실행 중";
  }
}

export function loopStatusBadgeVariant(status: LoopStatus): StatusBadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "awaiting_human":
      return "warning";
    case "running":
    default:
      return "primary";
  }
}

export function modeLabel(mode: AutonomyMode): string {
  switch (mode) {
    case "full_auto":
      return "완전 자동";
    case "auto_safe":
      return "safe 자동승인";
    case "human":
    default:
      return "사람 승인";
  }
}
