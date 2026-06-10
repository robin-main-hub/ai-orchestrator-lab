import { describe, expect, it } from "vitest";
import { createAgentModelRouteLabel, joinProviderModelLabel } from "./helpers";

describe("createAgentModelRouteLabel", () => {
  it("collapses brand duplication: same-brand provider+model shows the model once", () => {
    // "MiMo / MiMo V2.5 Pro" reads like "OpenAI의 GPT5.5" — just say "MiMo V2.5 Pro".
    expect(
      createAgentModelRouteLabel({
        modelId: "mimo-v2.5-pro",
        providerName: "MiMo Token Plan OpenAI",
      }),
    ).toBe("MiMo V2.5 Pro");
  });

  it("keeps the routing account when provider and model are different brands", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "claude-opus-4-8",
        modelName: "Claude Opus 4.8",
        providerName: "APIKey.fun Claude A",
        source: "agent",
      }),
    ).toBe("현재 에이전트 고정 · Claude Opus 4.8 · Claude A (APIFun)");
  });

  it("marks provider default routes and still collapses brand duplication", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "mimo-v2.5-pro",
        providerName: "MiMo Token Plan OpenAI",
        source: "provider_default",
      }),
    ).toBe("공급자 기본 · MiMo V2.5 Pro");
  });

  it("falls back to the waiting provider label when nothing is set", () => {
    expect(createAgentModelRouteLabel({})).toBe("공급자 대기");
  });
});

describe("joinProviderModelLabel", () => {
  it("same brand → model only", () => {
    expect(joinProviderModelLabel("MiMo", "MiMo V2.5 Pro")).toBe("MiMo V2.5 Pro");
    expect(joinProviderModelLabel("Claude", "Claude Opus 4.8")).toBe("Claude Opus 4.8");
  });
  it("different brand → model · provider (route preserved)", () => {
    expect(joinProviderModelLabel("OpenRouter", "Claude Opus 4.8")).toBe("Claude Opus 4.8 · OpenRouter");
  });
  it("waiting states fall back", () => {
    expect(joinProviderModelLabel("MiMo", "모델 연결 대기")).toBe("MiMo");
    expect(joinProviderModelLabel("공급자 대기", "Claude Opus 4.8")).toBe("Claude Opus 4.8");
  });
});
