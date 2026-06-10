import { describe, expect, it } from "vitest";
import {
  characterCardToPersonaFiles,
  extractMarkdownSection,
  normalizeCharacterCard,
  personaFilesToCharacterCard,
  personaSlug,
  soulEssence,
  type CharacterCardV2,
} from "./characterCard.js";

const v2Card: CharacterCardV2 = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Shinobu Oshino",
    description: "A 500-year-old vampire who loves donuts. {{char}} watches {{user}} with cynical amusement.",
    personality: "Aloof, cynical, ancient, secretly lonely.",
    scenario: "Designing the long-term architecture of REFLECORE.",
    first_mes: "흥, 시시하군. 무슨 용건이냐, 인간.",
    mes_example: "<START>\n{{user}}: 도넛 줄까?\n{{char}}: 도넛은 정의다.\n{{char}}: 빠나이노!",
    system_prompt: "Always answer from an architectural, long-term perspective.",
    tags: ["architect", "vampire"],
    creator: "niMung",
    character_version: "2.1",
  },
};

describe("normalizeCharacterCard", () => {
  it("unwraps a V2 card to its data", () => {
    expect(normalizeCharacterCard(v2Card).name).toBe("Shinobu Oshino");
  });

  it("accepts a flat V1 card", () => {
    expect(normalizeCharacterCard({ name: "Foo", description: "bar" })).toEqual({
      name: "Foo",
      description: "bar",
      personality: undefined,
      scenario: undefined,
      first_mes: undefined,
      mes_example: undefined,
    });
  });

  it("throws on a non-object", () => {
    expect(() => normalizeCharacterCard("nope")).toThrow();
  });
});

describe("personaSlug", () => {
  it("makes a directory-safe slug, keeping hangul", () => {
    expect(personaSlug("Shinobu Oshino")).toBe("shinobu_oshino");
    expect(personaSlug("오시노 시노부")).toBe("오시노_시노부");
    expect(personaSlug("  !!  ")).toBe("imported_persona");
  });
});

describe("characterCardToPersonaFiles", () => {
  it("maps a card into SOUL.md + AGENTS.md with macros substituted", () => {
    const files = characterCardToPersonaFiles(v2Card);
    expect(files.personaName).toBe("shinobu_oshino");
    expect(files.soulMd).toContain("# SOUL.md — Shinobu Oshino");
    expect(files.soulMd).toContain("Shinobu Oshino watches 사용자"); // {{char}}/{{user}} replaced
    expect(files.soulMd).not.toContain("{{char}}");
    expect(files.agentsMd).toContain("## Core Personality");
    expect(files.agentsMd).toContain("Aloof, cynical");
    expect(files.agentsMd).toContain("## Canon Dialogue Anchors");
    expect(files.agentsMd).toContain('"도넛은 정의다."'); // from mes_example {{char}}: lines
    expect(files.agentsMd).toContain('"빠나이노!"');
    expect(files.agentsMd).toContain("architectural, long-term"); // system_prompt -> Response Rules
  });

  it("falls back gracefully when fields are missing", () => {
    const files = characterCardToPersonaFiles({ name: "Bare" });
    expect(files.soulMd).toContain("Bare");
    expect(files.agentsMd).toContain("(예시 대사 없음)");
    expect(files.agentsMd).toContain("SAFETY.md");
  });
});

describe("extractMarkdownSection + soulEssence", () => {
  it("extracts a section body up to the next heading", () => {
    const md = "# T\n\n## A\n\nalpha\n\n## B\n\nbeta";
    expect(extractMarkdownSection(md, "A")).toBe("alpha");
    expect(extractMarkdownSection(md, "B")).toBe("beta");
    expect(extractMarkdownSection(md, "C")).toBe("");
  });

  it("soulEssence drops title/metadata/headings", () => {
    const soul = "# SOUL.md — X\n\n작성자: y\n카드 버전: 2.1\n\nthe real essence.\n\n## 비밀\nhidden";
    const essence = soulEssence(soul);
    expect(essence).toContain("the real essence.");
    expect(essence).not.toContain("작성자");
    expect(essence).not.toContain("SOUL.md");
  });
});

describe("personaFilesToCharacterCard (round-trip)", () => {
  it("exports persona files back into a V2 card", () => {
    const files = characterCardToPersonaFiles(v2Card);
    const card = personaFilesToCharacterCard({
      personaName: files.personaName,
      soulMd: files.soulMd,
      agentsMd: files.agentsMd,
    });
    expect(card.spec).toBe("chara_card_v2");
    expect(card.data.name).toBe("Shinobu Oshino");
    expect(card.data.personality).toContain("Aloof, cynical");
    expect(card.data.description).toContain("vampire who loves donuts");
    expect(card.data.mes_example).toContain("{{char}}: 도넛은 정의다.");
    expect(card.data.first_mes).toBe("도넛은 정의다.");
    expect(card.data.tags).toContain("reflecore");
  });
});
