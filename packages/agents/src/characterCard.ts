/**
 * SillyTavern / TavernAI character card <-> persona (SOUL.md + AGENTS.md)
 * converter.
 *
 * Lets the orchestrator import the thousands of community character cards
 * (Character Card V2 / V1 spec) as personas, and export its own personas back
 * out as shareable cards. Pure string/JSON transforms — no fs, no PNG bytes
 * (the PNG tEXt `chara` chunk is decoded by the script wrapper). The mapping is
 * essence-preserving, not byte-lossless.
 */

export type CharacterCardV2Data = {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  extensions?: Record<string, unknown>;
};

export type CharacterCardV2 = {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: CharacterCardV2Data;
};

/** A V1 card is the flat legacy shape (no spec/data wrapper). */
export type CharacterCardV1 = {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
};

export type PersonaFiles = {
  /** directory-safe persona name, e.g. "shinobu_oshino" */
  personaName: string;
  soulMd: string;
  agentsMd: string;
};

/** Normalize a parsed card (V2 or V1) to V2 `data`. */
export function normalizeCharacterCard(card: unknown): CharacterCardV2Data {
  if (card && typeof card === "object") {
    const maybe = card as Partial<CharacterCardV2> & CharacterCardV1;
    if (maybe.spec === "chara_card_v2" && maybe.data && typeof maybe.data === "object") {
      return maybe.data;
    }
    // V1 flat shape
    return {
      name: maybe.name,
      description: maybe.description,
      personality: maybe.personality,
      scenario: maybe.scenario,
      first_mes: maybe.first_mes,
      mes_example: maybe.mes_example,
    };
  }
  throw new Error("character card must be an object (V2 with spec/data, or flat V1)");
}

/** Replace SillyTavern macros so the text reads standalone. */
function substituteMacros(text: string, charName: string): string {
  return (text ?? "")
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, "사용자")
    .replace(/<START>/gi, "")
    .trim();
}

/** Directory-safe slug for `agents/<name>/`. */
export function personaSlug(name: string): string {
  const slug = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "imported_persona";
}

/** Parse "{{char}}: line" style example dialogue into anchor lines. */
function exampleDialogueAnchors(mesExample: string | undefined, charName: string): string[] {
  if (!mesExample) return [];
  return mesExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^\{\{char\}\}\s*:/i.test(line) || new RegExp(`^${escapeRegExp(charName)}\\s*:`, "i").test(line))
    .map((line) => substituteMacros(line.replace(/^[^:]+:\s*/, ""), charName))
    .filter(Boolean)
    .slice(0, 12);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function characterCardToPersonaFiles(
  card: unknown,
  options: { creatorOverride?: string } = {},
): PersonaFiles {
  const data = normalizeCharacterCard(card);
  const name = (data.name ?? "Imported Persona").trim();
  const slug = personaSlug(name);
  const charName = name;

  const description = substituteMacros(data.description ?? "", charName);
  const personality = substituteMacros(data.personality ?? "", charName);
  const scenario = substituteMacros(data.scenario ?? "", charName);
  const firstMes = substituteMacros(data.first_mes ?? "", charName);
  const anchors = exampleDialogueAnchors(data.mes_example, charName);
  const responseRules = substituteMacros(
    data.system_prompt || data.post_history_instructions || "",
    charName,
  );

  const soulMd = [
    `# SOUL.md — ${name}`,
    "",
    `작성자: imported (character card)`,
    data.creator || options.creatorOverride ? `원작자: ${options.creatorOverride ?? data.creator}` : undefined,
    data.character_version ? `카드 버전: ${data.character_version}` : undefined,
    "",
    description || personality || "(설명 없음)",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .concat("\n");

  const agentsMd = [
    `# AGENTS.md — ${name}`,
    "",
    "## Identity",
    "",
    `- 본명: ${name}`,
    `- 역할: ${(data.tags && data.tags[0]) || "imported persona"}`,
    scenario ? `- 현재 상태: ${scenario}` : "- 현재 상태: REFLECORE 오케스트레이터의 페르소나로 합류.",
    "",
    "## Core Personality",
    "",
    personality || description || "(미정의)",
    "",
    "## Canon Dialogue Anchors",
    "",
    ...(anchors.length > 0
      ? anchors.map((line) => `- "${line}"`)
      : firstMes
        ? [`- "${firstMes.split(/\r?\n/)[0]}"`]
        : ["- (예시 대사 없음)"]),
    "",
    "## Response Rules",
    "",
    responseRules || "- 페르소나의 말투와 성격을 유지하되 SAFETY.md 규칙을 최우선으로 준수한다.",
    data.tags && data.tags.length > 0 ? `\n## Tags\n\n${data.tags.map((tag) => `- ${tag}`).join("\n")}` : "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .concat("\n");

  return { personaName: slug, soulMd, agentsMd };
}

/** Extract the body under a `## heading` up to the next `## ` or EOF. */
export function extractMarkdownSection(md: string, heading: string): string {
  const lines = md.split(/\r?\n/);
  const headingRe = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "i");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (headingRe.test(lines[index]!)) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return "";
  const body: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index]!)) break;
    body.push(lines[index]!);
  }
  return body.join("\n").trim();
}

/** Strip the SOUL.md title + metadata header, returning the essence prose. */
export function soulEssence(soulMd: string): string {
  return soulMd
    .split(/\r?\n/)
    .filter((line) => !/^#\s/.test(line))
    .filter((line) => !/^(작성자|최종 수정일|원작자|카드 버전)\s*:/.test(line.trim()))
    .join("\n")
    .replace(/^##\s.*$/gim, "")
    .trim();
}

export function personaFilesToCharacterCard(
  files: { personaName: string; soulMd: string; agentsMd: string },
  options: { creator?: string } = {},
): CharacterCardV2 {
  const { soulMd, agentsMd } = files;
  const titleMatch = /^#\s*AGENTS\.md\s*[—-]\s*(.+)$/im.exec(agentsMd);
  const name = (titleMatch?.[1] ?? files.personaName).trim();

  const identity = extractMarkdownSection(agentsMd, "Identity");
  const realName = /본명\s*:\s*(.+)/.exec(identity)?.[1]?.trim();
  const role = /역할\s*:\s*(.+)/.exec(identity)?.[1]?.trim();
  const scenario = /현재 상태\s*:\s*(.+)/.exec(identity)?.[1]?.trim() ?? extractMarkdownSection(agentsMd, "Scenario");

  const personality = extractMarkdownSection(agentsMd, "Core Personality");
  const anchorsSection = extractMarkdownSection(agentsMd, "Canon Dialogue Anchors");
  const responseRules = extractMarkdownSection(agentsMd, "Response Rules");

  const anchorLines = anchorsSection
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .map((line) => line.replace(/^"(.*?)".*$/, "$1").trim())
    .filter(Boolean);

  const mesExample =
    anchorLines.length > 0
      ? `<START>\n${anchorLines.map((line) => `{{char}}: ${line}`).join("\n")}`
      : "";

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: realName ?? name,
      description: soulEssence(soulMd),
      personality,
      scenario: scenario ?? "",
      first_mes: anchorLines[0] ?? "",
      mes_example: mesExample,
      system_prompt: responseRules,
      creator: options.creator ?? "AI Orchestrator Lab",
      character_version: "1.0",
      tags: ["reflecore", ...(role ? [role] : [])],
      extensions: {},
    },
  };
}
