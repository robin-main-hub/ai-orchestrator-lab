import { describe, expect, it } from "vitest";
import { tmuxPaneRoleSchema, type TmuxPaneRole } from "@ai-orchestrator/protocol";
import {
  DEFAULT_AUTONOMY_FORM,
  DEFAULT_SWARM_PANES,
  SELECTABLE_PANE_ROLES,
  buildAutonomyRunInput,
  headerOnlyPersona,
  isRunnable,
  loopStatusBadgeVariant,
  loopStatusLabel,
  nonAutoApprovableSteps,
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

describe("nonAutoApprovableSteps", () => {
  it("flags steps outside the safe allowlist only in auto_safe mode", () => {
    const form = {
      ...DEFAULT_AUTONOMY_FORM,
      mode: "auto_safe" as const,
      verificationStepsText: "pnpm typecheck\npnpm --version\nrm -rf dist",
    };
    expect(nonAutoApprovableSteps(form)).toEqual(["pnpm --version", "rm -rf dist"]);
  });

  it("returns nothing in human mode (every step needs approval anyway)", () => {
    const form = {
      ...DEFAULT_AUTONOMY_FORM,
      mode: "human" as const,
      verificationStepsText: "pnpm --version",
    };
    expect(nonAutoApprovableSteps(form)).toEqual([]);
  });
});

// Characterization tests (no behavior change) for the two previously-unasserted
// pane-roster exports DEFAULT_SWARM_PANES and SELECTABLE_PANE_ROLES. The blocks above
// drive the form reducers and input assembly (buildAutonomyRunInput falls back to
// DEFAULT_SWARM_PANES when no panes are passed) but never the roster's own validity or
// the derived role list. Load-bearing:
//   - DEFAULT_SWARM_PANES is a *curated* roster (a SUBSET of the protocol pane-role union,
//     not the whole thing): every entry's role must be a real TmuxPaneRole, the paneId must
//     follow the "role:<role>" convention that createSummonRegistry keys on, and no role may
//     repeat (a duplicate would collide two summon panes onto one role);
//   - SELECTABLE_PANE_ROLES must stay exactly DEFAULT_SWARM_PANES.map(p => p.role) — same
//     members, same order — so the panel's selectable roles never drift from the roster it
//     actually summons.
describe("DEFAULT_SWARM_PANES / SELECTABLE_PANE_ROLES", () => {
  const paneOptions = tmuxPaneRoleSchema.options as TmuxPaneRole[];

  it("rosters only valid protocol pane roles (a subset of the union)", () => {
    expect(DEFAULT_SWARM_PANES.length).toBeGreaterThan(0);
    for (const pane of DEFAULT_SWARM_PANES) {
      expect(tmuxPaneRoleSchema.safeParse(pane.role).success).toBe(true);
      expect(paneOptions).toContain(pane.role);
    }
  });

  it("keys every paneId by the 'role:<role>' convention and never repeats a role", () => {
    for (const pane of DEFAULT_SWARM_PANES) {
      expect(pane.paneId).toBe(`role:${pane.role}`);
    }
    const roles = DEFAULT_SWARM_PANES.map((pane) => pane.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("derives SELECTABLE_PANE_ROLES as exactly the roster's roles, in order", () => {
    expect([...SELECTABLE_PANE_ROLES]).toEqual(DEFAULT_SWARM_PANES.map((pane) => pane.role));
    for (const role of SELECTABLE_PANE_ROLES) {
      expect(tmuxPaneRoleSchema.safeParse(role).success).toBe(true);
    }
  });
});
