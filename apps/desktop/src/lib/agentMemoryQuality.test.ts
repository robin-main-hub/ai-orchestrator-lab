import { describe, expect, it } from "vitest";
import { createAgentMemoryQuality } from "./agentMemoryQuality";

// Characterization tests for the agent long-term-memory quality decision tree (no
// behavior change). createAgentMemoryQuality is a pure projection from adapter
// status + record/message counts to a label/state/tone. These pin the branch
// precedence (adapter error/loading short-circuit before any count check), the
// `>= 3 records AND >= 2 messages` healthy threshold (strict on BOTH), the
// building fallback whenever either count is positive, the empty zero-state, and
// the exact Korean labels/short-labels/tones each branch emits. All pure.
describe("createAgentMemoryQuality", () => {
  it("short-circuits to an attention error state regardless of counts", () => {
    expect(createAgentMemoryQuality({ adapterStatus: "error", memoryRecordCount: 99, messageCount: 99 })).toEqual({
      label: "장기 기억 점검 필요",
      shortLabel: "장기 기억 점검 필요",
      state: "error",
      tone: "attention",
    });
  });

  it("short-circuits to a warming loading state regardless of counts", () => {
    expect(createAgentMemoryQuality({ adapterStatus: "loading", memoryRecordCount: 99, messageCount: 99 })).toEqual({
      label: "장기 기억 불러오는 중",
      shortLabel: "장기 기억 로딩",
      state: "loading",
      tone: "warming",
    });
  });

  it("reports healthy only when both records >= 3 and messages >= 2 (ready adapter)", () => {
    expect(createAgentMemoryQuality({ adapterStatus: "ready", memoryRecordCount: 3, messageCount: 2 })).toEqual({
      label: "장기 기억 품질 양호",
      shortLabel: "장기 기억 품질 양호",
      state: "healthy",
      tone: "ready",
    });
  });

  it("falls back to building when records meet the bar but messages fall short", () => {
    const quality = createAgentMemoryQuality({ adapterStatus: "ready", memoryRecordCount: 5, messageCount: 1 });
    expect(quality.state).toBe("building");
    expect(quality.tone).toBe("warming");
    expect(quality.label).toBe("장기 기억 축적 중");
    expect(quality.shortLabel).toBe("장기 기억 축적 중");
  });

  it("falls back to building when messages meet the bar but records fall short", () => {
    expect(createAgentMemoryQuality({ adapterStatus: "ready", memoryRecordCount: 2, messageCount: 5 }).state).toBe(
      "building",
    );
  });

  it("treats a single positive count as building (either record or message)", () => {
    expect(createAgentMemoryQuality({ adapterStatus: "ready", memoryRecordCount: 1, messageCount: 0 }).state).toBe(
      "building",
    );
    expect(createAgentMemoryQuality({ adapterStatus: "ready", memoryRecordCount: 0, messageCount: 1 }).state).toBe(
      "building",
    );
  });

  it("reports the empty zero-state when ready with no records and no messages", () => {
    expect(createAgentMemoryQuality({ adapterStatus: "ready", memoryRecordCount: 0, messageCount: 0 })).toEqual({
      label: "장기 기억 새로 시작",
      shortLabel: "장기 기억 시작 전",
      state: "empty",
      tone: "warming",
    });
  });
});
