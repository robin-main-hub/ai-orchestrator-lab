import { describe, expect, it } from "vitest";
import { createAgentModelRouteLabel } from "./helpers";

describe("createAgentModelRouteLabel", () => {
  it("shows the selected agent provider and model id in one readable route", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "mimo-v2.5-pro",
        providerName: "MiMo Token Plan OpenAI",
      }),
    ).toBe("MiMo / mimo-v2.5-pro");
  });

  it("keeps model display name when it differs from the raw id", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "claude-opus-4-8",
        modelName: "Claude Opus 4.8",
        providerName: "APIKey.fun Claude A",
        source: "agent",
      }),
    ).toBe("에이전트 고정 · Claude A (APIFun) / Claude Opus 4.8 (claude-opus-4-8)");
  });

  it("marks provider default model routes when no agent override is selected", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "mimo-v2.5-pro",
        providerName: "MiMo Token Plan OpenAI",
        source: "provider_default",
      }),
    ).toBe("Provider 기본 · MiMo / mimo-v2.5-pro");
  });

  it("falls back clearly when provider or model is missing", () => {
    expect(createAgentModelRouteLabel({})).toBe("Provider 미지정 / 모델 연결 대기");
  });
});
