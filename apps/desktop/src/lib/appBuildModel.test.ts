import { describe, expect, it } from "vitest";
import { buildBlueprintInputFromConversation, missionFromBlueprintRequestSchema } from "@ai-orchestrator/protocol";
import {
  appBuildModeCaption,
  appBuildSubmitPlan,
  buildBlueprintDraftRequest,
  buildFromBlueprintRequest,
  draftSourceBadge,
  initialAppBuildMode,
} from "./appBuildModel";

const oneScreen = buildBlueprintInputFromConversation({ messages: [{ role: "user", content: "타이머 앱" }] });
const twoScreen = { ...oneScreen, screens: [oneScreen.screens[0]!, { ...oneScreen.screens[0]!, name: "설정" }] };

describe("initialAppBuildMode / caption", () => {
  it("defaults to simple for 1 screen, debate for ≥2 (큰 변경)", () => {
    expect(initialAppBuildMode(oneScreen)).toBe("simple");
    expect(initialAppBuildMode(twoScreen)).toBe("debate");
    expect(appBuildModeCaption(oneScreen)).toMatch(/단순/);
    expect(appBuildModeCaption(twoScreen)).toMatch(/토론/);
  });
});

describe("buildBlueprintDraftRequest", () => {
  it("opts into AI only when a model is supplied (provider/model from the user's selection)", () => {
    const withAi = buildBlueprintDraftRequest({
      messages: [{ role: "user", content: "x" }],
      sessionId: "s1",
      model: { id: "m1", providerProfileId: "p1" },
    });
    expect(withAi.useAi).toBe(true);
    expect(withAi.modelId).toBe("m1");
    expect(withAi.providerProfileId).toBe("p1");

    const stubOnly = buildBlueprintDraftRequest({ messages: [{ role: "user", content: "x" }], sessionId: "s1" });
    expect(stubOnly.useAi).toBe(false);
    expect(stubOnly.providerProfileId).toBeUndefined();
  });

  it("drops empty messages", () => {
    const req = buildBlueprintDraftRequest({
      messages: [{ role: "user", content: "진짜" }, { role: "assistant", content: "   " }],
      sessionId: "s1",
    });
    expect(req.messages).toHaveLength(1);
  });
});

describe("buildFromBlueprintRequest", () => {
  it("carries sourceSessionId provenance and is schema-valid", () => {
    const req = buildFromBlueprintRequest({ blueprint: oneScreen, sourceSessionId: "session_9" });
    expect(() => missionFromBlueprintRequestSchema.parse(req)).not.toThrow();
    expect(req.sourceSessionId).toBe("session_9");
    expect(req.createdBy).toBe("appbuild");
  });
});

describe("appBuildSubmitPlan — 단순↔토론 라우팅", () => {
  it("simple → from-blueprint 요청(provenance 포함), debate → blueprint 안 싣는 토론 핸드오프", () => {
    const simple = appBuildSubmitPlan({ mode: "simple", blueprint: oneScreen, sourceSessionId: "session_3" });
    expect(simple.kind).toBe("mission");
    if (simple.kind === "mission") {
      expect(simple.request.sourceSessionId).toBe("session_3"); // 단순 경로는 provenance 유지
      expect(simple.request.blueprint).toEqual(oneScreen);
    }

    const debate = appBuildSubmitPlan({ mode: "debate", blueprint: oneScreen, sourceSessionId: "session_3" });
    expect(debate.kind).toBe("debate"); // 토론은 blueprint를 싣지 않는다(정직 — 토론 엔진이 대화에서 재도출)
    expect(debate).not.toHaveProperty("request");
  });
});

describe("draftSourceBadge — 정직성", () => {
  it("labels stub, ai, and degraded distinctly; never claims observed", () => {
    expect(draftSourceBadge({ source: "stub", degraded: false }).label).toMatch(/결정적/);
    expect(draftSourceBadge({ source: "ai", degraded: false }).label).toMatch(/planned/);
    const degraded = draftSourceBadge({ source: "stub", degraded: true, note: "provider down" });
    expect(degraded.tone).toBe("warning");
    expect(degraded.detail).toBe("provider down");
    // 어떤 경우에도 "observed"를 라벨에 쓰지 않는다
    for (const s of [
      draftSourceBadge({ source: "stub", degraded: false }),
      draftSourceBadge({ source: "ai", degraded: false }),
      draftSourceBadge({ source: "stub", degraded: true }),
    ]) {
      expect(s.label).not.toMatch(/observed/i);
    }
  });
});
