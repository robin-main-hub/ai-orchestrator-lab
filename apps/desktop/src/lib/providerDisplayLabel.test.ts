import { describe, expect, it } from "vitest";
import { providerDisplayLabel } from "./helpers";

describe("providerDisplayLabel", () => {
  it.each([
    ["DGX-01 vLLM", "DGX-01"],
    ["DGX-02 vLLM", "DGX-02"],
    ["DGX-02 OpenClaw vLLM", "DGX-02"],
    ["Grok OAuth #1", "Grok #1"],
    ["Grok OAuth #2", "Grok #2"],
    ["Codex OAuth Session", "Codex"],
    ["OpenAI \uD638\uD658 \uD504\uB85C\uD30C\uC77C", "OpenAI \uD638\uD658"],
    ["OpenAI Compatible", "OpenAI \uD638\uD658"],
    ["OpenAI", "OpenAI"],
    ["APIKey.fun Claude A", "Claude (3rd)"],
    ["APIKey.fun Claude B", "Claude (3rd)"],
    ["\uB9AC\uC140\uB7EC \uD638\uD658 API", "Claude (3rd)"],
    ["Anthropic Claude", "Claude"],
    ["Anthropic \uD638\uD658 \uD504\uB85C\uD30C\uC77C", "Claude"],
    ["DeepSeek DGX-02 Key", "DeepSeek"],
    ["OpenRouter DGX-02 Key", "OpenRouter"],
    ["Gemini", "Gemini"],
    ["unknown input", "unknown input"],
  ])("%s -> %s", (source, expected) => {
    expect(providerDisplayLabel(source)).toBe(expected);
  });
});
