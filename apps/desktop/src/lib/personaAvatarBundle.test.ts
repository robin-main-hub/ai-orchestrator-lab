import { describe, expect, it } from "vitest";
import { avatarMapFromGlob, resolvePersonaSprite, spriteMapFromGlob } from "./personaAvatarBundle";

describe("avatarMapFromGlob", () => {
  it("maps avatar paths to { slug -> url } across image extensions", () => {
    const map = avatarMapFromGlob({
      "agents/architect/avatar.png": "/assets/architect.123.png",
      "agents/makima/avatar.jpg": "/assets/makima.456.jpg",
      "agents/yohane/avatar.webp": "/assets/yohane.789.webp",
    });
    expect(map).toEqual({
      architect: "/assets/architect.123.png",
      makima: "/assets/makima.456.jpg",
      yohane: "/assets/yohane.789.webp",
    });
  });

  it("ignores non-avatar files and nested non-matching paths", () => {
    const map = avatarMapFromGlob({
      "agents/architect/SOUL.md": "x",
      "agents/architect/portrait.png": "y",
      "agents/SAFETY.md": "z",
    });
    expect(map).toEqual({});
  });
});

describe("spriteMapFromGlob + resolvePersonaSprite", () => {
  const sprites = spriteMapFromGlob({
    "agents/makima/expressions/neutral.png": "/n.png",
    "agents/makima/expressions/joy.png": "/j.png",
    "agents/makima/expressions/pride.webp": "/p.webp",
    "agents/makima/avatar.png": "ignored",
  });
  const avatars = { makima: "/base.png", power: "/power.png" };

  it("nests sprites by slug then expression", () => {
    expect(sprites.makima).toEqual({ neutral: "/n.png", joy: "/j.png", pride: "/p.webp" });
  });

  it("resolves the exact expression sprite", () => {
    expect(resolvePersonaSprite("makima", "pride", { sprites, avatars })).toBe("/p.webp");
  });

  it("falls back to neutral sprite, then base avatar, then undefined", () => {
    expect(resolvePersonaSprite("makima", "anger", { sprites, avatars })).toBe("/n.png"); // no anger -> neutral
    expect(resolvePersonaSprite("power", "joy", { sprites, avatars })).toBe("/power.png"); // no sprites -> avatar
    expect(resolvePersonaSprite("ghost", "joy", { sprites, avatars })).toBeUndefined();
  });
});
