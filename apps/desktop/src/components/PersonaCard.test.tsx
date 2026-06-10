import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPersonaCard } from "../lib/personaCard";
import { PersonaCard } from "./PersonaCard";

describe("PersonaCard", () => {
  it("renders name, emblem, rarity, and HP/MP stats with the rarity class", () => {
    const card = buildPersonaCard({ personaName: "kurumi", displayName: "쿠루미", role: "companion" });
    const html = renderToStaticMarkup(<PersonaCard card={card} />);
    expect(html).toContain("쿠루미");
    expect(html).toContain("본체"); // emblem
    expect(html).toContain("SSR");
    expect(html).toContain("persona-card-rarity-ssr");
    expect(html).toContain("기억");
    expect(html).toContain("신뢰");
    expect(html).toContain("width:90%"); // hp bar
  });

  it("shows a portrait image when an avatar url is present, else the bot placeholder", () => {
    const withAvatar = buildPersonaCard({ personaName: "k", role: "qa" as never, avatarUrl: "/a.png" });
    expect(renderToStaticMarkup(<PersonaCard card={withAvatar} />)).toContain("/a.png");
    const withoutAvatar = buildPersonaCard({ personaName: "k", role: "skeptic" });
    expect(renderToStaticMarkup(<PersonaCard card={withoutAvatar} />)).toContain("placeholder");
  });
});
