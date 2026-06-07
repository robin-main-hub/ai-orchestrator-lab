import type { CenterMode, AgentConfigTab } from "../types";
import type { WorkTraceSearchItem } from "./workTraceSearch";

export type WorkTraceNavigationTarget = {
  agentConfigTab?: AgentConfigTab;
  approvalDrawerOpen: boolean;
  mode: CenterMode;
  returnModeAfterConfigClose?: CenterMode;
};

export function resolveWorkTraceNavigationTarget(item: WorkTraceSearchItem): WorkTraceNavigationTarget {
  if (item.kind === "approval") {
    return {
      approvalDrawerOpen: true,
      mode: "cockpit",
    };
  }
  if (item.kind === "memory") {
    return {
      agentConfigTab: "injection",
      approvalDrawerOpen: false,
      mode: "conversation",
      returnModeAfterConfigClose: "cockpit",
    };
  }
  return {
    approvalDrawerOpen: false,
    mode: item.kind,
  };
}
