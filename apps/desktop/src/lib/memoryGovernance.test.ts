import { describe, expect, it } from "vitest";
import type { MemoryRecord, MemoryStats } from "@ai-orchestrator/protocol";
import {
  createAgentChannelMemoryInstallAudit,
  createAgentChannelMemoryScope,
} from "./agentConversationChannels";
import { createMemoryGovernanceSummary } from "./memoryGovernance";

const baseRecord: MemoryRecord = {
  id: "memory_1",
  layer: "project_memory",
  scope: "project",
  kind: "decision",
  title: "MacBook authority",
  content: "MacBook operator authority",
  sourceChannel: "desktop",
  trustLevel: "trusted",
  activationState: "active",
  createdAt: "2026-06-05T08:00:00.000Z",
  pinned: true,
};

const stats: MemoryStats = {
  activeRecords: 1,
  contradictionCandidates: 0,
  duplicateCandidates: 0,
  health: "good",
  pinnedRecords: 1,
  quarantinedRecords: 0,
  relationCount: 2,
  staleCandidates: 0,
  totalRecords: 1,
};

describe("memoryGovernance", () => {
  it("summarizes all-agent installation and current agent scope in Korean", () => {
    const installAudit = createAgentChannelMemoryInstallAudit(
      [{ id: "agent_orchestrator" }, { id: "agent_executor" }],
      "session_main",
      "provider_mimo_token_openai",
    );
    const scope = createAgentChannelMemoryScope("agent_orchestrator", "session_main", "provider_mimo_token_openai");

    const summary = createMemoryGovernanceSummary({
      adapterStatus: "ready",
      installAudit,
      records: [baseRecord],
      scope,
      stats,
    });

    expect(summary.installLabel).toBe("전원 기억 설치 완료 · 2/2");
    expect(summary.currentScopeLabel).toBe("에이전트 agent_orchestrator / 세션 session_main");
    expect(summary.status).toBe("ready");
    expect(summary.healthLabel).toBe("기억 상태 정상");
    expect(summary.controls).toContain("현재 맥락 기억");
  });

  it("marks attention when install audit or memory health needs review", () => {
    const installAudit = createAgentChannelMemoryInstallAudit(
      [{ id: "agent_orchestrator" }, { id: "" }],
      "session_main",
      "provider_mimo_token_openai",
    );

    const summary = createMemoryGovernanceSummary({
      adapterStatus: "error",
      installAudit,
      records: [{ ...baseRecord, activationState: "quarantined", pinned: false, tombstonedAt: "2026-06-05T09:00:00.000Z" }],
      stats: { ...stats, health: "needs_review", quarantinedRecords: 1 },
    });

    expect(summary.status).toBe("error");
    expect(summary.installLabel).toBe("기억 설치 확인 필요 · 1/2");
    expect(summary.healthLabel).toBe("기억 어댑터 오류");
    expect(summary.quarantinedCount).toBe(1);
    expect(summary.tombstonedCount).toBe(1);
  });

  it("redacts secret-like provider values in scope labels", () => {
    const installAudit = createAgentChannelMemoryInstallAudit(
      [{ id: "agent_executor" }],
      "session_main",
      "provider https://token-plan-sgp.xiaomimimo.com/v1 Bearer token sk-secret tp-secret /Users/robin/private MIMO_API_KEY=secret",
    );
    const summary = createMemoryGovernanceSummary({
      adapterStatus: "ready",
      installAudit,
      records: [],
      scope: installAudit.scopes[0],
      stats: { ...stats, totalRecords: 0, activeRecords: 0, pinnedRecords: 0 },
    });
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("tp-secret");
    expect(serialized).not.toContain("/Users/robin/private");
    expect(serialized).not.toContain("MIMO_API_KEY=secret");
    expect(summary.currentScopeLabel).toContain("agent_executor");
  });
});
