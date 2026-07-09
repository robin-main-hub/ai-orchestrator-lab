import { describe, expect, it } from "vitest";
import {
  rmasRunConfigSchema,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  type RmasRunConfig,
} from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "@ai-orchestrator/agents";
import { createRmasRunController, RmasAtCapacityError } from "./rmasRunController";
import type { RmasEventInput } from "./rmasRunStore";

const ACCEPT = '```json\n{"perCriterion":[{"id":"k1","met":true}],"feedback":"통과"}\n```';
const AGENT_OUTPUT = "후보 산출물";
const TERMINAL = new Set(["rmas.run.completed", "rmas.run.exhausted", "rmas.run.stopped", "rmas.run.interrupted"]);

function isJudgeRequest(request: ProviderCompletionRequest): boolean {
  return (request.messages[request.messages.length - 1]?.content ?? "").includes("판정");
}

function baseResp(request: ProviderCompletionRequest, content: string): ProviderCompletionResponse {
  return {
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status: "succeeded",
    content,
    usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    createdAt: request.createdAt,
  };
}

/** Single-agent distillation config = exactly one agent call + one judge call per iteration. */
function config(): RmasRunConfig {
  return rmasRunConfigSchema.parse({
    goal: "목표를 달성하는 산출물을 만든다",
    pattern: "distillation",
    agents: [{ id: "a1", name: "작업자", kind: "producer", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" }],
    acceptanceCriteria: [{ id: "k1", text: "기준을 충족한다" }],
  });
}

/** Records appended events; exposes a promise that resolves on the first terminal event. */
function recorder() {
  const events: Array<{ runId: string; type: string; payload: unknown }> = [];
  let resolveTerminal: (type: string) => void;
  const terminal = new Promise<string>((resolve) => {
    resolveTerminal = resolve;
  });
  const appendEvent = async (runId: string, event: RmasEventInput) => {
    events.push({ runId, type: event.type, payload: event.payload });
    if (TERMINAL.has(event.type)) resolveTerminal(event.type);
  };
  return { events, appendEvent, terminal };
}

/** Completion that never resolves until its abort signal fires, then rejects. */
function hangingComplete(): LlmCompletionFn {
  return (_request, ctx) =>
    new Promise<ProviderCompletionResponse>((_resolve, reject) => {
      ctx.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
}

describe("createRmasRunController", () => {
  it("start fires the loop (not awaited) and drives a scripted run to completed", async () => {
    const { events, appendEvent, terminal } = recorder();
    const complete: LlmCompletionFn = async (request) =>
      baseResp(request, isJudgeRequest(request) ? ACCEPT : AGENT_OUTPUT);
    const controller = createRmasRunController({ complete, appendEvent, maxConcurrent: 1 });

    controller.start("run_1", config());
    expect(controller.isRunning("run_1")).toBe(true);
    expect(controller.runningCount()).toBe(1);

    const terminalType = await terminal;
    expect(terminalType).toBe("rmas.run.completed");
    // handle cleaned up after the loop finished
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.isRunning("run_1")).toBe(false);
    expect(controller.runningCount()).toBe(0);
    expect(events.some((e) => e.type === "rmas.run.started")).toBe(true);
  });

  it("stop aborts an in-flight run and records a stopped terminal", async () => {
    const { appendEvent, terminal } = recorder();
    const controller = createRmasRunController({ complete: hangingComplete(), appendEvent, maxConcurrent: 1 });

    controller.start("run_1", config());
    // let the loop reach the hanging agent call
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.isRunning("run_1")).toBe(true);

    expect(controller.stop("run_1")).toBe(true);
    const terminalType = await terminal;
    expect(terminalType).toBe("rmas.run.stopped");

    await new Promise((r) => setTimeout(r, 0));
    expect(controller.isRunning("run_1")).toBe(false);
    expect(controller.stop("run_1")).toBe(false); // idempotent — no live handle
  });

  it("enforces maxConcurrent: a second start while at capacity throws RmasAtCapacityError", async () => {
    const { appendEvent } = recorder();
    const controller = createRmasRunController({ complete: hangingComplete(), appendEvent, maxConcurrent: 1 });

    controller.start("run_1", config());
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.runningCount()).toBe(1);

    expect(() => controller.start("run_2", config())).toThrow(RmasAtCapacityError);
    expect(controller.runningCount()).toBe(1);

    controller.stop("run_1"); // cleanup so no dangling handle
    await new Promise((r) => setTimeout(r, 0));
  });

  it("terminal safety net: an unexpected (non-abort) throw records run.interrupted", async () => {
    const { events, appendEvent, terminal } = recorder();
    const complete: LlmCompletionFn = async () => {
      throw new Error("boom");
    };
    const controller = createRmasRunController({ complete, appendEvent, maxConcurrent: 1 });

    controller.start("run_1", config());
    const terminalType = await terminal;
    expect(terminalType).toBe("rmas.run.interrupted");
    expect((events.find((e) => e.type === "rmas.run.interrupted")!.payload as { reason: string }).reason).toBe(
      "server_restart",
    );
  });
});
