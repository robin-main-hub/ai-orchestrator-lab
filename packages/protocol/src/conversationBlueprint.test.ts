import { describe, expect, it } from "vitest";
import {
  buildBlueprintInputFromConversation,
  conversationBlueprintDraftRequestSchema,
  conversationBlueprintDraftResponseSchema,
  type ConversationBlueprintSource,
} from "./conversationBlueprint.js";
import { designBlueprintInputSchema } from "./designBlueprint.js";
import { buildMissionCreateFromBlueprint } from "./designMission.js";
import { missionCreateRequestSchema } from "./productKernel.js";

const src = (over: Partial<ConversationBlueprintSource> = {}): ConversationBlueprintSource => ({
  messages: [
    { role: "user", content: "할 일 칸반 앱을 만들고 싶어" },
    { role: "assistant", content: "컬럼은 할 일/진행/완료 3개면 될까요?" },
    { role: "user", content: "응 그리고 카드 드래그" },
  ],
  ...over,
});

describe("buildBlueprintInputFromConversation — 결정적 stub", () => {
  it("returns a schema-valid DesignBlueprintInput for messages-only, draft-only, and both-empty", () => {
    expect(() => designBlueprintInputSchema.parse(buildBlueprintInputFromConversation(src()))).not.toThrow();
    expect(() =>
      designBlueprintInputSchema.parse(buildBlueprintInputFromConversation({ messages: [], draft: "포모도로 타이머" })),
    ).not.toThrow();
    const empty = buildBlueprintInputFromConversation({ messages: [] });
    expect(() => designBlueprintInputSchema.parse(empty)).not.toThrow();
    expect(empty.title).toBe("새 앱 초안"); // min-1을 빈 입력에서도 깨지 않는다
  });

  it("seeds title from draft first, else last user message", () => {
    expect(buildBlueprintInputFromConversation(src({ draft: "  급한 수정  " })).title).toBe("급한 수정");
    expect(buildBlueprintInputFromConversation(src()).title).toBe("응 그리고 카드 드래그"); // 마지막 user
  });

  it("makes exactly ONE screen, default new_app surface, neutral tokens (관측 안 한 화면 안 지어냄)", () => {
    const input = buildBlueprintInputFromConversation(src());
    expect(input.screens).toHaveLength(1);
    expect(input.targetSurface).toBe("new_app");
    expect(input.designTokens).toEqual({ density: "balanced", tone: "clean_builder", motion: "subtle" });
  });

  it("HONESTY: the draft has no truthStatus/id/createdAt/screen.id and claims no acceptance criteria", () => {
    const input = buildBlueprintInputFromConversation(src());
    expect(input).not.toHaveProperty("truthStatus");
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("createdAt");
    expect(input.screens[0]).not.toHaveProperty("id");
    expect(input.acceptanceCriteria).toEqual([]); // 근거 없는 수용 기준 주장 금지
  });

  it("is deterministic — same input yields deep-equal output", () => {
    expect(buildBlueprintInputFromConversation(src())).toEqual(buildBlueprintInputFromConversation(src()));
  });

  it("respects 200/4000 length bounds", () => {
    const long = "가".repeat(5_000);
    const input = buildBlueprintInputFromConversation({ messages: [{ role: "user", content: long }], draft: long });
    expect(input.title.length).toBeLessThanOrEqual(200);
    expect(input.userIntent.length).toBeLessThanOrEqual(4_000);
    expect(input.screens[0]!.primaryAction.length).toBeLessThanOrEqual(200);
  });

  it("promotes cleanly to a MissionCreateRequest carrying sourceSessionId provenance", () => {
    const input = buildBlueprintInputFromConversation(src());
    const request = buildMissionCreateFromBlueprint(input, { missionId: "mission_x", sourceSessionId: "session_42" });
    expect(() => missionCreateRequestSchema.parse(request)).not.toThrow();
    expect(request.sourceSessionId).toBe("session_42");
    expect(request.truthStatus).toBe("planned"); // 막 만든 미션은 observed 아님
  });
});

// The tests above pin title seeding, the single-screen honesty, length bounds
// and schema validity, but never the *content* of userIntent — yet that is the
// honesty-load-bearing part: userIntent must be an honest concatenation of the
// LAST SIX user/assistant utterances (role-prefixed, empty ones dropped), with
// system/tool turns excluded, and it must fall back to the title (never to a
// fabricated intent) when there is no utterance. The primaryAction "주요 작업"
// fallback and the explicit targetSurface override are likewise unpinned. Pin
// them, self-consistent (the expected userIntent is rebuilt from the same turns).
describe("buildBlueprintInputFromConversation — honest userIntent assembly + fallbacks", () => {
  it("joins only the last 6 non-empty user/assistant turns, role-prefixed, excluding system/tool", () => {
    const input = buildBlueprintInputFromConversation({
      messages: [
        { role: "system", content: "시스템 지시문" },
        { role: "user", content: "첫 발화" }, // 7th-from-end among u/a → dropped by slice(-6)
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
        { role: "user", content: "u3" },
        { role: "assistant", content: "a3" },
        { role: "tool", content: "툴 출력" },
        { role: "user", content: "   " }, // empty after trim → excluded
        { role: "user", content: "마지막 작업" },
      ],
    });
    // exactly the last six non-empty user/assistant turns, role-prefixed, "\n"-joined
    expect(input.userIntent).toBe(
      ["assistant: a1", "user: u2", "assistant: a2", "user: u3", "assistant: a3", "user: 마지막 작업"].join("\n"),
    );
    expect(input.userIntent).not.toContain("시스템 지시문"); // system excluded
    expect(input.userIntent).not.toContain("툴 출력"); // tool excluded
    expect(input.userIntent).not.toContain("첫 발화"); // 7th-from-end dropped by the 6-window
    expect(input.title).toBe("마지막 작업"); // last user message seeds the title
  });

  it("falls back userIntent→title and primaryAction→\"주요 작업\" when there is no utterance, honoring the targetSurface override", () => {
    const input = buildBlueprintInputFromConversation({
      messages: [
        { role: "system", content: "s" },
        { role: "tool", content: "t" },
      ],
      targetSurface: "dashboard",
    });
    expect(input.userIntent).toBe("새 앱 초안"); // no u/a turns → falls back to the title, never a fabricated intent
    expect(input.title).toBe("새 앱 초안"); // no draft, no user message
    expect(input.screens[0]!.primaryAction).toBe("주요 작업"); // draft/lastUser both empty → the constant fallback
    expect(input.targetSurface).toBe("dashboard"); // explicit override wins over the new_app default
  });
});

describe("conversationBlueprintDraftRequestSchema", () => {
  it("defaults useAi to false (stub-only unless explicitly opted in)", () => {
    const parsed = conversationBlueprintDraftRequestSchema.parse({
      messages: [{ role: "user", content: "x" }],
      sessionId: "s1",
    });
    expect(parsed.useAi).toBe(false);
  });
});

// The request schema is pinned (useAi deny-by-default), but the *response*
// schema — conversationBlueprintDraftResponseSchema — is never asserted, and it
// carries the endpoint's epistemic-honesty contract: every draft must EMBED a
// transitively-valid blueprint (a broken inner blueprint sinks the response, and
// the field is required — no empty shell), must DECLARE which path produced it
// via the closed source enum {stub,ai} (UI distinguishes "결정적 초안" vs "AI
// 초안" — provenance can't be omitted or invented), defaults `degraded` honestly
// to false (no draft silently claims it fell back unless it actually did), and
// keeps `note` an optional ≤500 reason never fabricated when absent. As a plain
// z.object it also strips smuggled keys. Pin them, self-consistent (the blueprint
// fixture is a real buildBlueprintInputFromConversation run).
describe("conversationBlueprintDraftResponseSchema — provenance honesty: transitive blueprint embed, closed source enum, honest degraded default, optional bounded note, no-smuggle", () => {
  const BLUEPRINT = buildBlueprintInputFromConversation(src());

  it("requires a transitively-valid embedded blueprint and a closed source enum, defaulting degraded→false with note absent", () => {
    const resp = conversationBlueprintDraftResponseSchema.parse({ blueprint: BLUEPRINT, source: "stub" });
    expect(resp.degraded).toBe(false); // honest default — a draft isn't "degraded" unless it says so
    expect(resp.note).toBeUndefined(); // optional reason never fabricated when absent
    expect(conversationBlueprintDraftResponseSchema.shape.source.options).toEqual(["stub", "ai"]); // closed provenance set
    expect(conversationBlueprintDraftResponseSchema.safeParse({ blueprint: BLUEPRINT, source: "llm" }).success).toBe(false); // outside the set
    expect(conversationBlueprintDraftResponseSchema.safeParse({ source: "stub" }).success).toBe(false); // blueprint required (no empty shell)
    expect(conversationBlueprintDraftResponseSchema.safeParse({ blueprint: { ...BLUEPRINT, screens: [] }, source: "stub" }).success).toBe(
      false,
    ); // transitive — a blueprint with zero screens sinks the response
  });

  it("passes degraded/note through when supplied, bounds note to ≤500, and strips smuggled keys", () => {
    const degraded = conversationBlueprintDraftResponseSchema.parse({
      blueprint: BLUEPRINT,
      source: "ai",
      degraded: true,
      note: "AI 타임아웃 → 결정적 stub으로 대체",
    });
    expect(degraded.source).toBe("ai");
    expect(degraded.degraded).toBe(true);
    expect(degraded.note).toBe("AI 타임아웃 → 결정적 stub으로 대체");
    expect(
      conversationBlueprintDraftResponseSchema.safeParse({ blueprint: BLUEPRINT, source: "ai", note: "z".repeat(501) }).success,
    ).toBe(false); // note max 500
    const stripped = conversationBlueprintDraftResponseSchema.parse({
      blueprint: BLUEPRINT,
      source: "stub",
      serverAssignedId: "x",
    } as Record<string, unknown>);
    expect("serverAssignedId" in stripped).toBe(false); // plain z.object strips
  });
});
