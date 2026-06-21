import { describe, expect, it } from "vitest";
import {
  parseTerminalCommandEventPayload,
  terminalCommandBlockedEventPayloadSchema,
  terminalCommandDryRunEventPayloadSchema,
  terminalCommandFailedEventPayloadSchema,
  terminalCommandSentEventPayloadSchema,
} from "./index.js";

// The four terminal command OUTCOME event payloads (blocked / dry_run / sent /
// failed) are the per-result wire shapes a dispatch attempt resolves to; the
// already-pinned intent-created payload is the REQUEST, these are the RESULTS.
// The existing index.test.ts only smoke-tests that each type's happy-path
// payload doesn't throw — the schemas' safety invariants were never pinned. The
// FRESH authority angle here is REFUSED-PATH REDACTION + a structural
// "not-attempted" guard + type-dispatch routing fidelity: (1) REFUSED PATH
// ALWAYS REDACTED — when a command is blocked (refused) or dry_run (simulated),
// the payload carries a REQUIRED redactedCommandPreview (never the raw command);
// omitting it fails. The sent/failed payloads (the command actually ran) instead
// carry only optional stdout/stderrPreview — they never echo the command back.
// (2) DRY_RUN STRUCTURALLY DID-NOT-RUN — the dry_run payload's `attempted` is
// z.literal(false): a dry_run can never claim it ran (attempted:true rejected),
// and the flag is required. (3) FAILED = SENT + reason — the failed payload is
// the sent shape extended with a required `reason`; sent has no reason and,
// being .strict(), rejects one. (4) ROUTING FIDELITY — parseTerminalCommandEvent
// Payload routes each event type to its OWN strict schema, so a payload shaped
// for one outcome is rejected when parsed under another type. All four payloads
// are .strict(): an unknown key is rejected, not stripped.

const base = {
  intentId: "ci-1",
  terminalSessionId: "ts-1",
  paneId: "p-1",
  role: "code",
  host: "local_mac",
};

const blocked = { ...base, reason: "approval required", redactedCommandPreview: "cat [REDACTED]" };
const dryRun = { ...base, reason: "dry run", attempted: false, redactedCommandPreview: "cat [REDACTED]" };
const sent = { ...base, stdoutPreview: "ok", stderrPreview: "" };
const failed = { ...base, reason: "script failed", stderrPreview: "boom" };

describe("terminal command outcomes — refused path always carries a redacted preview", () => {
  it("blocked requires reason + redactedCommandPreview and is strict", () => {
    expect(terminalCommandBlockedEventPayloadSchema.safeParse(blocked).success).toBe(true);
    const { redactedCommandPreview: _omit, ...without } = blocked;
    expect(terminalCommandBlockedEventPayloadSchema.safeParse(without).success).toBe(false);
    expect(terminalCommandBlockedEventPayloadSchema.safeParse({ ...blocked, leaked: "x" }).success).toBe(false);
  });

  it("dry_run requires the redacted preview too (a simulated command is never echoed raw)", () => {
    expect(terminalCommandDryRunEventPayloadSchema.safeParse(dryRun).success).toBe(true);
    const { redactedCommandPreview: _omit, ...without } = dryRun;
    expect(terminalCommandDryRunEventPayloadSchema.safeParse(without).success).toBe(false);
  });
});

describe("terminal command dry_run — structurally did-not-run", () => {
  it("attempted is the literal false — a dry_run cannot claim it ran", () => {
    expect(terminalCommandDryRunEventPayloadSchema.safeParse({ ...dryRun, attempted: true }).success).toBe(false);
  });

  it("attempted is required — omitting it fails", () => {
    const { attempted: _omit, ...without } = dryRun;
    expect(terminalCommandDryRunEventPayloadSchema.safeParse(without).success).toBe(false);
  });
});

describe("terminal command sent / failed — failed = sent + reason", () => {
  it("sent accepts optional stdout/stderr and rejects a stray reason (reason belongs to failed)", () => {
    expect(terminalCommandSentEventPayloadSchema.safeParse(sent).success).toBe(true);
    expect(terminalCommandSentEventPayloadSchema.safeParse(base).success).toBe(true); // both previews optional
    expect(terminalCommandSentEventPayloadSchema.safeParse({ ...sent, reason: "x" }).success).toBe(false);
  });

  it("failed is the sent shape plus a required reason", () => {
    expect(terminalCommandFailedEventPayloadSchema.safeParse(failed).success).toBe(true);
    const { reason: _omit, ...without } = failed;
    expect(terminalCommandFailedEventPayloadSchema.safeParse(without).success).toBe(false);
  });
});

describe("parseTerminalCommandEventPayload — type-dispatch routing fidelity", () => {
  it("routes each type to its own schema for a well-formed payload", () => {
    expect(() => parseTerminalCommandEventPayload("terminal.command.blocked", blocked)).not.toThrow();
    expect(() => parseTerminalCommandEventPayload("terminal.command.dry_run", dryRun)).not.toThrow();
    expect(() => parseTerminalCommandEventPayload("terminal.command.sent", sent)).not.toThrow();
    expect(() => parseTerminalCommandEventPayload("terminal.command.failed", failed)).not.toThrow();
  });

  it("rejects a payload shaped for a different outcome (parser is not a loose any-shape gate)", () => {
    // a failed-shaped payload (carries reason) under the strict sent type is rejected
    expect(() => parseTerminalCommandEventPayload("terminal.command.sent", failed)).toThrow();
    // a sent-shaped payload (no reason) under the failed type is rejected (reason required)
    expect(() => parseTerminalCommandEventPayload("terminal.command.failed", sent)).toThrow();
    // a dry_run-shaped payload (attempted/redacted) under the sent type is rejected
    expect(() => parseTerminalCommandEventPayload("terminal.command.sent", dryRun)).toThrow();
  });
});
