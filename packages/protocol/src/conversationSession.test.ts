import { describe, expect, it } from "vitest";
import { conversationSessionSchema, workModeSchema } from "./index.js";

// conversationSessionSchema is the TOP-LEVEL session record — the container the OS
// organizes a unit of work around (its messages, linked runs/debates, memory traces,
// persona overrides). index.test.ts touches it once, but only to read back the
// persona-override fields on a happy-path parse; the RECORD-LEVEL invariants are
// unpinned. The FRESH authority angle here is SESSION-RECORD INTEGRITY: a session is
// always a complete, correctly-typed container, never a partial or mistyped one.
// (1) MODE IS LITERAL-LOCKED — `mode` is z.literal("conversation"), NOT the workMode
// enum: a session at mode "debate" or "tmux" is rejected even though those are valid
// workMode members, so the conversation-session record is specifically the
// conversation-mode container and cannot masquerade as another mode. (2) CHANNEL IS A
// CLOSED ORIGIN SET — {desktop, external_legacy, mobile, api}, and notably NOT "agent":
// a session originates from a human-facing/ingress channel, never claims to have been
// opened by an agent. (3) A SESSION NAMES ITS PRIMARY AGENT — primaryAgentId is
// required: no anonymous session. (4) THE LINK ARRAYS ARE MATERIALIZED SCAFFOLDING —
// messages / linkedRuns / linkedDebates / memoryTraceIds are all required arrays (may
// be empty, never absent), so a session's cross-references always exist as a concrete
// (possibly empty) list rather than undefined. (5) BACKUP STATUS EMBEDDED BY VALUE —
// an unknown backupStatus is transitively rejected. (6) PLAIN-OBJECT STRIP — an unknown
// key is stripped, not carried.

const session = {
  id: "session_1",
  mode: "conversation",
  channel: "desktop",
  primaryAgentId: "agent_orchestrator",
  messages: [],
  linkedRuns: [],
  linkedDebates: [],
  memoryTraceIds: [],
  backupStatus: "pending",
};

describe("conversationSession — session-record integrity", () => {
  it("accepts a well-formed conversation session", () => {
    expect(conversationSessionSchema.safeParse(session).success).toBe(true);
  });

  it("locks mode to the literal 'conversation' — other workModes are rejected as a session mode", () => {
    expect(workModeSchema.safeParse("debate").success).toBe(true);
    expect(workModeSchema.safeParse("tmux").success).toBe(true);
    expect(conversationSessionSchema.safeParse({ ...session, mode: "debate" }).success).toBe(false);
    expect(conversationSessionSchema.safeParse({ ...session, mode: "tmux" }).success).toBe(false);
  });

  it("admits only the human-facing/ingress channels — never 'agent'", () => {
    for (const channel of ["desktop", "external_legacy", "mobile", "api"]) {
      expect(conversationSessionSchema.safeParse({ ...session, channel }).success).toBe(true);
    }
    expect(conversationSessionSchema.safeParse({ ...session, channel: "agent" }).success).toBe(false);
  });

  it("requires a named primary agent — no anonymous session", () => {
    const { primaryAgentId: _omit, ...without } = session;
    expect(conversationSessionSchema.safeParse(without).success).toBe(false);
  });

  it("requires the link arrays as materialized scaffolding (may be empty, never absent)", () => {
    const { messages: _omitMessages, ...noMessages } = session;
    const { linkedRuns: _omitRuns, ...noRuns } = session;
    expect(conversationSessionSchema.safeParse(noMessages).success).toBe(false);
    expect(conversationSessionSchema.safeParse(noRuns).success).toBe(false);
  });
});

describe("conversationSession — embedded vocab + plain-object strip", () => {
  it("transitively rejects an unknown backupStatus (by-value embed)", () => {
    expect(conversationSessionSchema.safeParse({ ...session, backupStatus: "stale" }).success).toBe(false);
  });

  it("strips an unknown key rather than carrying it", () => {
    const parsed = conversationSessionSchema.parse({ ...session, forgedAuthority: "elevated" });
    expect("forgedAuthority" in parsed).toBe(false);
  });
});
