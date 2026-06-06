import { describe, expect, it } from "vitest";
import {
  type AgentActivityState,
  agentActivityAvatarStatus,
  agentActivityLabel,
  coerceAgentActivityStatus,
  tmuxPaneStateToAgentActivity,
} from "./agentActivity";

describe("AgentActivity primitive presentation", () => {
  it("keeps the 8-state v0 activity vocabulary stable", () => {
    const states: AgentActivityState[] = [
      "idle",
      "thinking",
      "responding",
      "working",
      "waiting_approval",
      "blocked",
      "error",
      "success",
    ];

    expect(states.map(agentActivityLabel)).toEqual([
      "idle",
      "thinking",
      "responding",
      "working",
      "waiting approval",
      "blocked",
      "error",
      "success",
    ]);
  });

  it("coerces legacy app statuses into the v0 vocabulary", () => {
    expect(coerceAgentActivityStatus("preparing")).toBe("thinking");
    expect(coerceAgentActivityStatus("responding")).toBe("responding");
    expect(coerceAgentActivityStatus(undefined)).toBe("idle");
  });

  it("maps tmux pane states to activity states", () => {
    expect(tmuxPaneStateToAgentActivity("dispatch gated")).toBe("waiting_approval");
    expect(tmuxPaneStateToAgentActivity("guarding")).toBe("blocked");
    expect(tmuxPaneStateToAgentActivity("ready")).toBe("success");
    expect(tmuxPaneStateToAgentActivity("chat active")).toBe("responding");
    expect(tmuxPaneStateToAgentActivity("active")).toBe("working");
  });

  it("maps activity states to avatar dot semantics", () => {
    expect(agentActivityAvatarStatus("responding")).toBe("active");
    expect(agentActivityAvatarStatus("working")).toBe("active");
    expect(agentActivityAvatarStatus("waiting_approval")).toBe("pending");
    expect(agentActivityAvatarStatus("blocked")).toBe("offline");
    expect(agentActivityAvatarStatus("success")).toBe("online");
  });
});
