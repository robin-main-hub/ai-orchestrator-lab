import { describe, expect, it } from "vitest";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import { resolveTmuxTimelineBlocks } from "./TmuxSwarmBoard";
import { makeSyntheticBlock } from "./TmuxPaneTimeline";

const fallbackBlock = {
  createdAt: "2026-06-06T00:00:00.000Z",
  host: "dgx_02",
  id: "block_fallback",
  kind: "capture",
  paneId: "role:status",
  redactionApplied: false,
  relatedEventIds: [],
  role: "status",
  sessionId: "session_1",
  status: "completed",
  summary: "fallback",
  terminalSessionId: "terminal_session_ai_swarm",
  title: "fallback capture",
} satisfies TerminalTimelineBlock;

describe("resolveTmuxTimelineBlocks", () => {
  it("prefers real server timeline blocks over synthetic fallback blocks", () => {
    const serverBlock = {
      ...fallbackBlock,
      id: "block_server",
      outputPreview: "server redacted output",
      redactionApplied: true,
      summary: "server block",
    } satisfies TerminalTimelineBlock;

    expect(resolveTmuxTimelineBlocks([serverBlock], [fallbackBlock])).toEqual([serverBlock]);
  });

  it("uses synthetic fallback blocks when the server does not return timeline blocks", () => {
    expect(resolveTmuxTimelineBlocks(undefined, [fallbackBlock])).toEqual([fallbackBlock]);
    expect(resolveTmuxTimelineBlocks([], [fallbackBlock])).toEqual([fallbackBlock]);
  });
});

describe("makeSyntheticBlock", () => {
  it("can preserve capture redaction state when the host has payload metadata", () => {
    const block = makeSyntheticBlock({
      host: "dgx_02",
      kind: "capture",
      outputPreview: "[redacted] output",
      paneId: "role:status",
      redactionApplied: true,
      role: "status",
      sessionId: "session_1",
      status: "completed",
      terminalSessionId: "terminal_session_ai_swarm",
      title: "status capture",
    });

    expect(block.redactionApplied).toBe(true);
  });
});
