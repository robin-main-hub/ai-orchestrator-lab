import { describe, expect, it } from "vitest";
import type {
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  RmasAcceptanceCriterion,
} from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "../debateEngine.js";
import type { RmasEmit } from "./patterns.js";
import { evaluateGoalAcceptance, parseJudgeVerdict } from "./judge.js";

const CRITERIA: RmasAcceptanceCriterion[] = [
  { id: "k1", text: "예산 표를 포함한다" },
  { id: "k2", text: "납기 일정을 명시한다" },
];

function fenced(json: string): string {
  return "판정 결과:\n```json\n" + json + "\n```\n끝.";
}

function makeComplete(content: string): LlmCompletionFn {
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => ({
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status: "succeeded",
    content,
    createdAt: request.createdAt,
  });
}

describe("parseJudgeVerdict", () => {
  it("accepts when every criterion is met (good JSON)", () => {
    const verdict = parseJudgeVerdict(
      fenced('{"perCriterion":[{"id":"k1","met":true},{"id":"k2","met":true}],"score":0.9,"feedback":"좋음"}'),
      CRITERIA,
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.perCriterion).toHaveLength(2);
    expect(verdict.score).toBe(0.9);
  });

  it("rejects when any criterion is unmet", () => {
    const verdict = parseJudgeVerdict(
      fenced('{"perCriterion":[{"id":"k1","met":true},{"id":"k2","met":false,"note":"납기 누락"}],"feedback":"수정"}'),
      CRITERIA,
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.perCriterion.find((p) => p.id === "k2")?.met).toBe(false);
  });

  it("treats missing criteria coverage as unmet (accept requires ALL)", () => {
    const verdict = parseJudgeVerdict(fenced('{"perCriterion":[{"id":"k1","met":true}],"feedback":"부분"}'), CRITERIA);
    expect(verdict.accepted).toBe(false); // k2 defaulted to met:false
  });

  it("falls back to a revise verdict on malformed JSON (never throws)", () => {
    const raw = fenced("{ this is not valid json ]");
    const verdict = parseJudgeVerdict(raw, CRITERIA);
    expect(verdict.accepted).toBe(false);
    expect(verdict.perCriterion).toEqual([]);
    expect(verdict.feedback).toBe(raw); // raw text preserved
  });

  it("falls back to a revise verdict when there is no fenced block", () => {
    const verdict = parseJudgeVerdict("그냥 산문일 뿐, JSON 없음", CRITERIA);
    expect(verdict.accepted).toBe(false);
    expect(verdict.feedback).toContain("산문");
  });

  it("uses the holistic accepted flag when there are no criteria", () => {
    expect(parseJudgeVerdict(fenced('{"accepted":true,"feedback":"종합 통과"}'), []).accepted).toBe(true);
    expect(parseJudgeVerdict(fenced('{"accepted":false,"feedback":"미흡"}'), []).accepted).toBe(false);
  });
});

describe("evaluateGoalAcceptance", () => {
  it("runs one judge call, emits rmas.judge.evaluated, and returns the verdict", async () => {
    const emitted: Array<{ type: string; payload: unknown }> = [];
    const emit: RmasEmit = async (event) => {
      emitted.push({ type: event.type, payload: event.payload });
    };
    let idN = 0;
    const verdict = await evaluateGoalAcceptance({
      sessionId: "rmas_run_1",
      goal: "제안서를 작성한다",
      criteria: CRITERIA,
      candidate: "예산 표와 납기 일정을 포함한 최종안",
      judgeSlot: { id: "c1", name: "비평가", kind: "critic", providerProfileId: "provider_dgx02_vllm", modelId: "qwen", systemPrompt: "", enabled: true },
      iteration: 2,
      complete: makeComplete(fenced('{"perCriterion":[{"id":"k1","met":true},{"id":"k2","met":true}],"feedback":"통과"}')),
      emit,
      signal: new AbortController().signal,
      now: () => new Date("2026-07-09T00:00:00.000Z"),
      generateId: () => `id_${(idN += 1)}`,
    });
    expect(verdict.accepted).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.type).toBe("rmas.judge.evaluated");
    expect((emitted[0]!.payload as { accepted: boolean; iteration: number }).accepted).toBe(true);
    expect((emitted[0]!.payload as { iteration: number }).iteration).toBe(2);
  });

  it("returns a revise verdict (not throw) when the judge call fails", async () => {
    const emitted: Array<{ type: string }> = [];
    const failing: LlmCompletionFn = async (request) => ({
      id: "r",
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: request.routePreference,
      status: "failed",
      error: "provider down",
      createdAt: request.createdAt,
    });
    const verdict = await evaluateGoalAcceptance({
      sessionId: "rmas_run_1",
      goal: "g",
      criteria: CRITERIA,
      candidate: "c",
      judgeSlot: { id: "c1", name: "비평가", kind: "critic", providerProfileId: "p", modelId: "m", systemPrompt: "", enabled: true },
      iteration: 1,
      complete: failing,
      emit: async (event) => {
        emitted.push({ type: event.type });
      },
      signal: new AbortController().signal,
      now: () => new Date("2026-07-09T00:00:00.000Z"),
      generateId: () => "id",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.feedback).toContain("provider down");
    expect(emitted[0]!.type).toBe("rmas.judge.evaluated");
  });
});
