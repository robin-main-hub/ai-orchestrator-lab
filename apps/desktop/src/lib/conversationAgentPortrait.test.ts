import { describe, expect, it } from "vitest";
import {
  expressionForActivity,
  personaSlugForAgent,
  resolveAgentExpressionPortrait,
  resolveAgentIdentityAvatar,
} from "./conversationAgentPortrait";

describe("personaSlugForAgent", () => {
  it("prefers personaName over role (R2 1:1 directory convention)", () => {
    expect(personaSlugForAgent({ personaName: "yohane", role: "skeptic" })).toBe("yohane");
  });
  it("falls back to role when personaName is absent or blank", () => {
    expect(personaSlugForAgent({ personaName: undefined, role: "executor" })).toBe("executor");
    expect(personaSlugForAgent({ personaName: "  ", role: "researcher" })).toBe("researcher");
  });
});

describe("expressionForActivity", () => {
  it("maps real activity states to emotion sprites", () => {
    expect(expressionForActivity("responding")).toBe("joy");
    expect(expressionForActivity("tooling")).toBe("curiosity");
    expect(expressionForActivity("waiting_approval")).toBe("nervousness");
    expect(expressionForActivity("error")).toBe("disappointment");
  });
  it("defaults to neutral for idle/unknown", () => {
    expect(expressionForActivity("idle")).toBe("neutral");
    expect(expressionForActivity(undefined)).toBe("neutral");
  });
});

describe("portrait resolution fallbacks", () => {
  // a persona slug with no bundled avatar/expression assets, so resolution falls
  // through to the upload / undefined branches deterministically
  const bare = { id: "a1", personaName: "zzz_no_assets", role: "architect" } as const;
  const kurumi = { id: "k1", personaName: "kurumi", role: "companion" } as const;

  it("expression portrait falls back to an uploaded avatar when no sprite is bundled", () => {
    expect(
      resolveAgentExpressionPortrait(bare, { activity: "responding", visuals: { avatarDataUrl: "data:img/up" } }),
    ).toBe("data:img/up");
  });
  it("expression portrait is undefined when neither sprite nor upload exists", () => {
    expect(resolveAgentExpressionPortrait(bare, { activity: "idle" })).toBeUndefined();
  });
  it("identity avatar prefers the uploaded avatar over the bundled sprite", () => {
    expect(resolveAgentIdentityAvatar(kurumi, { visuals: { avatarDataUrl: "data:img/up" } })).toBe("data:img/up");
  });
  it("resolves a bundled expression sprite when one exists (kurumi has 28 sprites)", () => {
    // proves the 308-sprite bundle is actually wired — kurumi/responding→joy resolves to a real URL
    expect(resolveAgentExpressionPortrait(kurumi, { activity: "responding" })).toBeTruthy();
  });
});
