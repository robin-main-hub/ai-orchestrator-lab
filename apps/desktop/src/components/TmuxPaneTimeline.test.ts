import { describe, expect, it } from "vitest";
import { makeSyntheticBlock } from "./TmuxPaneTimeline";

// Characterization tests for makeSyntheticBlock (no behavior change). It is a
// pure exported host helper that projects a dispatch/capture-style input into a
// TerminalTimelineBlock, filling defaults and passing the rest through. No
// React render, no DOM, no network — importing the module only evaluates its
// top-level definitions. The id (`block_<kind>_<Date.now()>_<rand>`) and
// createdAt (new Date().toISOString()) are non-deterministic, so we assert them
// structurally rather than pinning a value. We pin the default-filling
// (summary ?? "", redactionApplied ?? false, relatedEventIds: []), the
// role/host casts (verbatim passthrough), and the optional-field passthrough.

const base = {
  paneId: "pane-1",
  role: "executor",
  host: "dgx-02",
  sessionId: "sess-1",
  terminalSessionId: "term-1",
  kind: "dispatch" as const,
  status: "running" as const,
  title: "build",
};

describe("makeSyntheticBlock", () => {
  it("fills defaults when optional fields are omitted", () => {
    const block = makeSyntheticBlock(base);
    expect(block.summary).toBe("");
    expect(block.redactionApplied).toBe(false);
    expect(block.relatedEventIds).toEqual([]);
    expect(block.outputPreview).toBeUndefined();
    expect(block.approvalId).toBeUndefined();
    expect(block.runId).toBeUndefined();
  });

  it("passes required fields and casts role/host through verbatim", () => {
    const block = makeSyntheticBlock(base);
    expect(block.paneId).toBe("pane-1");
    expect(block.role).toBe("executor");
    expect(block.host).toBe("dgx-02");
    expect(block.sessionId).toBe("sess-1");
    expect(block.terminalSessionId).toBe("term-1");
    expect(block.kind).toBe("dispatch");
    expect(block.status).toBe("running");
    expect(block.title).toBe("build");
  });

  it("passes optional fields through when provided", () => {
    const block = makeSyntheticBlock({
      ...base,
      summary: "did a thing",
      outputPreview: "ok",
      approvalId: "appr-9",
      runId: "run-9",
      redactionApplied: true,
    });
    expect(block.summary).toBe("did a thing");
    expect(block.outputPreview).toBe("ok");
    expect(block.approvalId).toBe("appr-9");
    expect(block.runId).toBe("run-9");
    expect(block.redactionApplied).toBe(true);
  });

  it("stamps a kind-tagged id and an ISO createdAt (structural, non-deterministic)", () => {
    const block = makeSyntheticBlock(base);
    expect(block.id).toMatch(/^block_dispatch_\d+_[a-z0-9]+$/);
    expect(() => new Date(block.createdAt).toISOString()).not.toThrow();
    expect(new Date(block.createdAt).toISOString()).toBe(block.createdAt);
  });
});
