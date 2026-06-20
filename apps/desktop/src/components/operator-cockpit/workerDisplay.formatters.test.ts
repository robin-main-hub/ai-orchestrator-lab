import { describe, expect, it } from "vitest";
import { formatOperatorModelLabel, formatOperatorProviderLabel } from "./workerDisplay";

// Characterization tests for the two composed operator-cockpit label formatters
// that the existing workerDisplay.test.ts leaves uncovered (it pins
// formatOperatorWorktreeLabel and resolveOperatorWorkerSkillDisplay only). No
// behavior change. Both are pure: the module imports only protocol types and
// pure lib/component helpers (formatModelDisplayName, providerDisplayLabel,
// ./presentation), no React, no DOM, no network.
//
// formatOperatorModelLabel composes formatModelDisplayName → strip a leading
// "model" token → humanizeIdentifier. formatOperatorProviderLabel runs
// providerDisplayLabel first and short-circuits when it recognizes the input;
// otherwise it strips a leading "provider" token, despaces, humanizes, and
// re-runs providerDisplayLabel. We pin the empty/whitespace guards, the
// known-mapping short-circuits, and the unknown-input humanize+passthrough arm.

describe("formatOperatorModelLabel", () => {
  it("returns the waiting placeholder for empty/whitespace/undefined input", () => {
    expect(formatOperatorModelLabel(undefined)).toBe("모델 연결 대기");
    expect(formatOperatorModelLabel("")).toBe("모델 연결 대기");
    expect(formatOperatorModelLabel("   ")).toBe("모델 연결 대기");
  });

  it("surfaces a known model's display name unchanged through humanize", () => {
    expect(formatOperatorModelLabel("claude-opus-4-6")).toBe("Claude Opus 4.6");
  });

  it("uppercases a gpt id then humanize splits the dash", () => {
    expect(formatOperatorModelLabel("gpt-5")).toBe("GPT 5");
  });

  it("strips a leading model_ token and humanizes the remainder", () => {
    expect(formatOperatorModelLabel("model_custom-thing")).toBe("Custom Thing");
  });
});

describe("formatOperatorProviderLabel", () => {
  it("returns the waiting placeholder for empty/whitespace/undefined input", () => {
    expect(formatOperatorProviderLabel(undefined)).toBe("공급자 대기");
    expect(formatOperatorProviderLabel("")).toBe("공급자 대기");
    expect(formatOperatorProviderLabel("   ")).toBe("공급자 대기");
  });

  it("short-circuits when providerDisplayLabel recognizes the input", () => {
    expect(formatOperatorProviderLabel("mimo")).toBe("MiMo");
    expect(formatOperatorProviderLabel("deepseek")).toBe("DeepSeek");
    expect(formatOperatorProviderLabel("openrouter")).toBe("OpenRouter");
  });

  it("strips a leading provider_ token then humanizes the unrecognized remainder", () => {
    expect(formatOperatorProviderLabel("provider_my_thing")).toBe("My Thing");
  });

  it("despaces and humanizes a fully unrecognized provider verbatim", () => {
    expect(formatOperatorProviderLabel("totally-unknown-xyz")).toBe("Totally Unknown Xyz");
  });
});
