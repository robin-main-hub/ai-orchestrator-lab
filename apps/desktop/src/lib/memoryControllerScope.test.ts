import { describe, expect, it } from "vitest";
import {
  canCommitMemoryScopeResult,
  createMemoryControllerScopeKey,
} from "./memoryControllerScope";

describe("memory controller scope guards", () => {
  it("uses the exact agent memory namespace as the async commit key", () => {
    expect(
      createMemoryControllerScopeKey({
        agentId: "agent_reviewer",
        sessionId: "session_main",
        providerProfileId: "provider_mimo_token_openai",
        namespace: "agent:agent_reviewer/session:session_main/provider:provider_mimo_token_openai",
        recallTraceId: "recall_agent_reviewer_session_main_provider_mimo_token_openai",
      }),
    ).toBe("agent:agent_reviewer/session:session_main/provider:provider_mimo_token_openai");
  });

  it("rejects stale async memory results after the scope changes", () => {
    expect(
      canCommitMemoryScopeResult({
        currentScopeKey: "agent:agent_executor/session:session_main/provider:provider_mimo_token_openai",
        expectedScopeKey: "agent:agent_reviewer/session:session_main/provider:provider_mimo_token_openai",
      }),
    ).toBe(false);
  });
});
