import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTONOMY_FORM,
  buildAutonomyRunInput,
  headerOnlyPersona,
  isRunnable,
  loopStatusBadgeVariant,
  loopStatusLabel,
  parseVerificationSteps,
  type AutonomyRunForm,
} from "./autonomyRunForm";

const ctx = { now: "2026-06-10T00:00:00.000Z", makeSessionId: (p: string, pane: string) => `as_${p}_${pane}` };

const form = (overrides: Partial<AutonomyRunForm> = {}): AutonomyRunForm => ({
  ...DEFAULT_AUTONOMY_FORM,
  personaName: "makise",
  goal: "Implement the widget",
  verificationStepsText: "pnpm test\npnpm lint",
  ...overrides,
});

describe("parseVerificationSteps", () => {
  it("splits non-empty trimmed lines", () => {
    expect(parseVerificationSteps("  pnpm test \n\n  pnpm lint\n")).toEqual(["pnpm test", "pnpm lint"]);
    expect(parseVerificationSteps("   ")).toEqual([]);
  });
});

describe("isRunnable", () => {
  it("requires persona, goal, and at least one verification step", () => {
    expect(isRunnable(form()).ok).toBe(true);
    expect(isRunnable(form({ personaName: " " })).ok).toBe(false);
    expect(isRunnable(form({ goal: "" })).ok).toBe(false);
    expect(isRunnable(form({ verificationStepsText: "  \n  " })).ok).toBe(false);
  });

  it("explains why it is not runnable", () => {
    expect(isRunnable(form({ goal: "" })).reason).toContain("목표");
  });
});

describe("buildAutonomyRunInput", () => {
  it("assembles a runnable input from the form", () => {
    const input = buildAutonomyRunInput(form({ role: "qa", mode: "auto_safe" }), { sessionId: "s1", ctx });
    expect(input.summon).toMatchObject({ personaName: "makise", sessionId: "s1", preferredRole: "qa" });
    expect(input.mode).toBe("auto_safe");
    expect(input.packet.goal).toBe("Implement the widget");
    expect(input.packet.verificationPlan).toEqual(["pnpm test", "pnpm lint"]);
    expect(input.registry.panes.length).toBeGreaterThan(0);
    expect(input.persona.personaName).toBe("makise");
  });

  it("reuses a provided registry instead of building a fresh one", () => {
    const registry = { panes: [{ paneId: "%9", role: "code" as const, status: "free" as const }], sessions: [] };
    const input = buildAutonomyRunInput(form(), { sessionId: "s1", ctx, registry });
    expect(input.registry).toBe(registry);
  });

  it("uses a header-only persona by default and trims the name", () => {
    const persona = headerOnlyPersona("  makise  ".trim());
    expect(persona.fragments).toEqual([]);
    expect(persona.safetyContent).toBeNull();
    const input = buildAutonomyRunInput(form({ personaName: "  yui  " }), { sessionId: "s1", ctx });
    expect(input.summon.personaName).toBe("yui");
    expect(input.persona.personaName).toBe("yui");
  });
});

describe("loop status presentation", () => {
  it("labels and colors each terminal status", () => {
    expect(loopStatusLabel("completed")).toBe("완료");
    expect(loopStatusLabel("awaiting_human")).toContain("승인");
    expect(loopStatusBadgeVariant("completed")).toBe("success");
    expect(loopStatusBadgeVariant("failed")).toBe("danger");
    expect(loopStatusBadgeVariant("awaiting_human")).toBe("warning");
  });
});
