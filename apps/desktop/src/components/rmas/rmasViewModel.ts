import type {
  ProviderProfile,
  RmasAcceptanceCriterion,
  RmasAgentLiveStatus,
  RmasAgentSlotConfig,
  RmasExhaustedReason,
  RmasPattern,
  RmasRunConfig,
  RmasRunRecord,
  RmasRunStatus,
  RmasRunSummary,
  RmasTraceEvent,
} from "@ai-orchestrator/protocol";

/**
 * Pure view-model helpers for the RMAS goal-loop dashboard. No React, no
 * network, no localStorage side effects in the top-level exports (persistence
 * helpers below guard `window`). Kept separate so the fold/format/mapping logic
 * is unit-testable without a DOM.
 */

// ── Patterns ──────────────────────────────────────────────────────────────────

export const RMAS_PATTERNS: RmasPattern[] = ["sequential", "mixture", "distillation", "deliberation"];

/** English tab labels, kept per the reference screenshot. */
export const PATTERN_LABEL: Record<RmasPattern, string> = {
  sequential: "Sequential",
  mixture: "Mixture",
  distillation: "Distillation",
  deliberation: "Deliberation",
};

/** One-line Korean description shown under the agent rail. */
export const PATTERN_DESCRIPTION: Record<RmasPattern, string> = {
  sequential: "계획자 → 비평가 → 해결사 순서로 처리",
  mixture: "여러 제안자가 동시에 초안을 만들고 취합자가 하나로 병합",
  distillation: "생산자가 상세 초안을 만들고 증류자가 압축·정제",
  deliberation: "여러 에이전트가 토론하며 합의로 수렴",
};

// ── Agent status dots ───────────────────────────────────────────────────────

export type AgentDotTone = "idle" | "thinking" | "done" | "error";
export type AgentDotMeta = { tone: AgentDotTone; className: string; label: string };

const DOT_BASE = "inline-block h-2.5 w-2.5 rounded-full";

/** idle=gray, thinking=pulsing blue, done=green, error=red (Tailwind utilities). */
export function agentDotMeta(status: RmasAgentLiveStatus | undefined): AgentDotMeta {
  switch (status) {
    case "thinking":
      return { tone: "thinking", className: `${DOT_BASE} bg-sky-400 animate-pulse`, label: "생각 중" };
    case "done":
      return { tone: "done", className: `${DOT_BASE} bg-emerald-500`, label: "완료" };
    case "error":
      return { tone: "error", className: `${DOT_BASE} bg-red-500`, label: "오류" };
    case "idle":
    default:
      return { tone: "idle", className: `${DOT_BASE} bg-muted-foreground/40`, label: "대기" };
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** 전체 숫자 표기 (만/억 축약 금지) — 프로젝트 금액표기 규칙과 동일. */
export function formatTokenCount(value: number | undefined): string {
  return Math.max(0, Math.round(value ?? 0)).toLocaleString();
}

/** mm:ss elapsed timer. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Elapsed ms from a run record: end−start when finished, now−start while live. */
export function elapsedMsFor(record: Pick<RmasRunRecord, "startedAt" | "endedAt"> | null, nowMs: number): number {
  if (!record?.startedAt) return 0;
  const start = Date.parse(record.startedAt);
  if (Number.isNaN(start)) return 0;
  const end = record.endedAt ? Date.parse(record.endedAt) : nowMs;
  return Math.max(0, end - start);
}

// ── Run status ──────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: ReadonlySet<RmasRunStatus> = new Set([
  "completed",
  "exhausted",
  "stopped",
  "interrupted",
  "failed",
]);

export function isTerminalStatus(status: RmasRunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status);
}

export function isRunningStatus(status: RmasRunStatus | undefined): boolean {
  return status === "running" || status === "queued";
}

const EXHAUSTED_REASON_LABEL: Record<RmasExhaustedReason, string> = {
  max_iterations: "반복 한도",
  max_tokens: "토큰 한도",
  wall_clock: "시간 한도",
};

export type TerminalBanner = { tone: "success" | "warning" | "danger"; title: string };

/** Terminal banner shown at the top of the feed once a run ends (else null). */
export function terminalBannerFor(record: RmasRunRecord | null): TerminalBanner | null {
  if (!record) return null;
  switch (record.status) {
    case "completed":
      return { tone: "success", title: "수용된 최종 산출물 표시" };
    case "exhausted":
      return {
        tone: "warning",
        title: `실행 소진 · ${record.exhaustedReason ? EXHAUSTED_REASON_LABEL[record.exhaustedReason] : "한도 도달"}`,
      };
    case "stopped":
      return { tone: "warning", title: "사용자 중지" };
    case "interrupted":
      return { tone: "warning", title: "서버 재시작으로 중단" };
    case "failed":
      return { tone: "danger", title: "실행 실패" };
    default:
      return null;
  }
}

/** Newest running/queued run to auto-reattach to (summaries are newest-first). */
export function pickReattachRun(summaries: ReadonlyArray<RmasRunSummary>): RmasRunSummary | undefined {
  return summaries.find((summary) => isRunningStatus(summary.status));
}

// ── Trace feed fold ─────────────────────────────────────────────────────────

/**
 * Merge one live trace event into the feed: dedupe by `id` (snapshot + live
 * increments can overlap on reattach) and keep the list ordered by createdAt,
 * then id, so late/out-of-order arrivals still land in place.
 */
export function mergeTraceEvent(
  list: ReadonlyArray<RmasTraceEvent>,
  event: RmasTraceEvent,
): RmasTraceEvent[] {
  const next = list.filter((existing) => existing.id !== event.id);
  next.push(event);
  next.sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
  return next;
}

/** Replace the feed with a snapshot (already ordered by the server), deduped. */
export function foldTraceSnapshot(events: ReadonlyArray<RmasTraceEvent>): RmasTraceEvent[] {
  const byId = new Map<string, RmasTraceEvent>();
  for (const event of events) byId.set(event.id, event);
  return Array.from(byId.values()).sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

// ── Settings (agent slots + pattern + budgets + criteria) ─────────────────────

/**
 * The persisted dashboard settings. Wall-clock is stored in MINUTES for the UI
 * (제한 시간(분)); it is converted to ms only when assembling the run config.
 */
export type RmasBudgetSettings = {
  maxIterations: number;
  maxTotalTokens: number;
  wallClockMinutes: number;
  maxParallel: number;
};

export type RmasSettings = {
  pattern: RmasPattern;
  agents: RmasAgentSlotConfig[];
  budgets: RmasBudgetSettings;
  acceptanceCriteria: RmasAcceptanceCriterion[];
  judgeSlotId?: string;
};

export const DEFAULT_BUDGET_SETTINGS: RmasBudgetSettings = {
  maxIterations: 5,
  maxTotalTokens: 200_000,
  wallClockMinutes: 30,
  maxParallel: 3,
};

const DEFAULT_SYSTEM_PROMPTS: Record<"planner" | "critic" | "solver", string> = {
  planner: "You are a strategic planner. Analyze the task and create a detailed step-by-step plan.",
  critic:
    "You are a critical reviewer. Identify flaws, gaps, and risks in the plan or draft, and give concrete, actionable feedback for improvement.",
  solver:
    "You are an expert solver. Using the plan and the critique, produce the final, complete solution that satisfies the goal.",
};

/**
 * Provider/model discovery: the dashboard reuses the app's already-plumbed
 * `providerProfiles` + `modelCatalog` (the same source CodingWorkbench reads —
 * there is no separate RMAS discovery endpoint). Defaults pick the first
 * enabled provider and its default model; off-allowlist picks surface honestly
 * as `rmas.agent.error` at run time.
 */
export function pickDefaultProvider(providers: ReadonlyArray<ProviderProfile>): {
  providerProfileId: string;
  modelId: string;
} {
  const provider = providers.find((candidate) => candidate.enabled) ?? providers[0];
  return {
    providerProfileId: provider?.id ?? "provider_dgx02_vllm",
    modelId: provider?.defaultModel ?? "",
  };
}

export function generateSlotId(prefix = "slot"): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/** Classic 3-slot Planner/Critic/Solver default, bound to the first provider. */
export function buildDefaultSettings(providers: ReadonlyArray<ProviderProfile>): RmasSettings {
  const provider = pickDefaultProvider(providers);
  const slot = (kind: "planner" | "critic" | "solver", name: string): RmasAgentSlotConfig => ({
    id: `slot_${kind}`,
    name,
    kind,
    providerProfileId: provider.providerProfileId,
    modelId: provider.modelId,
    systemPrompt: DEFAULT_SYSTEM_PROMPTS[kind],
    enabled: true,
  });
  return {
    pattern: "sequential",
    agents: [slot("planner", "Planner"), slot("critic", "Critic"), slot("solver", "Solver")],
    budgets: { ...DEFAULT_BUDGET_SETTINGS },
    acceptanceCriteria: [],
    judgeSlotId: "slot_critic",
  };
}

/** Assemble a validated-shape run config from settings + the goal textarea. */
export function buildRunConfig(settings: RmasSettings, goal: string): RmasRunConfig {
  return {
    goal,
    pattern: settings.pattern,
    agents: settings.agents,
    budgets: {
      maxIterations: settings.budgets.maxIterations,
      maxTotalTokens: settings.budgets.maxTotalTokens,
      wallClockMs: Math.round(settings.budgets.wallClockMinutes * 60_000),
      maxParallel: settings.budgets.maxParallel,
    },
    acceptanceCriteria: settings.acceptanceCriteria,
    ...(settings.judgeSlotId ? { judgeSlotId: settings.judgeSlotId } : {}),
  };
}

// ── Settings persistence (localStorage) ───────────────────────────────────────

const SETTINGS_STORAGE_KEY = "aol.rmas.settings.v1";

export function loadRmasSettings(providers: ReadonlyArray<ProviderProfile>): RmasSettings {
  const fallback = buildDefaultSettings(providers);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<RmasSettings>;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      pattern: parsed.pattern ?? fallback.pattern,
      agents: Array.isArray(parsed.agents) && parsed.agents.length > 0 ? parsed.agents : fallback.agents,
      budgets: { ...fallback.budgets, ...(parsed.budgets ?? {}) },
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
      judgeSlotId: parsed.judgeSlotId ?? fallback.judgeSlotId,
    };
  } catch {
    return fallback;
  }
}

export function saveRmasSettings(settings: RmasSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage 불가 환경(프라이빗 모드 등)은 세션 한정으로 진행
  }
}
