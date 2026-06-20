import { describe, expect, it } from "vitest";
import {
  createAgentModelRouteLabel,
  formatModelDisplayName,
  joinProviderModelLabel,
  providerDisplayLabel,
} from "./helpers";

// Characterization tests for the provider/model display-label resolution in
// helpers.ts (no behavior change). providerDisplayLabel is a long ordered
// brand decision-tree; formatModelDisplayName maps known ids then humanizes the
// rest; joinProviderModelLabel de-dupes same-brand provider+model; and
// createAgentModelRouteLabel folds those plus a source prefix into one route
// label. These pin the branch ordering, DGX number padding, same-brand collapse
// and the empty/"대기" fallbacks. All pure (no crypto/DOM/glob).
describe("providerDisplayLabel", () => {
  it("resolves brand keywords in the documented priority order", () => {
    expect(providerDisplayLabel("MiMo local")).toBe("MiMo");
    expect(providerDisplayLabel("APIKey.fun Claude A")).toBe("Claude A (APIFun)");
    expect(providerDisplayLabel("apifun something")).toBe("Claude (3rd)");
    expect(providerDisplayLabel("리셀러 호환")).toBe("리셀러 호환");
    expect(providerDisplayLabel("reseller route")).toBe("리셀러");
    expect(providerDisplayLabel("OpenAI compatible")).toBe("OpenAI 호환");
    expect(providerDisplayLabel("DeepSeek DGX")).toBe("DeepSeek (DGX)");
    expect(providerDisplayLabel("OpenRouter")).toBe("OpenRouter");
    expect(providerDisplayLabel("Codex CLI")).toBe("Codex");
  });

  it("extracts grok session numbers and pads DGX numbers to two digits", () => {
    expect(providerDisplayLabel("Grok session # 3")).toBe("Grok #3");
    expect(providerDisplayLabel("grok")).toBe("Grok");
    expect(providerDisplayLabel("DGX-2 vllm")).toBe("DGX-02");
    expect(providerDisplayLabel("openclaw on DGX-01")).toBe("DGX-01 OpenClaw");
    expect(providerDisplayLabel("openclaw")).toBe("OpenClaw");
    expect(providerDisplayLabel("DGX gateway")).toBe("DGX");
  });

  it("returns the original name when no brand matches", () => {
    expect(providerDisplayLabel("Totally Custom Endpoint")).toBe("Totally Custom Endpoint");
  });
});

describe("formatModelDisplayName", () => {
  it("falls back to a waiting label when empty", () => {
    expect(formatModelDisplayName(undefined)).toBe("모델 연결 대기");
    expect(formatModelDisplayName("   ")).toBe("모델 연결 대기");
  });

  it("maps known ids and upper-cases gpt ids", () => {
    expect(formatModelDisplayName("claude-opus-4-6")).toBe("Claude Opus 4.6");
    expect(formatModelDisplayName("mimo-v2.5-pro")).toBe("MiMo V2.5 Pro");
    expect(formatModelDisplayName("gpt-5.5")).toBe("GPT-5.5");
  });

  it("humanizes unknown ids by stripping prefixes and title-casing", () => {
    expect(formatModelDisplayName("custom-model")).toBe("Custom Model");
    expect(formatModelDisplayName("claude-haiku")).toBe("Claude Haiku");
  });
});

describe("joinProviderModelLabel", () => {
  it("returns the provider alone when the model is empty or a waiting label", () => {
    expect(joinProviderModelLabel("MiMo", "")).toBe("MiMo");
    expect(joinProviderModelLabel("MiMo", "모델 연결 대기")).toBe("MiMo");
  });

  it("returns the model alone when the provider is empty or waiting", () => {
    expect(joinProviderModelLabel("공급자 대기", "GPT-5")).toBe("GPT-5");
    expect(joinProviderModelLabel("", "GPT-5")).toBe("GPT-5");
  });

  it("collapses same-brand provider+model and joins distinct brands with a dot", () => {
    expect(joinProviderModelLabel("MiMo", "MiMo V2.5 Pro")).toBe("MiMo V2.5 Pro");
    expect(joinProviderModelLabel("OpenRouter", "Claude Opus")).toBe("Claude Opus · OpenRouter");
  });
});

describe("createAgentModelRouteLabel", () => {
  it("prefixes the source and joins provider/model", () => {
    expect(
      createAgentModelRouteLabel({ providerName: "OpenRouter", modelId: "claude-opus-4-6", source: "agent" }),
    ).toBe("현재 에이전트 고정 · Claude Opus 4.6 · OpenRouter");
  });

  it("uses waiting labels when provider/model are absent and omits an unknown source", () => {
    expect(createAgentModelRouteLabel({})).toBe("공급자 대기");
    expect(createAgentModelRouteLabel({ providerName: "MiMo", modelName: "MiMo V2.5" })).toBe("MiMo V2.5");
  });
});
