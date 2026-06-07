import { describe, expect, it } from "vitest";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import {
  createTmuxOperationFailedBlock,
  createTmuxOperationStartedBlock,
  deriveTmuxCommandCenterForTest,
  resolveTmuxTimelineBlocks,
} from "./TmuxSwarmBoard";
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

describe("tmux live operation timeline blocks", () => {
  it("creates a running capture block as soon as pane capture starts", () => {
    const block = createTmuxOperationStartedBlock({
      activeSessionId: "session_1",
      commandPreview: "",
      operation: "capture",
      paneRole: "status",
      paneTitle: "상태",
    });

    expect(block.kind).toBe("capture");
    expect(block.status).toBe("running");
    expect(block.title).toBe("상태 읽는 중");
    expect(block.summary).toBe("상태 패널의 최신 출력을 읽고 있습니다.");
  });

  it("creates a running dispatch block as soon as pane dispatch starts", () => {
    const block = createTmuxOperationStartedBlock({
      activeSessionId: "session_1",
      commandPreview: "pnpm test",
      operation: "dispatch",
      paneRole: "qa",
      paneTitle: "검증",
    });

    expect(block.kind).toBe("dispatch");
    expect(block.status).toBe("running");
    expect(block.title).toBe("검증 전송 중");
    expect(block.summary).toContain("pnpm test");
    expect(block.redactionApplied).toBe(true);
  });

  it("creates a failed block when capture or dispatch throws before the server returns blocks", () => {
    const block = createTmuxOperationFailedBlock({
      activeSessionId: "session_1",
      message: "http://dgx-02:4317 failed",
      operation: "dispatch",
      paneRole: "backend",
      paneTitle: "백엔드",
    });

    expect(block.kind).toBe("dispatch");
    expect(block.status).toBe("failed");
    expect(block.title).toBe("백엔드 전송 실패");
    expect(block.summary).toBe("[redacted:url] failed");
    expect(block.redactionApplied).toBe(true);
  });
});

describe("deriveTmuxCommandCenter", () => {
  it("선택된 작업창의 다음 명령과 최근 결과를 작업대 상단 요약으로 만든다", () => {
    const summary = deriveTmuxCommandCenterForTest({
      commandDraft: "pnpm test",
      lastOutput: "테스트 12개 통과",
      paneRoleLabel: "검증",
      paneStateLabel: "검증 중",
      paneTitle: "검증 작업창",
    });

    expect(summary.title).toBe("검증 작업창");
    expect(summary.statusLabel).toBe("검증 중");
    expect(summary.commandLabel).toBe("pnpm test");
    expect(summary.outputLabel).toBe("테스트 12개 통과");
    expect(summary.roleLabel).toBe("검증");
  });
});
