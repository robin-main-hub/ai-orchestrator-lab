// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ProviderProfile, RmasRunRecord, RmasRunSummary, RmasTraceEvent } from "@ai-orchestrator/protocol";
import {
  agentDotMeta,
  buildDefaultSettings,
  buildRunConfig,
  elapsedMsFor,
  foldTraceSnapshot,
  formatElapsed,
  formatTokenCount,
  isRunningStatus,
  isTerminalStatus,
  loadRmasSettings,
  mergeTraceEvent,
  PATTERN_DESCRIPTION,
  pickReattachRun,
  saveRmasSettings,
  terminalBannerFor,
} from "./rmasViewModel";

const providers: ProviderProfile[] = [
  {
    id: "provider_dgx02_vllm",
    name: "DGX vLLM",
    kind: "openai",
    enabled: true,
    tags: [],
    trustLevel: "trusted",
    defaultModel: "qwen36-domain-lora-v5-prisma",
  },
];

function trace(id: string, createdAt: string): RmasTraceEvent {
  return { id, runId: "r1", type: "rmas.agent.message", severity: "info", title: id, summary: "", createdAt };
}

describe("agentDotMeta", () => {
  it("maps each live status to a tone + Korean label", () => {
    expect(agentDotMeta("idle")).toMatchObject({ tone: "idle", label: "대기" });
    expect(agentDotMeta("thinking")).toMatchObject({ tone: "thinking", label: "생각 중" });
    expect(agentDotMeta("done")).toMatchObject({ tone: "done", label: "완료" });
    expect(agentDotMeta("error")).toMatchObject({ tone: "error", label: "오류" });
    expect(agentDotMeta(undefined).tone).toBe("idle");
    expect(agentDotMeta("thinking").className).toContain("animate-pulse");
  });
});

describe("formatting", () => {
  it("formatTokenCount uses full-number locale grouping (no 만/억 abbreviation)", () => {
    expect(formatTokenCount(12500000)).toBe((12500000).toLocaleString());
    expect(formatTokenCount(undefined)).toBe("0");
    expect(formatTokenCount(-5)).toBe("0");
  });

  it("formatElapsed renders mm:ss zero-padded", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_000)).toBe("01:05");
    expect(formatElapsed(3_600_000)).toBe("60:00");
  });

  it("elapsedMsFor uses end−start when finished, now−start while live", () => {
    const running = { startedAt: "2026-07-09T00:00:00.000Z", endedAt: undefined };
    const now = Date.parse("2026-07-09T00:00:30.000Z");
    expect(elapsedMsFor(running, now)).toBe(30_000);
    const done = { startedAt: "2026-07-09T00:00:00.000Z", endedAt: "2026-07-09T00:00:10.000Z" };
    expect(elapsedMsFor(done, now)).toBe(10_000);
    expect(elapsedMsFor(null, now)).toBe(0);
  });
});

describe("status predicates + banner", () => {
  it("classifies terminal vs running statuses", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("exhausted")).toBe(true);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isRunningStatus("running")).toBe(true);
    expect(isRunningStatus("queued")).toBe(true);
    expect(isRunningStatus("completed")).toBe(false);
  });

  it("terminalBannerFor returns the right tone/title per terminal status", () => {
    const base = { status: "completed" } as RmasRunRecord;
    expect(terminalBannerFor(base)).toEqual({ tone: "success", title: "수용된 최종 산출물 표시" });
    expect(terminalBannerFor({ status: "exhausted", exhaustedReason: "max_tokens" } as RmasRunRecord)).toEqual({
      tone: "warning",
      title: "실행 소진 · 토큰 한도",
    });
    expect(terminalBannerFor({ status: "stopped" } as RmasRunRecord)?.tone).toBe("warning");
    expect(terminalBannerFor({ status: "running" } as RmasRunRecord)).toBeNull();
    expect(terminalBannerFor(null)).toBeNull();
  });
});

describe("pickReattachRun", () => {
  it("returns the newest running/queued run (summaries are newest-first)", () => {
    const summaries = [
      { runId: "c", status: "completed" },
      { runId: "b", status: "running" },
      { runId: "a", status: "queued" },
    ] as RmasRunSummary[];
    expect(pickReattachRun(summaries)?.runId).toBe("b");
    expect(pickReattachRun([{ runId: "x", status: "completed" }] as RmasRunSummary[])).toBeUndefined();
  });
});

describe("trace fold", () => {
  it("mergeTraceEvent dedupes by id and keeps createdAt order", () => {
    let list = [trace("a", "2026-07-09T00:00:01.000Z")];
    list = mergeTraceEvent(list, trace("c", "2026-07-09T00:00:03.000Z"));
    list = mergeTraceEvent(list, trace("b", "2026-07-09T00:00:02.000Z"));
    expect(list.map((event) => event.id)).toEqual(["a", "b", "c"]);
    // duplicate id replaces, does not append
    list = mergeTraceEvent(list, trace("b", "2026-07-09T00:00:02.000Z"));
    expect(list).toHaveLength(3);
  });

  it("foldTraceSnapshot dedupes and sorts", () => {
    const folded = foldTraceSnapshot([
      trace("b", "2026-07-09T00:00:02.000Z"),
      trace("a", "2026-07-09T00:00:01.000Z"),
      trace("b", "2026-07-09T00:00:02.000Z"),
    ]);
    expect(folded.map((event) => event.id)).toEqual(["a", "b"]);
  });
});

describe("settings + config assembly", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("buildDefaultSettings produces the classic 3 slots + defaults bound to first provider", () => {
    const settings = buildDefaultSettings(providers);
    expect(settings.pattern).toBe("sequential");
    expect(settings.agents.map((slot) => slot.kind)).toEqual(["planner", "critic", "solver"]);
    expect(settings.agents.every((slot) => slot.providerProfileId === "provider_dgx02_vllm")).toBe(true);
    expect(settings.budgets).toMatchObject({ maxIterations: 5, maxTotalTokens: 200_000, wallClockMinutes: 30 });
    expect(settings.agents[0]!.systemPrompt).toContain("strategic planner");
    expect(settings.judgeSlotId).toBe("slot_critic");
  });

  it("buildRunConfig converts wall-clock minutes → ms and carries judge slot", () => {
    const settings = buildDefaultSettings(providers);
    const config = buildRunConfig(settings, "  goal text  ");
    expect(config.goal).toBe("  goal text  "); // caller trims; builder is verbatim
    expect(config.budgets.wallClockMs).toBe(30 * 60_000);
    expect(config.budgets.maxIterations).toBe(5);
    expect(config.judgeSlotId).toBe("slot_critic");
  });

  it("save + load round-trips through localStorage", () => {
    const settings = buildDefaultSettings(providers);
    settings.pattern = "deliberation";
    saveRmasSettings(settings);
    const loaded = loadRmasSettings(providers);
    expect(loaded.pattern).toBe("deliberation");
    expect(loaded.agents).toHaveLength(3);
  });

  it("load falls back to defaults on empty/corrupt storage", () => {
    window.localStorage.setItem("aol.rmas.settings.v1", "{not json");
    expect(loadRmasSettings(providers).pattern).toBe("sequential");
  });
});

describe("pattern descriptions", () => {
  it("has a Korean one-liner for every pattern", () => {
    expect(PATTERN_DESCRIPTION.sequential).toContain("계획자");
    expect(Object.values(PATTERN_DESCRIPTION).every((text) => text.length > 0)).toBe(true);
  });
});
