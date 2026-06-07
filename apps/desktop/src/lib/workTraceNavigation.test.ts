import { describe, expect, it } from "vitest";
import type { WorkTraceSearchItem } from "./workTraceSearch";
import { resolveWorkTraceNavigationTarget } from "./workTraceNavigation";

function createTrace(kind: WorkTraceSearchItem["kind"]): WorkTraceSearchItem {
  return {
    id: `trace_${kind}`,
    kind,
    receiptStatus: "checkpointed",
    safetyLabel: "검색 가능",
    searchable: true,
    searchText: kind,
    title: `${kind} 영수증`,
    trace: { groups: [] },
  };
}

describe("resolveWorkTraceNavigationTarget", () => {
  it("대화, 토론, 터미널 영수증을 해당 작업 화면으로 보낸다", () => {
    expect(resolveWorkTraceNavigationTarget(createTrace("conversation"))).toEqual({
      approvalDrawerOpen: false,
      mode: "conversation",
    });
    expect(resolveWorkTraceNavigationTarget(createTrace("debate"))).toEqual({
      approvalDrawerOpen: false,
      mode: "debate",
    });
    expect(resolveWorkTraceNavigationTarget(createTrace("tmux"))).toEqual({
      approvalDrawerOpen: false,
      mode: "tmux",
    });
  });

  it("승인 영수증은 Cockpit에 머물며 Control Queue를 열고, 기억 영수증은 기억 주입 패널로 보낸다", () => {
    expect(resolveWorkTraceNavigationTarget(createTrace("approval"))).toEqual({
      approvalDrawerOpen: true,
      mode: "cockpit",
    });
    expect(resolveWorkTraceNavigationTarget(createTrace("memory"))).toEqual({
      agentConfigTab: "injection",
      approvalDrawerOpen: false,
      mode: "conversation",
      returnModeAfterConfigClose: "cockpit",
    });
  });
});
