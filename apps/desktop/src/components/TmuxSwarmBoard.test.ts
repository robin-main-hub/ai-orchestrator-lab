import { describe, expect, it } from "vitest";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import {
  createTmuxOperationFailedBlock,
  createTmuxOperationStartedBlock,
  deriveTmuxCommandCenterForTest,
  mapTmuxPaneStateToAgentState,
  resolveTmuxTimelineBlocks,
  summarizeTmuxFleetCounts,
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

describe("mapTmuxPaneStateToAgentState", () => {
  it("완료된 캡처(captured)는 진행 중이 아니라 완료(success)로 매핑한다", () => {
    // 회귀: 기존 includes(\"captur\")는 captured를 responding(진행 중)으로 오분류했다.
    expect(mapTmuxPaneStateToAgentState("captured")).toBe("success");
  });

  it("진행 중 캡처(capturing)와 디스패치(dispatching)는 responding으로 유지한다", () => {
    expect(mapTmuxPaneStateToAgentState("capturing")).toBe("responding");
    expect(mapTmuxPaneStateToAgentState("dispatching")).toBe("responding");
  });

  it("캡처/디스패치 실패는 error로 매핑한다", () => {
    expect(mapTmuxPaneStateToAgentState("capture failed")).toBe("error");
    expect(mapTmuxPaneStateToAgentState("dispatch failed")).toBe("error");
    expect(mapTmuxPaneStateToAgentState("blocked")).toBe("error");
  });

  it("정본 라이프사이클 상태를 정확히 매핑한다", () => {
    expect(mapTmuxPaneStateToAgentState("recorded")).toBe("success");
    expect(mapTmuxPaneStateToAgentState("sent")).toBe("success");
    expect(mapTmuxPaneStateToAgentState("dry_run")).toBe("success");
    expect(mapTmuxPaneStateToAgentState("pending_approval")).toBe("waiting_approval");
    expect(mapTmuxPaneStateToAgentState("disabled")).toBe("idle");
  });

  it("서술형 시드 상태는 휴리스틱 폴백으로 매핑한다", () => {
    expect(mapTmuxPaneStateToAgentState("chat active")).toBe("working");
    expect(mapTmuxPaneStateToAgentState("guarding")).toBe("working");
    expect(mapTmuxPaneStateToAgentState("recommended")).toBe("working");
    expect(mapTmuxPaneStateToAgentState("dispatch gated")).toBe("waiting_approval");
    expect(mapTmuxPaneStateToAgentState("ready")).toBe("success");
    expect(mapTmuxPaneStateToAgentState("watch only")).toBe("idle");
    expect(mapTmuxPaneStateToAgentState("standby")).toBe("idle");
  });
});

describe("summarizeTmuxFleetCounts", () => {
  it('"작업" 카운트는 진행 상태만 세고 완료(done)·유휴는 제외한다', () => {
    const counts = summarizeTmuxFleetCounts([
      "working",
      "responding",
      "success", // 완료 — 작업 카운트에서 제외되어야 한다
      "idle",
      "waiting_approval",
      "error",
    ]);

    expect(counts.active).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.error).toBe(1);
  });

  it("완료된 캡처 pane(captured→success)은 작업 카운트에 잡히지 않는다", () => {
    const states = ["captured", "capturing"].map(mapTmuxPaneStateToAgentState);
    // captured→success(제외), capturing→responding(포함) ⇒ active 1
    expect(summarizeTmuxFleetCounts(states).active).toBe(1);
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
