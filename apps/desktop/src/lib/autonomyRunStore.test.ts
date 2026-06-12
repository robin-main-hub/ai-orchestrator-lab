import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AUTONOMY_FORM } from "./autonomyRunForm";
import { approvalWaitNoteFromLog, createAutonomyRunStore, resolveInitialAutonomyForm } from "./autonomyRunStore";

describe("createAutonomyRunStore", () => {
  it("persists mission state across get calls and notifies subscribers on set", () => {
    const store = createAutonomyRunStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ running: true, steps: [{ step: 1, outcome: "progressing", action: "await_capture", reason: "r" }] });

    expect(store.get().running).toBe(true);
    expect(store.get().steps).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("unsubscribes listeners and resets to the initial state", () => {
    const store = createAutonomyRunStore({ running: true });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.reset();

    expect(listener).not.toHaveBeenCalled();
    expect(store.get().running).toBe(false);
    expect(store.get().formDraft).toBeNull();
  });
});

describe("resolveInitialAutonomyForm", () => {
  const seeded = { ...DEFAULT_AUTONOMY_FORM, personaName: "kurumi", goal: "시드 목표" };
  const draft = { ...DEFAULT_AUTONOMY_FORM, personaName: "architect", goal: "편집하던 목표" };

  it("restores the user's draft after a tab roundtrip", () => {
    expect(resolveInitialAutonomyForm({ draft, seeded })).toEqual(draft);
  });

  it("lets an explicit codex summon override the draft", () => {
    expect(resolveInitialAutonomyForm({ draft, seeded, seedPersonaName: "kurumi" })).toEqual(seeded);
  });

  it("falls back to the seeded form when there is no draft", () => {
    expect(resolveInitialAutonomyForm({ draft: null, seeded })).toEqual(seeded);
  });
});

describe("approvalWaitNoteFromLog", () => {
  it("extracts the command from a mode-B defer log", () => {
    const note = approvalWaitNoteFromLog(
      'mode B: "pnpm --version" not auto-approvable (not in the safe-command allowlist); deferring to human',
    );
    expect(note).toContain("pnpm --version");
    expect(note).toContain("사람 승인");
  });

  it("ignores unrelated log lines", () => {
    expect(approvalWaitNoteFromLog('mode B: auto-approved "pnpm test"')).toBeNull();
    expect(approvalWaitNoteFromLog("identity injection failed: x")).toBeNull();
  });
});
