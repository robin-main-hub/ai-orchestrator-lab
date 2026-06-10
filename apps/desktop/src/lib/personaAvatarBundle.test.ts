import { describe, expect, it } from "vitest";
import { avatarMapFromGlob } from "./personaAvatarBundle";

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
