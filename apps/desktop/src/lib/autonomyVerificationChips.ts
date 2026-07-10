import { parseVerificationSteps } from "./autonomyRunForm";

/**
 * Pure model for the Autonomy Run panel's verification-step editor. The panel
 * used to expose the raw newline-joined string via a `<textarea>`; this module
 * turns that same string into a chip-toggle UX (presets + custom commands)
 * WITHOUT changing the payload. Every helper takes and returns the canonical
 * newline-joined `verificationStepsText`, so `buildAutonomyRunInput` /
 * `parseVerificationSteps` keep producing a byte-identical `verificationPlan`.
 *
 * Kept dependency-light and free of React so it can be unit-tested directly
 * (the desktop has no DOM test environment — components are checked via static
 * markup only). It imports `parseVerificationSteps` from ./autonomyRunForm;
 * that module must NOT import this one (no cycle).
 */

export type VerificationPresetId = "typecheck" | "test" | "build" | "lint";

export type VerificationPreset = {
  id: VerificationPresetId;
  label: string;
  command: string;
};

/** Ordered, canonical preset toggles. command === `pnpm ${id}`. */
export const VERIFICATION_PRESETS: readonly VerificationPreset[] = [
  { id: "typecheck", label: "typecheck", command: "pnpm typecheck" },
  { id: "test", label: "test", command: "pnpm test" },
  { id: "build", label: "build", command: "pnpm build" },
  { id: "lint", label: "lint", command: "pnpm lint" },
] as const;

export type VerificationChip =
  | { kind: "preset"; id: VerificationPresetId }
  | { kind: "custom"; command: string };

const PRESET_BY_COMMAND = new Map<string, VerificationPresetId>(
  VERIFICATION_PRESETS.map((preset) => [preset.command, preset.id]),
);

function presetById(id: VerificationPresetId): VerificationPreset {
  const preset = VERIFICATION_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`unknown verification preset: ${id}`);
  }
  return preset;
}

/** The command line a chip serializes to. */
export function chipCommand(chip: VerificationChip): string {
  return chip.kind === "preset" ? presetById(chip.id).command : chip.command;
}

/**
 * Ordered chip model of the newline string — each non-blank line becomes either
 * a recognized preset chip or a custom chip, preserving the original line order.
 */
export function parseVerificationChips(text: string): VerificationChip[] {
  return parseVerificationSteps(text).map((command) => {
    const presetId = PRESET_BY_COMMAND.get(command);
    return presetId ? { kind: "preset", id: presetId } : { kind: "custom", command };
  });
}

/**
 * Serialize chips back to the newline string. Content- AND order-lossless:
 * `parseVerificationSteps(serializeVerificationChips(parseVerificationChips(t)))`
 * equals `parseVerificationSteps(t)` for any input.
 */
export function serializeVerificationChips(chips: readonly VerificationChip[]): string {
  return chips.map(chipCommand).join("\n");
}

/** Is the given preset's command currently present in the plan? */
export function isPresetActive(text: string, id: VerificationPresetId): boolean {
  return parseVerificationSteps(text).includes(presetById(id).command);
}

/** Ordered custom (non-preset) commands. */
export function customCommands(text: string): string[] {
  const commands: string[] = [];
  for (const chip of parseVerificationChips(text)) {
    if (chip.kind === "custom") {
      commands.push(chip.command);
    }
  }
  return commands;
}

/** Add the preset's command if absent, remove it if present. Preserves order. */
export function togglePreset(text: string, id: VerificationPresetId): string {
  const command = presetById(id).command;
  const commands = parseVerificationSteps(text);
  if (commands.includes(command)) {
    return commands.filter((line) => line !== command).join("\n");
  }
  return [...commands, command].join("\n");
}

/**
 * Append a custom command. Empty and exact-duplicate inputs are ignored. A value
 * that equals a preset command dedups against (and thus toggles ON) that preset
 * rather than creating a duplicate custom chip — the appended literal line is
 * recognized as the preset by `parseVerificationChips`.
 */
export function addCustom(text: string, command: string): string {
  const trimmed = command.trim();
  const commands = parseVerificationSteps(text);
  if (!trimmed || commands.includes(trimmed)) {
    return commands.join("\n");
  }
  return [...commands, trimmed].join("\n");
}

/** Remove the first line whose trimmed value equals `command`. */
export function removeCommand(text: string, command: string): string {
  const commands = parseVerificationSteps(text);
  const index = commands.indexOf(command);
  if (index === -1) {
    return commands.join("\n");
  }
  commands.splice(index, 1);
  return commands.join("\n");
}
