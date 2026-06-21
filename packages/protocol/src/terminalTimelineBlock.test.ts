import { describe, expect, it } from "vitest";
import {
  terminalTimelineBlockKindSchema,
  terminalTimelineBlockSchema,
  terminalTimelineBlockStatusSchema,
  terminalPaneTimelineSchema,
} from "./index.js";

// The terminal TIMELINE BLOCK is the observation/output side of the terminal
// model: where terminalCommandIntent (already pinned) records what a pane was
// ASKED to do, the timeline block records what OBSERVABLY happened in that pane
// and lands in the pane's append-only timeline. None of this cluster was pinned.
// The FRESH authority angle here is STRICT OBSERVATION RECORD + mandatory
// redaction audit: (1) CLOSED KIND/STATUS VOCABS — kind is exactly the eight
// declared block kinds in order (planning…note) and status the eight declared
// states in order (planned…stale); both reject anything unenumerated, and the
// block status is its OWN vocabulary (it carries "completed", which the command
// dispatchState lifecycle does not) — the observation timeline is not just a
// mirror of the dispatch state machine. (2) MANDATORY REDACTION-APPLIED FLAG —
// redactionApplied is a required boolean (NOT optional): every persisted block
// declares whether redaction ran, so an unredacted outputPreview can never be
// logged without that fact being recorded. relatedEventIds is a required array
// too — a block always declares its provenance links. (3) STRICT RECORD — unlike
// the durable command-intent record (a plain z.object that silently strips
// unknown keys), the timeline block is .strict(): an unknown key is REJECTED,
// not stripped, so nothing rides along in the observation log. (4) BY-VALUE
// EMBED — terminalPaneTimeline embeds blocks by-value (z.array of the block
// schema) and is itself .strict(), so a timeline transitively rejects a block
// whose nested kind/status is bad. Enum members read back via `.options`.

const block = {
  id: "blk-1",
  sessionId: "s-1",
  terminalSessionId: "ts-1",
  paneId: "p-1",
  role: "code",
  host: "local_mac",
  kind: "capture",
  status: "completed",
  title: "ran build",
  summary: "build succeeded",
  relatedEventIds: ["ev-1", "ev-2"],
  redactionApplied: false,
  createdAt: "2026-06-21T00:00:00.000Z",
};

const timeline = {
  id: "tl-1",
  sessionId: "s-1",
  terminalSessionId: "ts-1",
  paneId: "p-1",
  role: "code",
  host: "local_mac",
  blocks: [block],
  updatedAt: "2026-06-21T00:00:00.000Z",
};

describe("terminalTimelineBlock — closed kind/status vocabularies", () => {
  it("kind admits exactly the eight declared block kinds in order", () => {
    expect(terminalTimelineBlockKindSchema.options).toEqual([
      "planning",
      "command_intent",
      "approval",
      "dry_run",
      "dispatch",
      "capture",
      "handoff",
      "note",
    ]);
    expect(terminalTimelineBlockKindSchema.safeParse("shell").success).toBe(false);
  });

  it("status admits exactly the eight declared states in order — its own vocab, not the dispatch machine", () => {
    expect(terminalTimelineBlockStatusSchema.options).toEqual([
      "planned",
      "pending_approval",
      "blocked",
      "dry_run",
      "running",
      "completed",
      "failed",
      "stale",
    ]);
    // "completed" is an observation-side state the command dispatchState lacks,
    // and the dispatch-only "sent" is NOT a timeline-block status.
    expect(terminalTimelineBlockStatusSchema.options).toContain("completed");
    expect(terminalTimelineBlockStatusSchema.options).not.toContain("sent");
  });
});

describe("terminalTimelineBlock — mandatory redaction audit + strict record", () => {
  it("accepts a fully-formed block", () => {
    expect(terminalTimelineBlockSchema.safeParse(block).success).toBe(true);
  });

  it("requires the redactionApplied boolean — redaction audit is not optional", () => {
    const { redactionApplied: _omit, ...without } = block;
    expect(terminalTimelineBlockSchema.safeParse(without).success).toBe(false);
  });

  it("requires the relatedEventIds provenance array", () => {
    const { relatedEventIds: _omit, ...without } = block;
    expect(terminalTimelineBlockSchema.safeParse(without).success).toBe(false);
  });

  it("is strict: an unknown key is rejected, not stripped (nothing rides along in the log)", () => {
    expect(terminalTimelineBlockSchema.safeParse({ ...block, leaked: "x" }).success).toBe(false);
  });
});

describe("terminalPaneTimeline — strict by-value embed", () => {
  it("accepts a timeline carrying a well-formed block", () => {
    expect(terminalPaneTimelineSchema.safeParse(timeline).success).toBe(true);
  });

  it("transitively rejects a block whose nested kind or status is bad", () => {
    expect(
      terminalPaneTimelineSchema.safeParse({ ...timeline, blocks: [{ ...block, kind: "bogus" }] }).success,
    ).toBe(false);
    expect(
      terminalPaneTimelineSchema.safeParse({ ...timeline, blocks: [{ ...block, status: "sent" }] }).success,
    ).toBe(false);
  });

  it("is itself strict: an unknown key on the timeline is rejected", () => {
    expect(terminalPaneTimelineSchema.safeParse({ ...timeline, leaked: "x" }).success).toBe(false);
  });
});
