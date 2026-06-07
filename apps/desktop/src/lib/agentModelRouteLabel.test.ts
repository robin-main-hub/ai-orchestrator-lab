import { describe, expect, it } from "vitest";
import { createAgentModelRouteLabel } from "./helpers";

describe("createAgentModelRouteLabel", () => {
  it("shows the selected agent provider and human-readable model name in one route", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "mimo-v2.5-pro",
        providerName: "MiMo Token Plan OpenAI",
      }),
    ).toBe("MiMo / MiMo V2.5 Pro");
  });

  it("keeps model display name when it differs from the raw id", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "claude-opus-4-8",
        modelName: "Claude Opus 4.8",
        providerName: "APIKey.fun Claude A",
        source: "agent",
      }),
    ).toBe("에이전트 고정 · Claude A (APIFun) / Claude Opus 4.8");
  });

  it("marks provider default model routes when no agent override is selected", () => {
    expect(
      createAgentModelRouteLabel({
        modelId: "mimo-v2.5-pro",
        providerName: "MiMo Token Plan OpenAI",
        source: "provider_default",
      }),
    ).toBe("공급자 기본 · MiMo / MiMo V2.5 Pro");
  });

  it("falls back clearly when provider or model is missing", () => {
    expect(createAgentModelRouteLabel({})).toBe("공급자 미지정 / 모델 연결 대기");
  });
});
