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

// The round-trip above keeps title == 본명 == personaName, so several divergent
// conversion branches never fire. Pin them here, self-consistent (hand-built
// persona files / cards so each fallback is forced): export-side 본명-overrides-
// title, role→tag, scenario extraction, and the title-missing→personaName
// fallback (with empty anchors → ""); import-side creatorOverride precedence,
// the no-creator 원작자-line omission, and the first_mes→single-anchor fallback.
describe("characterCard — conversion fallback branches", () => {
  it("export: 본명 overrides the title name, role becomes a tag, scenario + explicit creator flow through", () => {
    const soulMd = "# SOUL.md — Title Name\n\n작성자: imported\n\nthe essence prose.";
    const agentsMd = [
      "# AGENTS.md — Title Name",
      "",
      "## Identity",
      "",
      "- 본명: Real Name",
      "- 역할: guardian",
      "- 현재 상태: standing watch",
      "",
      "## Core Personality",
      "",
      "calm",
      "",
      "## Canon Dialogue Anchors",
      "",
      '- "hello there"',
      "",
      "## Response Rules",
      "",
      "be calm",
    ].join("\n");
    const card = personaFilesToCharacterCard({ personaName: "slug", soulMd, agentsMd }, { creator: "Me" });
    expect(card.data.name).toBe("Real Name"); // 본명 wins over the AGENTS.md title
    expect(card.data.scenario).toBe("standing watch");
    expect(card.data.tags).toEqual(["reflecore", "guardian"]); // role appended after the constant tag
    expect(card.data.creator).toBe("Me"); // option overrides the default attribution
    expect(card.data.first_mes).toBe("hello there"); // anchor unquoted
    expect(card.data.mes_example).toContain("{{char}}: hello there");
  });

  it("export: no title / no 본명 / no scenario / no anchors → name=personaName, empty scenario+greeting, tags=[reflecore], default creator", () => {
    const card = personaFilesToCharacterCard({
      personaName: "fallback_name",
      soulMd: "plain soul",
      agentsMd: "## Core Personality\n\nplain",
    });
    expect(card.data.name).toBe("fallback_name"); // title regex misses → personaName
    expect(card.data.scenario).toBe(""); // no Identity 현재상태 and no Scenario section
    expect(card.data.first_mes).toBe("");
    expect(card.data.mes_example).toBe("");
    expect(card.data.tags).toEqual(["reflecore"]); // no role → constant tag only
    expect(card.data.creator).toBe("AI Orchestrator Lab"); // default attribution
  });

  it("import: creatorOverride wins over the card's own creator; a creatorless card omits the 원작자 line", () => {
    const over = characterCardToPersonaFiles(v2Card, { creatorOverride: "OverrideAuthor" });
    expect(over.soulMd).toContain("원작자: OverrideAuthor");
    expect(over.soulMd).not.toContain("niMung"); // the card's own creator is replaced

    const noCreator = characterCardToPersonaFiles({ name: "NoCreator", description: "d" });
    expect(noCreator.soulMd).not.toContain("원작자"); // neither creator nor override → line dropped
  });

  it("import: with no {{char}}: example lines but a first_mes present, the first greeting line becomes the sole anchor", () => {
    const files = characterCardToPersonaFiles({ name: "Greeter", first_mes: "안녕!\n둘째 줄", mes_example: "" });
    expect(files.agentsMd).toContain('- "안녕!"'); // firstMes split[0], not the second line
    expect(files.agentsMd).not.toContain("둘째 줄");
    expect(files.agentsMd).not.toContain("(예시 대사 없음)"); // the empty-anchor branch is NOT taken
  });
});

// Every example-dialogue test above quotes lines with the {{char}}: macro and
// stays well under a dozen anchors, so three exampleDialogueAnchors branches
// never fire: the SECOND filter arm that matches a line prefixed with the card's
// LITERAL name (the common SillyTavern "Name: …" export, not the macro), the
// slice(0,12) anchor cap, and the escapeRegExp guard that lets a regex-special
// character name be matched LITERALLY instead of crashing the importer. Pin
// them, self-consistent (anchors derived from the lines we feed in).
describe("characterCard — exampleDialogueAnchors literal-name match, 12-cap, regex-special name", () => {
  it("captures example lines prefixed with the card's literal name (not just the {{char}} macro), tolerating spaces before the colon", () => {
    const files = characterCardToPersonaFiles({
      name: "Rin",
      mes_example: "Rin: 첫 대사\nRin : 띄어쓴 대사\n사용자: 무시됨",
    });
    expect(files.agentsMd).toContain('- "첫 대사"'); // literal-name arm, exact prefix
    expect(files.agentsMd).toContain('- "띄어쓴 대사"'); // `\s*:` tolerates the space before the colon
    expect(files.agentsMd).not.toContain("무시됨"); // a non-char/non-name speaker line is dropped
  });

  it("caps the anchor list at 12 via slice(0,12), dropping the overflow lines", () => {
    const many = Array.from({ length: 15 }, (_, i) => `Cap: 대사${i}`).join("\n");
    const files = characterCardToPersonaFiles({ name: "Cap", mes_example: many });
    expect(files.agentsMd).toContain('- "대사11"'); // the 12th anchor (index 11) is kept
    expect(files.agentsMd).not.toContain('- "대사12"'); // the 13th is sliced off
    expect(files.agentsMd).not.toContain('- "대사14"');
  });

  it("matches a regex-special character name LITERALLY (escapeRegExp), capturing the anchor without throwing", () => {
    const card = { name: "C++ {Bot}", mes_example: "C++ {Bot}: 위험한 이름" };
    expect(() => characterCardToPersonaFiles(card)).not.toThrow(); // an unescaped name would be an invalid regex
    const files = characterCardToPersonaFiles(card);
    expect(files.agentsMd).toContain('- "위험한 이름"'); // the literal-name arm still fires after escaping
  });
});
