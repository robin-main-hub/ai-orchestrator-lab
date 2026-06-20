import type {
  OperatorCockpitMemoryRecall,
  OperatorCockpitProviderRouting,
  OperatorCockpitWorkerFleet,
} from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { resolveOperatorWorkerDetailDisplay } from "./workerDisplay";

// Characterization tests for resolveOperatorWorkerDetailDisplay (no behavior
// change). It is the last uncovered pure export in workerDisplay.ts; importing
// the module evaluates only top-level definitions (protocol types + pure
// lib/component helpers), no React, DOM, or network. The composite output's
// `identity` and `skills` slices are already pinned elsewhere
// (operatorWorkerDisplay.test.ts / workerDisplay.test.ts), so here we pin the
// three module-private sub-projections — createWorkerMemoryDisplay,
// createWorkerModelDisplay, createWorkerRecentDisplay — which are only
// reachable through this entry point, plus the roleBriefs lookup. The model
// route label composes formatOperatorProviderLabel/formatOperatorModelLabel
// (pinned in workerDisplay.formatters.test.ts), so we pin the joined string.

const baseWorker: OperatorCockpitWorkerFleet = {
  workerId: "worker-1",
  role: "executor",
  status: "working",
  statusRingColor: "green",
};

describe("resolveOperatorWorkerDetailDisplay — default (absent) branches", () => {
  const block = resolveOperatorWorkerDetailDisplay({ worker: baseWorker });

  it("fills the waiting placeholders when memory and routing are absent", () => {
    expect(block.memory).toEqual({
      detail: "기억 스냅샷 연결 대기",
      primary: "기억 연결 대기",
      reasons: ["조회 근거 대기"],
      warningLabel: "충돌 점검 대기",
    });
    expect(block.model).toEqual({
      badges: ["경로 대기"],
      detail: "라우팅 스냅샷 연결 대기",
      routeLabel: "공급자 대기 / 모델 연결 대기",
    });
  });

  it("derives the recent display from a bare worker (no scope/branch/worktree)", () => {
    expect(block.recent).toEqual({
      detail: "최근 신호를 실시간으로 반영 중",
      location: "실시간 관찰",
      statusLabel: "작업 중",
    });
  });

  it("looks up the role brief and carries identity/skills through", () => {
    expect(block.roleBrief).toBe("승인된 실행을 터미널과 기록 흐름으로 안전하게 전달합니다.");
    expect(block.identity).toBeDefined();
    expect(typeof block.skills.label).toBe("string");
  });
});

describe("resolveOperatorWorkerDetailDisplay — memory projection", () => {
  it("formats authority + mirror, counts warnings, and caps reasons at three", () => {
    const memory: OperatorCockpitMemoryRecall = {
      contextReasons: ["r1", "r2", "r3", "r4"],
      macBookAuthorityEnabled: true,
      dgxMirrorHealth: "healthy",
      contradictionWarnings: ["w1", "w2"],
    };
    const block = resolveOperatorWorkerDetailDisplay({ memory, worker: baseWorker });
    expect(block.memory).toEqual({
      detail: "충돌 경고 2건",
      primary: "MacBook 기준 기억 · DGX 정상",
      reasons: ["r1", "r2", "r3"],
      warningLabel: "검토 필요",
    });
  });

  it("falls back to the authority-unconfirmed label and reason placeholder when empty", () => {
    const memory: OperatorCockpitMemoryRecall = {
      contextReasons: [],
      macBookAuthorityEnabled: false,
      dgxMirrorHealth: "degraded",
      contradictionWarnings: [],
    };
    const block = resolveOperatorWorkerDetailDisplay({ memory, worker: baseWorker });
    expect(block.memory).toEqual({
      detail: "충돌 경고 없음",
      primary: "기억 기준 확인 필요 · DGX 저하",
      reasons: ["대화 기억 후보 대기"],
      warningLabel: "정상",
    });
  });
});

describe("resolveOperatorWorkerDetailDisplay — model projection", () => {
  it("filters present badge labels, keeps the route label, composes provider/model", () => {
    const routing: OperatorCockpitProviderRouting = {
      selectedModelId: "claude-opus-4-6",
      fallbackStatus: "available",
      costBadge: "low",
      speedBadge: "fast",
      trustBadge: "trusted",
      readinessLabel: "준비됨",
      secretPolicyLabel: "정책 통과",
      providerLabel: "mimo",
      routeLabel: "현재 경로 X",
    };
    const block = resolveOperatorWorkerDetailDisplay({ routing, worker: baseWorker });
    expect(block.model).toEqual({
      badges: ["대체 경로 있음", "신뢰됨", "준비됨", "정책 통과"],
      detail: "현재 경로 X",
      routeLabel: "MiMo / Claude Opus 4.6",
    });
  });

  it("drops undefined optional badges and uses the route-label fallback", () => {
    const routing: OperatorCockpitProviderRouting = {
      selectedModelId: "gpt-5",
      fallbackStatus: "none",
      costBadge: "high",
      speedBadge: "slow",
      trustBadge: "untrusted",
    };
    const block = resolveOperatorWorkerDetailDisplay({ routing, worker: baseWorker });
    expect(block.model).toEqual({
      badges: ["대체 경로 없음", "비신뢰"],
      detail: "현재 선택 경로",
      routeLabel: "공급자 대기 / GPT 5",
    });
  });
});

describe("resolveOperatorWorkerDetailDisplay — recent projection", () => {
  it("prefers branch over worktree and blockedReason over scope", () => {
    const worker: OperatorCockpitWorkerFleet = {
      ...baseWorker,
      status: "blocked",
      surface: "tmux",
      lane: "approve",
      branch: "feature/x",
      worktree: "/a/b/c",
      blockedReason: "권한 대기",
    };
    const block = resolveOperatorWorkerDetailDisplay({ worker });
    expect(block.recent).toEqual({
      detail: "권한 대기",
      location: "브랜치 feature/x",
      statusLabel: "차단됨",
    });
  });

  it("falls back to the worktree label and uses scope as detail when no branch/blockedReason", () => {
    const worker: OperatorCockpitWorkerFleet = {
      ...baseWorker,
      status: "idle",
      surface: "conversation",
      worktree: "/Users/robin/work/repo",
    };
    const block = resolveOperatorWorkerDetailDisplay({ worker });
    expect(block.recent).toEqual({
      detail: "대화",
      location: "작업공간 repo",
      statusLabel: "대기",
    });
  });
});
