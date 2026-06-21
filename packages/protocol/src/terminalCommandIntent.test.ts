import { describe, expect, it } from "vitest";
import {
  terminalCommandDispatchStateSchema,
  terminalCommandEventTypeSchema,
  terminalCommandIntentEventPayloadSchema,
  terminalCommandIntentSchema,
} from "./index.js";

// The terminal command-intent cluster is the safety-critical command-dispatch
// gate: before any command leaves for a tmux pane it is recorded as an intent
// carrying its approval + dispatch lifecycle, its requested permissions, and —
// crucially — a redacted preview. None of this was directly pinned. Four
// authority facts: (1) DISPATCH STATE MACHINE — dispatchState is a closed
// six-state lifecycle {recorded, pending_approval, blocked, dry_run, sent,
// failed}; "sent" is the only state meaning the command actually left, and an
// unknown state is rejected. (2) OBSERVABLE EVENT VOCABULARY — the command
// event type is exactly the five dotted lifecycle events (created/blocked/
// dry_run/sent/failed); there is deliberately NO "approved"/"applied" event, so
// the emitted timeline can never imply an un-modelled transition. (3) REQUIRED
// REDACTION COMPANION — terminalCommandIntentSchema requires BOTH commandPreview
// AND redactedCommandPreview (the redacted form is NOT optional); only
// blockedReason is optional, so a recorded/emitted intent always carries a
// redacted preview. (4) RECORD STRIPS vs ENVELOPE HARD-REJECTS — the durable
// intent is a plain z.object (unknown keys silently stripped), but the on-the-
// wire terminalCommandIntentEventPayload is .strict(): an unknown key is
// REJECTED, not stripped, and rawCommandQuarantined is a required boolean. Enum
// members are read back via `.options` (no magic literals).

const intent = {
  id: "ci-1",
  sessionId: "s-1",
  terminalSessionId: "ts-1",
  paneId: "p-1",
  requestedBy: "user",
  commandPreview: "cat /etc/secret",
  redactedCommandPreview: "cat [REDACTED]",
  requestedPermissions: ["run_safe_commands"],
  approvalState: "approved",
  dispatchState: "recorded",
  createdAt: "2026-06-21T00:00:00.000Z",
};

const payload = {
  intent,
  role: "code",
  host: "local_mac",
  tmuxSessionName: "main",
  rawCommandQuarantined: true,
};

describe("terminal command dispatch — state machine + observable event vocabulary", () => {
  it("dispatchState is the closed six-state lifecycle; unknown states are rejected", () => {
    expect(terminalCommandDispatchStateSchema.options).toEqual([
      "recorded",
      "pending_approval",
      "blocked",
      "dry_run",
      "sent",
      "failed",
    ]);
    expect(terminalCommandDispatchStateSchema.safeParse("queued").success).toBe(false);
  });

  it("the command event type is exactly the five lifecycle events — no approved/applied", () => {
    expect(terminalCommandEventTypeSchema.options).toEqual([
      "terminal.command.intent.created",
      "terminal.command.blocked",
      "terminal.command.dry_run",
      "terminal.command.sent",
      "terminal.command.failed",
    ]);
    expect(terminalCommandEventTypeSchema.options).not.toContain("terminal.command.approved");
    expect(terminalCommandEventTypeSchema.options).not.toContain("terminal.command.applied");
  });
});

describe("terminalCommandIntent — required redaction companion", () => {
  it("accepts a fully-formed intent (blockedReason omitted is fine)", () => {
    expect(terminalCommandIntentSchema.safeParse(intent).success).toBe(true);
  });

  it("rejects an intent missing its redacted preview (redaction is not optional)", () => {
    const { redactedCommandPreview: _omit, ...without } = intent;
    expect(terminalCommandIntentSchema.safeParse(without).success).toBe(false);
  });
});

describe("terminalCommandIntent — record strips, event envelope hard-rejects", () => {
  it("the durable intent record silently strips unknown keys (plain object)", () => {
    const parsed = terminalCommandIntentSchema.parse({ ...intent, leaked: "x" });
    expect("leaked" in parsed).toBe(false); // stripped, not thrown
  });

  it("the wire event payload is strict: an unknown key is rejected, not stripped", () => {
    expect(terminalCommandIntentEventPayloadSchema.safeParse(payload).success).toBe(true);
    expect(terminalCommandIntentEventPayloadSchema.safeParse({ ...payload, leaked: "x" }).success).toBe(false);
  });

  it("requires the rawCommandQuarantined flag on the wire payload", () => {
    const { rawCommandQuarantined: _omit, ...without } = payload;
    expect(terminalCommandIntentEventPayloadSchema.safeParse(without).success).toBe(false);
  });
});
