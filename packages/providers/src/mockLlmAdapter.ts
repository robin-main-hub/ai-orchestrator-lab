import type {
  ModelDescriptor,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionChunkEvent,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "./adapter";

export type MockLlmAdapterOptions = {
  profileId?: string;
  fixtureUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

const DEFAULT_PROFILE_ID = "provider_mock_llm";
const DEFAULT_FIXTURE_USAGE = { inputTokens: 12, outputTokens: 4 };

/**
 * Reference implementation of the LlmAdapter contract. Echoes the last
 * user message back with a `mock:` prefix and reports a fixed token
 * usage so tests have a stable shape to assert on. Token counts are
 * intentionally NOT derived from content length — that was a misleading
 * heuristic in the legacy MockProviderAdapter (off by ~4x vs real
 * tokenizers).
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind = "custom" as const;
  private readonly fixtureUsage: { inputTokens: number; outputTokens: number };

  constructor(options: MockLlmAdapterOptions = {}) {
    this.profileId = options.profileId ?? DEFAULT_PROFILE_ID;
    this.fixtureUsage = options.fixtureUsage ?? DEFAULT_FIXTURE_USAGE;
  }

  async discoverModels(_ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    return [
      {
        id: "mock-orchestrator",
        name: "Mock Orchestrator",
        providerProfileId: this.profileId,
        contextWindow: 128_000,
        supportsStreaming: false,
        supportsTools: false,
        inputModalities: ["text"],
        tags: ["conversation", "debate"],
      },
      {
        id: "mock-reviewer",
        name: "Mock Reviewer",
        providerProfileId: this.profileId,
        contextWindow: 64_000,
        supportsStreaming: false,
        supportsTools: false,
        inputModalities: ["text"],
        tags: ["review", "verification"],
      },
    ];
  }

  async complete(
    request: ProviderCompletionRequest,
    _ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user");
    const content = `mock:${lastUserMessage?.content ?? "empty"}`;
    const inputTokens = this.fixtureUsage.inputTokens;
    const outputTokens = this.fixtureUsage.outputTokens;

    return {
      id: `provider_completion_${request.id}_mock`,
      requestId: request.id,
      providerProfileId: this.profileId,
      modelId: request.modelId,
      route: request.routePreference,
      status: "succeeded",
      content,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      createdAt: request.createdAt,
    };
  }

  async *completeStreaming(
    request: ProviderCompletionRequest,
    _ctx: AdapterRuntimeContext,
  ): AsyncIterable<ProviderCompletionChunkEvent> {
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user");
    const content = `mock:${lastUserMessage?.content ?? "empty"}`;
    const inputTokens = this.fixtureUsage.inputTokens;
    const outputTokens = this.fixtureUsage.outputTokens;
    const totalTokens = inputTokens + outputTokens;

    yield {
      type: "usage",
      requestId: request.id,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
    };

    const chunks = ["mock:", lastUserMessage?.content ?? "empty"];
    let seq = 0;
    for (const chunk of chunks) {
      if (!chunk) continue;
      yield {
        type: "delta",
        requestId: request.id,
        sequence: seq++,
        delta: chunk,
      };
    }

    yield {
      type: "done",
      requestId: request.id,
      finalContent: content,
      stopReason: "end_turn",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
      endpoint: "mock",
      createdAt: request.createdAt,
      completedAt: new Date().toISOString(),
    };
  }
}
