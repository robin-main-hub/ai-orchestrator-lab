import { describe, expect, it } from "vitest";
import {
  terminalPaneSchema,
  terminalPaneStatusSchema,
  terminalSessionStatusSchema,
  tmuxSessionRefSchema,
} from "./index.js";

// tmuxSessionRefSchema and terminalPaneSchema are the DURABLE REGISTRY records
// for a live tmux session and one of its panes — the long-lived "what exists"
// rows, as opposed to the .strict() wire EVENT payloads (intent/outcome) pinned
// in the sibling terminal tests. The existing index.test.ts only happy-path
// .parse()s a fully-valid session+pane; the schemas' invariants were never
// pinned. The FRESH authority angle here is REGISTRY-RECORD INTEGRITY — a
// different shape-discipline from the wire payloads: (1) BACKEND LITERAL-LOCK —
// a tmux session ref's `backend` is z.literal("tmux"); it can never name another
// multiplexer. (2) NON-NEGATIVE INTEGER paneCount — paneCount is an int ≥ 0:
// 0 is fine, a negative or fractional count is impossible and rejected. (3)
// CLOSED STATUS VOCABS — the session status is exactly the six declared lifecycle
// states and the pane status exactly the seven declared states; both reject
// anything unenumerated. (4) PLAIN-OBJECT STRIP (the contrast) — unlike the
// .strict() wire payloads that hard-REJECT an unknown key, these durable records
// are plain z.objects: an unknown key is silently STRIPPED, and the optional
// columns (socketName/lastSeenAt; windowId/agentId/cwd/lastOutputAt) may be
// absent. Enum members read back via `.options`.

const session = {
  id: "ts-1",
  sessionName: "ai-swarm",
  host: "local_mac",
  backend: "tmux",
  attachCommand: "tmux attach -t ai-swarm",
  controlMode: false,
  paneCount: 10,
  createdAt: "2026-06-21T00:00:00.000Z",
  status: "detached",
};

const pane = {
  id: "pane-1",
  sessionId: "s-1",
  terminalSessionId: "ts-1",
  role: "research",
  host: "local_mac",
  paneId: "%8",
  title: "Research Scout",
  status: "idle",
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("tmuxSessionRef — backend literal-lock + non-negative-int paneCount", () => {
  it("accepts a well-formed session ref", () => {
    expect(tmuxSessionRefSchema.safeParse(session).success).toBe(true);
  });

  it("locks backend to the literal 'tmux' — no other multiplexer", () => {
    expect(tmuxSessionRefSchema.safeParse({ ...session, backend: "screen" }).success).toBe(false);
  });

  it("requires a non-negative integer paneCount", () => {
    expect(tmuxSessionRefSchema.safeParse({ ...session, paneCount: 0 }).success).toBe(true);
    expect(tmuxSessionRefSchema.safeParse({ ...session, paneCount: -1 }).success).toBe(false);
    expect(tmuxSessionRefSchema.safeParse({ ...session, paneCount: 1.5 }).success).toBe(false);
  });
});

describe("tmuxSessionRef / terminalPane — closed status vocabularies", () => {
  it("session status admits exactly the six declared lifecycle states", () => {
    expect(terminalSessionStatusSchema.options).toEqual([
      "planned",
      "starting",
      "attached",
      "detached",
      "unreachable",
      "closed",
    ]);
    expect(tmuxSessionRefSchema.safeParse({ ...session, status: "zombie" }).success).toBe(false);
  });

  it("pane status admits exactly the seven declared states", () => {
    expect(terminalPaneStatusSchema.options).toEqual([
      "planned",
      "idle",
      "running",
      "blocked",
      "capturing",
      "stale",
      "closed",
    ]);
    expect(terminalPaneSchema.safeParse({ ...pane, status: "frozen" }).success).toBe(false);
  });
});

describe("terminalPane / tmuxSessionRef — durable records strip unknown keys", () => {
  it("accepts a pane with its optional columns absent", () => {
    expect(terminalPaneSchema.safeParse(pane).success).toBe(true); // no windowId/agentId/cwd/lastOutputAt
  });

  it("strips an unknown key rather than rejecting (durable record, not a strict wire payload)", () => {
    const parsedPane = terminalPaneSchema.parse({ ...pane, leaked: "x" });
    expect("leaked" in parsedPane).toBe(false);
    const parsedSession = tmuxSessionRefSchema.parse({ ...session, leaked: "x" });
    expect("leaked" in parsedSession).toBe(false);
  });
});
