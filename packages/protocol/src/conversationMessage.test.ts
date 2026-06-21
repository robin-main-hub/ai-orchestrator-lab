import { describe, expect, it } from "vitest";
import { conversationMessageSchema } from "./index.js";

// conversationMessageSchema is the DURABLE persisted conversation turn — the row
// stored in the OS's own conversation log — as opposed to providerCompletionMessage
// (the wire turn handed to an adapter, already pinned with its 200_000-char content
// cap). It was never pinned. The FRESH authority angle here is DURABLE TURN WITH A
// CONTROLLED-EXTENSIBILITY METADATA ESCAPE-HATCH: the persisted record is
// deliberately more permissive than the wire shape in exactly two ways, and locked
// down in a third. (1) SAME CLOSED ROLE VOCAB — role is exactly {user, assistant,
// system, tool}; an unknown speaker is rejected, so a stored turn can never be
// attributed to an unmodelled role. (2) CONTENT IS UNCAPPED ON THE DURABLE SIDE —
// unlike the wire message's 200_000-char DoS cap, the persisted content is a plain
// z.string() with no max: the store keeps the full turn (the cap belongs to egress,
// not the system of record). (3) METADATA IS AN EXPLICIT OPEN BAG — `metadata` is
// an optional z.record(z.unknown()): arbitrary structured side-data is CARRIED
// verbatim under that one declared field. (4) BUT THE TOP LEVEL STILL STRIPS —
// being a plain z.object, an unknown TOP-LEVEL key is stripped, NOT carried; the
// only sanctioned extension point is the `metadata` bag, so a forged sibling field
// cannot ride along beside it. Core id/sessionId/role/content/createdAt required.

const message = {
  id: "msg-1",
  sessionId: "session-1",
  role: "assistant",
  content: "pinned the durable turn shape",
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("conversationMessage — closed role vocab", () => {
  it("admits exactly {user, assistant, system, tool}", () => {
    for (const role of ["user", "assistant", "system", "tool"]) {
      expect(conversationMessageSchema.safeParse({ ...message, role }).success).toBe(true);
    }
    expect(conversationMessageSchema.safeParse({ ...message, role: "narrator" }).success).toBe(false);
  });
});

describe("conversationMessage — durable record is more permissive than the wire", () => {
  it("accepts a minimal turn", () => {
    expect(conversationMessageSchema.safeParse(message).success).toBe(true);
  });

  it("requires the core fields — a missing content fails", () => {
    const { content: _omit, ...without } = message;
    expect(conversationMessageSchema.safeParse(without).success).toBe(false);
  });

  it("does NOT cap content (the 200_000 cap is an egress concern, not the system of record)", () => {
    expect(conversationMessageSchema.safeParse({ ...message, content: "x".repeat(300_000) }).success).toBe(true);
  });
});

describe("conversationMessage — metadata escape-hatch vs top-level strip", () => {
  it("carries an arbitrary metadata bag verbatim under the one declared field", () => {
    const parsed = conversationMessageSchema.parse({
      ...message,
      metadata: { latencyMs: 42, tooling: { name: "x", nested: [1, 2] } },
    });
    expect(parsed.metadata).toEqual({ latencyMs: 42, tooling: { name: "x", nested: [1, 2] } });
  });

  it("treats metadata as optional (absent and empty are both legal)", () => {
    expect(conversationMessageSchema.safeParse(message).success).toBe(true); // absent
    expect(conversationMessageSchema.safeParse({ ...message, metadata: {} }).success).toBe(true); // empty
  });

  it("strips an unknown TOP-LEVEL key — only metadata is a sanctioned extension point", () => {
    const parsed = conversationMessageSchema.parse({ ...message, forgedSibling: "should not ride along" });
    expect("forgedSibling" in parsed).toBe(false);
  });
});
