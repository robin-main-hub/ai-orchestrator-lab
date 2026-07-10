import { describe, expect, it } from "vitest";
import { parseVerificationSteps } from "./autonomyRunForm";
import {
  VERIFICATION_PRESETS,
  addCustom,
  chipCommand,
  customCommands,
  isPresetActive,
  parseVerificationChips,
  removeCommand,
  serializeVerificationChips,
  togglePreset,
} from "./autonomyVerificationChips";

describe("VERIFICATION_PRESETS", () => {
  it("maps each preset id to its `pnpm <id>` command", () => {
    expect(VERIFICATION_PRESETS.map((preset) => [preset.id, preset.command])).toEqual([
      ["typecheck", "pnpm typecheck"],
      ["test", "pnpm test"],
      ["build", "pnpm build"],
      ["lint", "pnpm lint"],
    ]);
  });
});

describe("parseVerificationChips", () => {
  it("recognizes preset lines and treats the rest as custom, preserving order", () => {
    const chips = parseVerificationChips("pnpm build\n  pnpm typecheck \ncustom check\npnpm lint");
    expect(chips).toEqual([
      { kind: "preset", id: "build" },
      { kind: "preset", id: "typecheck" },
      { kind: "custom", command: "custom check" },
      { kind: "preset", id: "lint" },
    ]);
  });

  it("skips blank lines", () => {
    expect(parseVerificationChips("pnpm test\n\n   \npnpm lint")).toEqual([
      { kind: "preset", id: "test" },
      { kind: "preset", id: "lint" },
    ]);
  });
});

describe("chipCommand / serializeVerificationChips", () => {
  it("serializes presets to their command and customs to their literal", () => {
    expect(chipCommand({ kind: "preset", id: "typecheck" })).toBe("pnpm typecheck");
    expect(chipCommand({ kind: "custom", command: "make check" })).toBe("make check");
    expect(
      serializeVerificationChips([
        { kind: "preset", id: "test" },
        { kind: "custom", command: "make check" },
      ]),
    ).toBe("pnpm test\nmake check");
  });
});

describe("round-trip losslessness (content + order)", () => {
  const inputs = [
    "pnpm build\npnpm typecheck\ncustom check\npnpm lint",
    "  pnpm test \n\n  make lint\n",
    "",
    "only one custom line",
  ];
  for (const input of inputs) {
    it(`preserves parseVerificationSteps for ${JSON.stringify(input)}`, () => {
      const roundTripped = serializeVerificationChips(parseVerificationChips(input));
      expect(parseVerificationSteps(roundTripped)).toEqual(parseVerificationSteps(input));
    });
  }
});

describe("togglePreset", () => {
  it("adds an absent preset as a new line and removes a present one, preserving order", () => {
    expect(togglePreset("pnpm test", "build")).toBe("pnpm test\npnpm build");
    expect(togglePreset("pnpm typecheck\npnpm test\npnpm build", "test")).toBe(
      "pnpm typecheck\npnpm build",
    );
  });

  it("normalizes blank/whitespace lines away as a side effect", () => {
    expect(togglePreset("pnpm test\n\n  \npnpm lint", "test")).toBe("pnpm lint");
  });
});

describe("addCustom", () => {
  it("appends a trimmed custom command", () => {
    expect(addCustom("pnpm test", "  make check  ")).toBe("pnpm test\nmake check");
  });

  it("ignores empty input", () => {
    expect(addCustom("pnpm test", "   ")).toBe("pnpm test");
  });

  it("ignores an exact duplicate", () => {
    expect(addCustom("pnpm test\nmake check", "make check")).toBe("pnpm test\nmake check");
  });

  it("routes a preset command to the preset instead of a duplicate custom", () => {
    // "pnpm build" is not yet present -> appended as the preset line, recognized as a preset
    const next = addCustom("pnpm test", "pnpm build");
    expect(next).toBe("pnpm test\npnpm build");
    expect(parseVerificationChips(next)).toEqual([
      { kind: "preset", id: "test" },
      { kind: "preset", id: "build" },
    ]);
    // already present -> ignored, no dup
    expect(addCustom(next, "pnpm build")).toBe("pnpm test\npnpm build");
  });
});

describe("removeCommand", () => {
  it("removes the first matching line", () => {
    expect(removeCommand("pnpm test\nmake check\npnpm lint", "make check")).toBe(
      "pnpm test\npnpm lint",
    );
  });

  it("is a no-op (but normalizes) when the command is absent", () => {
    expect(removeCommand("pnpm test\npnpm lint", "make check")).toBe("pnpm test\npnpm lint");
  });
});

describe("isPresetActive / customCommands", () => {
  it("reports preset presence", () => {
    const text = "pnpm typecheck\ncustom one\npnpm lint";
    expect(isPresetActive(text, "typecheck")).toBe(true);
    expect(isPresetActive(text, "lint")).toBe(true);
    expect(isPresetActive(text, "test")).toBe(false);
    expect(isPresetActive(text, "build")).toBe(false);
  });

  it("returns ordered custom commands only", () => {
    expect(customCommands("pnpm typecheck\ncustom one\npnpm lint\ncustom two")).toEqual([
      "custom one",
      "custom two",
    ]);
  });
});
