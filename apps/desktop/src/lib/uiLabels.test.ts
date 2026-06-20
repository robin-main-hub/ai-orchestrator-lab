import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import {
  agentConfigSourceSchema,
  branchExperimentStatusSchema,
  runtimeStatusSchema,
} from "@ai-orchestrator/protocol";
import type { AgentConfigTab, AgentCreativityLevel, AgentVoicePreset, WorkbenchAgent } from "../types";
import {
  agentConfigPanelTitle,
  branchStatusLabel,
  configSourceLabel,
  contextPackTierLabel,
  branchAgentNameLabel,
  creativityLevelLabel,
  creativityTemperature,
  guardStepLabel,
  insightCategoryLabel,
  messageLabel,
  reviewModeLabel,
  soulModeLabel,
  statusTone,
  voicePresetLabel,
} from "./uiLabels";

const orchestrator = {
  id: "agent_orchestrator",
  name: "Orchestrator",
  kind: "virtual",
  role: "orchestrator",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
  permissionLevel: "read_only",
} as WorkbenchAgent;

function assistantMessage(metadata?: ConversationMessage["metadata"]): ConversationMessage {
  return {
    id: "message_assistant",
    role: "assistant",
    content: "응답",
    createdAt: "2026-06-06T00:00:00.000Z",
    sessionId: "session_test",
    metadata,
  };
}

describe("messageLabel", () => {
  it("uses selected agent Korean character name instead of raw role name", () => {
    expect(messageLabel(assistantMessage(), orchestrator)).toBe("마키마");
  });

  it("resolves metadata agent ids to Korean character names", () => {
    expect(
      messageLabel(
        assistantMessage({ agentId: "agent_orchestrator", agentName: "Orchestrator" }),
        undefined,
        [orchestrator],
      ),
    ).toBe("마키마");
  });

  it("maps raw metadata role names to Korean character names when the agent list is absent", () => {
    expect(messageLabel(assistantMessage({ agentName: "orchestrator" }))).toBe("마키마");
  });
});

describe("Korean UI labels", () => {
  it("localizes review and insight labels that appear in review controls", () => {
    expect(reviewModeLabel("deep")).toBe("정밀");
    expect(reviewModeLabel("quick")).toBe("빠른 검토");
    expect(insightCategoryLabel("architecture")).toBe("아키텍처");
    expect(insightCategoryLabel("tech_debt")).toBe("기술 부채");
  });

  it("localizes guard, soul, and context pack labels", () => {
    expect(guardStepLabel("self_response_prevention")).toBe("자기 응답 차단");
    expect(guardStepLabel("pii_secret_block")).toBe("개인정보/비밀");
    expect(soulModeLabel("retrieved")).toBe("검색된 기억");
    expect(contextPackTierLabel("standard")).toBe("표준");
  });

  it("maps branch experiment agent labels to character names", () => {
    expect(branchAgentNameLabel("Architect")).toBe("오시노 시노부");
    expect(branchAgentNameLabel("Reviewer")).toBe("시노미야 카구야");
    expect(branchAgentNameLabel("Orchestrator")).toBe("마키마");
  });
});

// Characterization tests (no behavior change) for the seven previously-unasserted
// exports of uiLabels.ts: statusTone, creativityTemperature, branchStatusLabel,
// configSourceLabel, voicePresetLabel, creativityLevelLabel, agentConfigPanelTitle.
// The describe blocks above exercise the module's other label helpers but never
// these. They split into three shapes:
//   1. statusTone — the ONLY function here with real branching (not a Record
//      lookup): online -> "ok", offline -> "danger", everything else (degraded,
//      syncing) -> "warn". The load-bearing contract is that the catch-all maps
//      the remaining runtime statuses to the cautionary tone, so a newly added
//      status degrades safely to "warn" rather than falsely reading "ok".
//   2. creativityTemperature — the sampling temperature behind each creativity
//      level. Its load-bearing invariant is ORDER: temperature must rise
//      monotonically with creativity (strict < focused < balanced < creative <
//      experimental) and stay in a sane (0, 2] sampling range. A non-monotonic
//      table would make "more creative" silently sample colder.
//   3. branchStatusLabel / configSourceLabel / voicePresetLabel /
//      creativityLevelLabel / agentConfigPanelTitle — exhaustive Record lookups
//      over their unions. We pin that every union member resolves to a non-empty
//      label and that no two members collide on the same label (a collision would
//      render two distinct states indistinguishably).

// Drive exhaustiveness from the same protocol schemas the source types infer from,
// so these lists can't silently drift out of sync with the union under test.
const BRANCH_STATUSES = branchExperimentStatusSchema.options;
const RUNTIME_STATUSES = runtimeStatusSchema.options;
const CONFIG_SOURCES = agentConfigSourceSchema.options;

// type-only unions (no runtime schema) — mirrored from ../types.ts.
const VOICE_PRESETS: AgentVoicePreset[] = ["direct", "calm", "architect", "reviewer", "executor"];
const CREATIVITY_LEVELS: AgentCreativityLevel[] = ["strict", "focused", "balanced", "creative", "experimental"];
const CONFIG_TABS: AgentConfigTab[] = ["profile", "soul", "agents_md", "creativity", "injection", "preview", "edit"];

function expectExhaustiveDistinctLabels<T>(members: readonly T[], label: (member: T) => string): void {
  const labels = members.map(label);
  for (const value of labels) {
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
  }
  // distinct: every member renders to its own label (no two states look the same)
  expect(new Set(labels).size).toBe(members.length);
}

describe("statusTone", () => {
  it("maps online -> ok, offline -> danger, and every other status -> warn", () => {
    expect(statusTone("online")).toBe("ok");
    expect(statusTone("offline")).toBe("danger");
    expect(statusTone("degraded")).toBe("warn");
    expect(statusTone("syncing")).toBe("warn");
  });

  it("covers the whole runtime-status union (the catch-all degrades safely to warn)", () => {
    for (const status of RUNTIME_STATUSES) {
      const tone = statusTone(status);
      expect(["ok", "danger", "warn"]).toContain(tone);
      if (status !== "online" && status !== "offline") {
        expect(tone).toBe("warn");
      }
    }
  });
});

describe("creativityTemperature", () => {
  it("pins the temperature for each creativity level", () => {
    expect(creativityTemperature("strict")).toBe(0.2);
    expect(creativityTemperature("focused")).toBe(0.4);
    expect(creativityTemperature("balanced")).toBe(0.7);
    expect(creativityTemperature("creative")).toBe(1);
    expect(creativityTemperature("experimental")).toBe(1.2);
  });

  it("rises strictly monotonically with creativity and stays in a sane (0, 2] range", () => {
    const temps = CREATIVITY_LEVELS.map(creativityTemperature);
    for (const t of temps) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThanOrEqual(2);
    }
    for (let i = 1; i < temps.length; i += 1) {
      expect(temps[i]!).toBeGreaterThan(temps[i - 1]!);
    }
  });
});

describe("exhaustive label lookups", () => {
  it("branchStatusLabel resolves every branch status to a distinct non-empty label", () => {
    expectExhaustiveDistinctLabels(BRANCH_STATUSES, branchStatusLabel);
    expect(branchStatusLabel("adopted")).toBe("채택됨");
  });

  it("configSourceLabel resolves every config source to a distinct non-empty label", () => {
    expectExhaustiveDistinctLabels(CONFIG_SOURCES, configSourceLabel);
    expect(configSourceLabel("off")).toBe("주입 안 함");
  });

  it("voicePresetLabel resolves every voice preset to a distinct non-empty label", () => {
    expectExhaustiveDistinctLabels(VOICE_PRESETS, voicePresetLabel);
  });

  it("creativityLevelLabel resolves every creativity level to a distinct non-empty label", () => {
    expectExhaustiveDistinctLabels(CREATIVITY_LEVELS, creativityLevelLabel);
  });

  it("agentConfigPanelTitle resolves every config tab to a distinct non-empty title", () => {
    expectExhaustiveDistinctLabels(CONFIG_TABS, agentConfigPanelTitle);
  });
});
