import { z } from "zod";
import { redactTracePreview } from "./missionBoard.js";
import type { EventEnvelope } from "./index.js";

/**
 * RecursiveMAS-style Autonomous Goal Loop — config model, event vocabulary,
 * materialized run record, and trace projections. All DERIVED (pure) from a
 * stream of `EventEnvelope`s persisted on the existing EventStorage. No second
 * storage: the `rmas.run.created` event carries the config (source of truth),
 * exactly like `mission.created` carries the mission.
 *
 * Honesty invariants (kept from the rest of this project):
 *   - a run reports "goal achieved" (`completed`) only through a recorded
 *     `rmas.judge.evaluated{accepted:true}` verdict with criteria coverage;
 *   - agent failures are surfaced (perAgentStatus "error" + `agentErrors`),
 *     never silently dropped;
 *   - trace previews are redacted (no raw secrets/logs).
 */

// ── §2 Config model ───────────────────────────────────────────────────────────

export const rmasPatternSchema = z.enum(["sequential", "mixture", "distillation", "deliberation"]);
export type RmasPattern = z.infer<typeof rmasPatternSchema>;

export const rmasSlotKindSchema = z.enum([
  "planner",
  "critic",
  "solver", // Sequential
  "aggregator", // Mixture merge
  "producer",
  "distiller", // Distillation
  "custom",
]);
export type RmasSlotKind = z.infer<typeof rmasSlotKindSchema>;

/** One configurable role-agent = provider+model+system prompt+toggle. */
export const rmasAgentSlotConfigSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(120), // display, Korean allowed
  kind: rmasSlotKindSchema.default("custom"),
  providerProfileId: z.string().min(1).max(256),
  modelId: z.string().min(1).max(256),
  systemPrompt: z.string().max(20_000).default(""),
  enabled: z.boolean().default(true),
});
export type RmasAgentSlotConfig = z.infer<typeof rmasAgentSlotConfigSchema>;

export const rmasBudgetsSchema = z.object({
  maxIterations: z.number().int().positive().max(50).default(6),
  maxTotalTokens: z.number().int().positive().max(5_000_000).default(300_000),
  wallClockMs: z
    .number()
    .int()
    .positive()
    .max(6 * 60 * 60_000)
    .default(30 * 60_000),
  /** fan-out cap for Mixture / parallel calls (GPU contention guard) */
  maxParallel: z.number().int().positive().max(8).default(3),
});
export type RmasBudgets = z.infer<typeof rmasBudgetsSchema>;

export const rmasAcceptanceCriterionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(2_000),
});
export type RmasAcceptanceCriterion = z.infer<typeof rmasAcceptanceCriterionSchema>;

export const rmasRunConfigSchema = z.object({
  goal: z.string().min(1).max(180_000), // RFP-sized; < providerCompletionMessage cap 200k
  pattern: rmasPatternSchema,
  agents: z.array(rmasAgentSlotConfigSchema).min(1).max(12),
  budgets: rmasBudgetsSchema.default({}),
  acceptanceCriteria: z.array(rmasAcceptanceCriterionSchema).max(40).default([]),
  /** which slot is the judge; default = first enabled slot of kind "critic", else last enabled slot */
  judgeSlotId: z.string().max(128).optional(),
  createdBy: z.string().max(64).optional(),
});
export type RmasRunConfig = z.infer<typeof rmasRunConfigSchema>;

// ── §3.1 Event vocabulary ─────────────────────────────────────────────────────

export const rmasRunEventTypeSchema = z.enum([
  "rmas.run.created", // { config }
  "rmas.run.started",
  "rmas.iteration.started", // { iteration }
  "rmas.agent.started", // { slotId, name, kind, iteration }  → drives "thinking" dot
  "rmas.agent.message", // { slotId, name, kind, iteration, content, usage }
  "rmas.agent.error", // { slotId, reason, iteration? }  → surfaces provider/allowlist failures
  "rmas.tokens.tallied", // { input, output, total }  cumulative
  "rmas.judge.evaluated", // { iteration, accepted, score?, perCriterion, feedback }
  "rmas.iteration.completed", // { iteration, accepted }
  "rmas.run.completed", // { accepted, finalOutput, iterations, tokens }
  "rmas.run.exhausted", // { reason, bestOutput?, tokens }
  "rmas.run.stopped", // { by:"user" }
  "rmas.run.interrupted", // { reason:"server_restart" }
]);
export type RmasRunEventType = z.infer<typeof rmasRunEventTypeSchema>;

const rmasUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});
export type RmasUsage = z.infer<typeof rmasUsageSchema>;

const rmasTokensSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

const rmasPerCriterionSchema = z.object({
  id: z.string(),
  met: z.boolean(),
  note: z.string().optional(),
});

// Per-event payload schemas — used by BOTH deriveRmasRun (fold) and
// rmasTraceEventFromEnvelope (live increment) to validate untrusted payloads.
export const rmasRunCreatedPayloadSchema = z.object({ config: rmasRunConfigSchema });
export const rmasRunStartedPayloadSchema = z.object({}).passthrough();
export const rmasIterationStartedPayloadSchema = z.object({ iteration: z.number().int().positive() });
export const rmasAgentStartedPayloadSchema = z.object({
  slotId: z.string(),
  name: z.string(),
  kind: rmasSlotKindSchema,
  iteration: z.number().int().positive(),
});
export const rmasAgentMessagePayloadSchema = z.object({
  slotId: z.string(),
  name: z.string(),
  kind: rmasSlotKindSchema,
  iteration: z.number().int().positive(),
  content: z.string(),
  usage: rmasUsageSchema.optional(),
});
export const rmasAgentErrorPayloadSchema = z.object({
  slotId: z.string(),
  reason: z.string(),
  name: z.string().optional(),
  iteration: z.number().int().positive().optional(),
});
export const rmasTokensTalliedPayloadSchema = rmasTokensSchema;
export const rmasJudgeEvaluatedPayloadSchema = z.object({
  iteration: z.number().int().positive(),
  accepted: z.boolean(),
  score: z.number().optional(),
  perCriterion: z.array(rmasPerCriterionSchema),
  feedback: z.string(),
});
export const rmasIterationCompletedPayloadSchema = z.object({
  iteration: z.number().int().positive(),
  accepted: z.boolean(),
});
export const rmasRunCompletedPayloadSchema = z.object({
  accepted: z.boolean(),
  finalOutput: z.string(),
  iterations: z.number().int().nonnegative(),
  tokens: rmasTokensSchema,
});
export const rmasRunExhaustedReasonSchema = z.enum(["max_iterations", "max_tokens", "wall_clock"]);
export type RmasExhaustedReason = z.infer<typeof rmasRunExhaustedReasonSchema>;
export const rmasRunExhaustedPayloadSchema = z.object({
  reason: rmasRunExhaustedReasonSchema,
  bestOutput: z.string().optional(),
  tokens: rmasTokensSchema,
});
export const rmasRunStoppedPayloadSchema = z.object({ by: z.enum(["user"]) });
export const rmasRunInterruptedPayloadSchema = z.object({ reason: z.enum(["server_restart"]) });

// ── §3.2 Materialized record (derived, pure) ─────────────────────────────────

export type RmasRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "exhausted"
  | "stopped"
  | "interrupted"
  | "failed";
export type RmasAgentLiveStatus = "idle" | "thinking" | "done" | "error";

export type RmasMessage = {
  slotId: string;
  name: string;
  kind: RmasSlotKind;
  iteration: number;
  content: string;
  usage?: RmasUsage;
  createdAt: string;
};
export type RmasJudgeVerdict = {
  iteration: number;
  accepted: boolean;
  score?: number;
  perCriterion: Array<{ id: string; met: boolean; note?: string }>;
  feedback: string;
  createdAt: string;
};
export type RmasIteration = {
  index: number;
  startedAt: string;
  endedAt?: string;
  messages: RmasMessage[];
  verdict?: RmasJudgeVerdict;
  accepted: boolean;
};
export type RmasAgentError = {
  slotId: string;
  reason: string;
  iteration?: number;
  createdAt: string;
};
export type RmasRunRecord = {
  runId: string;
  config: RmasRunConfig;
  status: RmasRunStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  iterations: RmasIteration[];
  tokens: { input: number; output: number; total: number };
  perAgentStatus: Record<string, RmasAgentLiveStatus>; // live status dots
  /** honest failure surface — every rmas.agent.error, in order */
  agentErrors: RmasAgentError[];
  finalOutput?: string;
  exhaustedReason?: RmasExhaustedReason;
};

export type RmasRunSummary = {
  runId: string;
  status: RmasRunStatus;
  pattern: RmasPattern;
  goalPreview: string;
  iterations: number;
  tokens: { input: number; output: number; total: number };
  accepted: boolean;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
};

/** sessionId namespace for one run — `loadEvents()` filters by this. */
export function rmasSessionId(runId: string): string {
  return `rmas_${runId}`;
}

function emptyTokens(): { input: number; output: number; total: number } {
  return { input: 0, output: 0, total: 0 };
}

function currentIteration(record: RmasRunRecord, iteration: number): RmasIteration | undefined {
  // messages/verdicts reference their iteration by index; match on it, falling
  // back to the last open iteration for resilience against out-of-order emits.
  return record.iterations.find((it) => it.index === iteration) ?? record.iterations[record.iterations.length - 1];
}

/**
 * Fold the persisted events of one run into a materialized record. Pure over
 * the events — every timestamp comes from the envelope, never a clock. Returns
 * undefined if the run was never created.
 */
export function deriveRmasRun(events: ReadonlyArray<EventEnvelope>, runId: string): RmasRunRecord | undefined {
  const sessionId = rmasSessionId(runId);
  let record: RmasRunRecord | undefined;

  for (const envelope of events) {
    if (envelope.sessionId !== sessionId) continue;
    if (!envelope.type.startsWith("rmas.")) continue;
    const createdAt = envelope.createdAt;

    switch (envelope.type) {
      case "rmas.run.created": {
        const parsed = rmasRunCreatedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        const perAgentStatus: Record<string, RmasAgentLiveStatus> = {};
        for (const slot of parsed.data.config.agents) perAgentStatus[slot.id] = "idle";
        record = {
          runId,
          config: parsed.data.config,
          status: "queued",
          createdAt,
          iterations: [],
          tokens: emptyTokens(),
          perAgentStatus,
          agentErrors: [],
        };
        break;
      }
      case "rmas.run.started": {
        if (!record) break;
        record.status = "running";
        record.startedAt = createdAt;
        break;
      }
      case "rmas.iteration.started": {
        if (!record) break;
        const parsed = rmasIterationStartedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.iterations.push({
          index: parsed.data.iteration,
          startedAt: createdAt,
          messages: [],
          accepted: false,
        });
        break;
      }
      case "rmas.agent.started": {
        if (!record) break;
        const parsed = rmasAgentStartedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.perAgentStatus[parsed.data.slotId] = "thinking";
        break;
      }
      case "rmas.agent.message": {
        if (!record) break;
        const parsed = rmasAgentMessagePayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.perAgentStatus[parsed.data.slotId] = "done";
        const iteration = currentIteration(record, parsed.data.iteration);
        if (iteration) {
          iteration.messages.push({
            slotId: parsed.data.slotId,
            name: parsed.data.name,
            kind: parsed.data.kind,
            iteration: parsed.data.iteration,
            content: parsed.data.content,
            usage: parsed.data.usage,
            createdAt,
          });
        }
        break;
      }
      case "rmas.agent.error": {
        if (!record) break;
        const parsed = rmasAgentErrorPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.perAgentStatus[parsed.data.slotId] = "error";
        record.agentErrors.push({
          slotId: parsed.data.slotId,
          reason: parsed.data.reason,
          iteration: parsed.data.iteration,
          createdAt,
        });
        break;
      }
      case "rmas.tokens.tallied": {
        if (!record) break;
        const parsed = rmasTokensTalliedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.tokens = { input: parsed.data.input, output: parsed.data.output, total: parsed.data.total };
        break;
      }
      case "rmas.judge.evaluated": {
        if (!record) break;
        const parsed = rmasJudgeEvaluatedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        const iteration = currentIteration(record, parsed.data.iteration);
        if (iteration) {
          iteration.verdict = {
            iteration: parsed.data.iteration,
            accepted: parsed.data.accepted,
            score: parsed.data.score,
            perCriterion: parsed.data.perCriterion,
            feedback: parsed.data.feedback,
            createdAt,
          };
          iteration.accepted = parsed.data.accepted;
        }
        break;
      }
      case "rmas.iteration.completed": {
        if (!record) break;
        const parsed = rmasIterationCompletedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        const iteration = currentIteration(record, parsed.data.iteration);
        if (iteration) {
          iteration.endedAt = createdAt;
          iteration.accepted = parsed.data.accepted;
        }
        break;
      }
      case "rmas.run.completed": {
        if (!record) break;
        const parsed = rmasRunCompletedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.status = "completed";
        record.endedAt = createdAt;
        record.finalOutput = parsed.data.finalOutput;
        record.tokens = parsed.data.tokens;
        break;
      }
      case "rmas.run.exhausted": {
        if (!record) break;
        const parsed = rmasRunExhaustedPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) break;
        record.status = "exhausted";
        record.endedAt = createdAt;
        record.exhaustedReason = parsed.data.reason;
        record.finalOutput = parsed.data.bestOutput;
        record.tokens = parsed.data.tokens;
        break;
      }
      case "rmas.run.stopped": {
        if (!record) break;
        record.status = "stopped";
        record.endedAt = createdAt;
        break;
      }
      case "rmas.run.interrupted": {
        if (!record) break;
        record.status = "interrupted";
        record.endedAt = createdAt;
        break;
      }
      default:
        break;
    }
  }

  return record;
}

/** Summary list for the history endpoint — one row per run in the log. */
export function deriveRmasRunSummaries(events: ReadonlyArray<EventEnvelope>): RmasRunSummary[] {
  const runIds: string[] = [];
  const seen = new Set<string>();
  for (const envelope of events) {
    if (!envelope.type.startsWith("rmas.")) continue;
    if (!envelope.sessionId.startsWith("rmas_")) continue;
    const runId = envelope.sessionId.slice("rmas_".length);
    if (!runId || seen.has(runId)) continue;
    seen.add(runId);
    runIds.push(runId);
  }
  const summaries: RmasRunSummary[] = [];
  for (const runId of runIds) {
    const record = deriveRmasRun(events, runId);
    if (!record) continue;
    summaries.push({
      runId: record.runId,
      status: record.status,
      pattern: record.config.pattern,
      goalPreview: redactTracePreview(record.config.goal, 120) ?? "",
      iterations: record.iterations.length,
      tokens: record.tokens,
      accepted: record.status === "completed",
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
    });
  }
  summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return summaries;
}

// ── §3.3 Trace projection for SSE ────────────────────────────────────────────

export type RmasTraceSeverity = "info" | "success" | "warning" | "error";
export type RmasTraceEvent = {
  id: string;
  runId: string;
  slotId?: string;
  type: RmasRunEventType;
  severity: RmasTraceSeverity;
  title: string;
  summary: string;
  contentPreview?: string;
  createdAt: string;
};

// ── Per-event trace builders ──────────────────────────────────────────────────
// 같은 빌더를 두 곳에서 쓴다: deriveRmasTrace(materialized record 전체 스냅샷)와
// rmasTraceEventFromEnvelope(라이브 SSE 증분). 한 벌의 빌더로 묶어 스냅샷과
// 스트림이 절대 어긋나지 않게 한다 — 두 경로 모두 같은 원시값을 주입받아 같은
// trace 이벤트를 만들고, createdAt 오름차순으로 정렬하면 동일한 배열이 된다.
// 라이브 상태 채널(agent.started)과 카운터 채널(tokens.tallied)은 로그가 아니므로
// 두 경로 모두에서 trace 이벤트를 만들지 않는다(= 스냅샷/폴드에서 함께 제외).

const KIND_LABEL: Record<RmasSlotKind, string> = {
  planner: "플래너",
  critic: "비평가",
  solver: "해결사",
  aggregator: "취합자",
  producer: "생산자",
  distiller: "증류자",
  custom: "에이전트",
};

function runCreatedTrace(runId: string, config: RmasRunConfig, createdAt: string): RmasTraceEvent {
  return {
    id: `${runId}:created`,
    runId,
    type: "rmas.run.created",
    severity: "info",
    title: "실행 생성",
    summary: `패턴 ${config.pattern} · 에이전트 ${config.agents.length} · 수용기준 ${config.acceptanceCriteria.length}`,
    contentPreview: redactTracePreview(config.goal),
    createdAt,
  };
}

function runStartedTrace(runId: string, createdAt: string): RmasTraceEvent {
  return {
    id: `${runId}:started`,
    runId,
    type: "rmas.run.started",
    severity: "info",
    title: "실행 시작",
    summary: "자율 루프 시작",
    createdAt,
  };
}

function iterationStartedTrace(runId: string, iteration: number, createdAt: string): RmasTraceEvent {
  return {
    id: `${runId}:iter:${iteration}:started`,
    runId,
    type: "rmas.iteration.started",
    severity: "info",
    title: `— 반복 ${iteration} —`,
    summary: `반복 ${iteration} 시작`,
    createdAt,
  };
}

function agentMessageTrace(runId: string, msg: RmasMessage): RmasTraceEvent {
  return {
    id: `${runId}:iter:${msg.iteration}:msg:${msg.slotId}:${msg.createdAt}`,
    runId,
    slotId: msg.slotId,
    type: "rmas.agent.message",
    severity: "info",
    title: `${msg.name} · ${KIND_LABEL[msg.kind]}`,
    summary: `반복 ${msg.iteration}`,
    contentPreview: redactTracePreview(msg.content),
    createdAt: msg.createdAt,
  };
}

function agentErrorTrace(runId: string, err: RmasAgentError): RmasTraceEvent {
  return {
    id: `${runId}:err:${err.slotId}:${err.createdAt}`,
    runId,
    slotId: err.slotId,
    type: "rmas.agent.error",
    severity: "error",
    title: "에이전트 오류",
    summary: `${err.slotId} 실패`,
    contentPreview: redactTracePreview(err.reason),
    createdAt: err.createdAt,
  };
}

function judgeTrace(runId: string, verdict: RmasJudgeVerdict): RmasTraceEvent {
  const met = verdict.perCriterion.filter((c) => c.met).length;
  return {
    id: `${runId}:iter:${verdict.iteration}:judge`,
    runId,
    type: "rmas.judge.evaluated",
    severity: verdict.accepted ? "success" : "warning",
    title: `판정 · ${verdict.accepted ? "채택" : "수정 필요"}`,
    summary: `기준 ${met}/${verdict.perCriterion.length} 충족${verdict.score !== undefined ? ` · 점수 ${verdict.score}` : ""}`,
    contentPreview: redactTracePreview(verdict.feedback),
    createdAt: verdict.createdAt,
  };
}

function iterationCompletedTrace(runId: string, iteration: number, accepted: boolean, createdAt: string): RmasTraceEvent {
  return {
    id: `${runId}:iter:${iteration}:completed`,
    runId,
    type: "rmas.iteration.completed",
    severity: "info",
    title: `반복 ${iteration} 종료`,
    summary: accepted ? "채택" : "수정 필요 — 다음 반복",
    createdAt,
  };
}

function runCompletedTrace(
  runId: string,
  fields: { finalOutput?: string; iterations: number; total: number },
  createdAt: string,
): RmasTraceEvent {
  return {
    id: `${runId}:rmas.run.completed`,
    runId,
    type: "rmas.run.completed",
    severity: "success",
    title: "실행 완료",
    summary: `채택됨 · 반복 ${fields.iterations} · 총 ${fields.total} 토큰`,
    contentPreview: redactTracePreview(fields.finalOutput),
    createdAt,
  };
}

const EXHAUSTED_REASON_LABEL: Record<RmasExhaustedReason, string> = {
  max_iterations: "반복 한도",
  max_tokens: "토큰 한도",
  wall_clock: "시간 한도",
};

function runExhaustedTrace(
  runId: string,
  fields: { reason: RmasExhaustedReason; bestOutput?: string; total: number },
  createdAt: string,
): RmasTraceEvent {
  return {
    id: `${runId}:rmas.run.exhausted`,
    runId,
    type: "rmas.run.exhausted",
    severity: "warning",
    title: `실행 소진 · ${EXHAUSTED_REASON_LABEL[fields.reason]}`,
    summary: `종료 사유 ${EXHAUSTED_REASON_LABEL[fields.reason]} · 총 ${fields.total} 토큰`,
    contentPreview: redactTracePreview(fields.bestOutput),
    createdAt,
  };
}

function runStoppedTrace(runId: string, createdAt: string): RmasTraceEvent {
  return {
    id: `${runId}:rmas.run.stopped`,
    runId,
    type: "rmas.run.stopped",
    severity: "warning",
    title: "실행 중지",
    summary: "사용자 중지",
    createdAt,
  };
}

function runInterruptedTrace(runId: string, createdAt: string): RmasTraceEvent {
  return {
    id: `${runId}:rmas.run.interrupted`,
    runId,
    type: "rmas.run.interrupted",
    severity: "warning",
    title: "실행 중단",
    summary: "서버 재시작으로 중단",
    createdAt,
  };
}

/**
 * 재료 레코드에서 trace 타임라인을 파생한다(스냅샷 경로). 각 trace 이벤트의
 * createdAt은 해당 이벤트의 원시 타임스탬프(레코드에 그대로 저장됨)에서 오며,
 * 마지막에 createdAt 오름차순으로 정렬해 폴드 경로와 동일한 순서를 보장한다.
 */
export function deriveRmasTrace(record: RmasRunRecord): RmasTraceEvent[] {
  const events: RmasTraceEvent[] = [];
  events.push(runCreatedTrace(record.runId, record.config, record.createdAt));
  if (record.startedAt) events.push(runStartedTrace(record.runId, record.startedAt));
  for (const iteration of record.iterations) {
    events.push(iterationStartedTrace(record.runId, iteration.index, iteration.startedAt));
    for (const msg of iteration.messages) events.push(agentMessageTrace(record.runId, msg));
    if (iteration.verdict) events.push(judgeTrace(record.runId, iteration.verdict));
    if (iteration.endedAt) events.push(iterationCompletedTrace(record.runId, iteration.index, iteration.accepted, iteration.endedAt));
  }
  for (const err of record.agentErrors) events.push(agentErrorTrace(record.runId, err));
  if (record.endedAt) {
    switch (record.status) {
      case "completed":
        events.push(
          runCompletedTrace(
            record.runId,
            { finalOutput: record.finalOutput, iterations: record.iterations.length, total: record.tokens.total },
            record.endedAt,
          ),
        );
        break;
      case "exhausted":
        if (record.exhaustedReason) {
          events.push(
            runExhaustedTrace(
              record.runId,
              { reason: record.exhaustedReason, bestOutput: record.finalOutput, total: record.tokens.total },
              record.endedAt,
            ),
          );
        }
        break;
      case "stopped":
        events.push(runStoppedTrace(record.runId, record.endedAt));
        break;
      case "interrupted":
        events.push(runInterruptedTrace(record.runId, record.endedAt));
        break;
      default:
        break;
    }
  }
  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 하나의 rmas.* 이벤트 봉투를 단일 trace 이벤트로 매핑한다(라이브 SSE 증분 경로).
 * deriveRmasTrace와 같은 빌더를 쓰므로 스냅샷과 스트림이 항상 일치한다. payload는
 * 신뢰하지 않고 스키마로 재검증하며, 로그 대상이 아닌 이벤트(agent.started /
 * tokens.tallied)나 깨진 payload는 null(무시)을 돌려준다. runId는 sessionId
 * ("rmas_<runId>")에서 얻는다.
 */
export function rmasTraceEventFromEnvelope(envelope: {
  sessionId: string;
  type: string;
  payload: unknown;
  createdAt: string;
}): RmasTraceEvent | null {
  if (!envelope.sessionId.startsWith("rmas_")) return null;
  const runId = envelope.sessionId.slice("rmas_".length);
  if (!runId) return null;
  const createdAt = envelope.createdAt;

  switch (envelope.type) {
    case "rmas.run.created": {
      const parsed = rmasRunCreatedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? runCreatedTrace(runId, parsed.data.config, createdAt) : null;
    }
    case "rmas.run.started":
      return runStartedTrace(runId, createdAt);
    case "rmas.iteration.started": {
      const parsed = rmasIterationStartedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? iterationStartedTrace(runId, parsed.data.iteration, createdAt) : null;
    }
    case "rmas.agent.message": {
      const parsed = rmasAgentMessagePayloadSchema.safeParse(envelope.payload);
      return parsed.success
        ? agentMessageTrace(runId, {
            slotId: parsed.data.slotId,
            name: parsed.data.name,
            kind: parsed.data.kind,
            iteration: parsed.data.iteration,
            content: parsed.data.content,
            usage: parsed.data.usage,
            createdAt,
          })
        : null;
    }
    case "rmas.agent.error": {
      const parsed = rmasAgentErrorPayloadSchema.safeParse(envelope.payload);
      return parsed.success
        ? agentErrorTrace(runId, {
            slotId: parsed.data.slotId,
            reason: parsed.data.reason,
            iteration: parsed.data.iteration,
            createdAt,
          })
        : null;
    }
    case "rmas.judge.evaluated": {
      const parsed = rmasJudgeEvaluatedPayloadSchema.safeParse(envelope.payload);
      return parsed.success
        ? judgeTrace(runId, {
            iteration: parsed.data.iteration,
            accepted: parsed.data.accepted,
            score: parsed.data.score,
            perCriterion: parsed.data.perCriterion,
            feedback: parsed.data.feedback,
            createdAt,
          })
        : null;
    }
    case "rmas.iteration.completed": {
      const parsed = rmasIterationCompletedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? iterationCompletedTrace(runId, parsed.data.iteration, parsed.data.accepted, createdAt) : null;
    }
    case "rmas.run.completed": {
      const parsed = rmasRunCompletedPayloadSchema.safeParse(envelope.payload);
      return parsed.success
        ? runCompletedTrace(
            runId,
            { finalOutput: parsed.data.finalOutput, iterations: parsed.data.iterations, total: parsed.data.tokens.total },
            createdAt,
          )
        : null;
    }
    case "rmas.run.exhausted": {
      const parsed = rmasRunExhaustedPayloadSchema.safeParse(envelope.payload);
      return parsed.success
        ? runExhaustedTrace(runId, { reason: parsed.data.reason, bestOutput: parsed.data.bestOutput, total: parsed.data.tokens.total }, createdAt)
        : null;
    }
    case "rmas.run.stopped": {
      const parsed = rmasRunStoppedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? runStoppedTrace(runId, createdAt) : null;
    }
    case "rmas.run.interrupted": {
      const parsed = rmasRunInterruptedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? runInterruptedTrace(runId, createdAt) : null;
    }
    // 로그가 아닌 라이브 상태/카운터 채널 — 스냅샷에서도 만들지 않으므로 함께 제외.
    case "rmas.agent.started":
    case "rmas.tokens.tallied":
      return null;
    default:
      return null;
  }
}
