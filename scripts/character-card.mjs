#!/usr/bin/env node
/**
 * SillyTavern / TavernAI character card <-> persona CLI.
 *
 *   import a community card into a persona:
 *     node scripts/character-card.mjs import path/to/card.png   [--name slug] [--force]
 *     node scripts/character-card.mjs import path/to/card.json  [--name slug] [--force]
 *
 *   export a persona back into a shareable card (JSON):
 *     node scripts/character-card.mjs export architect          [--out card.json]
 *
 * Reads the Character Card V2/V1 JSON — from a .json file directly, or from the
 * `chara` (base64 JSON) tEXt chunk embedded in a SillyTavern .png card. The
 * essence-preserving mapping lives in @ai-orchestrator/agents (unit-tested);
 * this script only does fs + PNG-chunk parsing. Build the package first:
 *   corepack pnpm --filter @ai-orchestrator/agents build
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
const agentsModuleUrl = new URL("../packages/agents/dist/index.js", import.meta.url);
const { characterCardToPersonaFiles, personaFilesToCharacterCard } = await import(agentsModuleUrl.href).catch(() => {
  console.error("[character-card] build the agents package first: corepack pnpm --filter @ai-orchestrator/agents build");
  process.exit(1);
});

const [, , command, target, ...rest] = process.argv;
const flag = (name) => rest.includes(name);
const flagValue = (name, fallback) => {
  const index = rest.indexOf(name);
  return index !== -1 && rest[index + 1] ? rest[index + 1] : fallback;
};

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const agentsDir = join(repoRoot, "agents");

const fail = (message) => {
  console.error(`[character-card] ${message}`);
  process.exitCode = 1;
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Extract the base64-JSON character payload from a PNG's tEXt chunks. */
function extractCardFromPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("not a PNG file");
  }
  const texts = {};
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "tEXt") {
      const nul = data.indexOf(0);
      if (nul !== -1) {
        texts[data.toString("latin1", 0, nul)] = data.toString("latin1", nul + 1);
      }
    }
    offset += 8 + length + 4;
    if (type === "IEND") break;
  }
  const raw = texts.ccv3 ?? texts.chara;
  if (!raw) {
    throw new Error("no 'chara' or 'ccv3' tEXt chunk found in PNG (not a SillyTavern card?)");
  }
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

async function loadCard(path) {
  const buffer = await readFile(path);
  if (path.toLowerCase().endsWith(".png")) {
    return extractCardFromPng(buffer);
  }
  return JSON.parse(buffer.toString("utf8"));
}

async function runImport() {
  if (!target) return fail("usage: import <card.png|card.json> [--name slug] [--force]");
  const card = await loadCard(resolve(target));
  const files = characterCardToPersonaFiles(card);
  const slug = flagValue("--name", files.personaName);
  const dir = join(agentsDir, slug);
  const soulPath = join(dir, "SOUL.md");
  const agentsPath = join(dir, "AGENTS.md");

  if (!flag("--force") && ((await exists(soulPath)) || (await exists(agentsPath)))) {
    return fail(`persona "${slug}" already exists at agents/${slug}/. Pass --force to overwrite.`);
  }

  await mkdir(dir, { recursive: true });
  await writeFile(soulPath, files.soulMd, "utf8");
  await writeFile(agentsPath, files.agentsMd, "utf8");
  let avatarNote = "";
  if (resolve(target).toLowerCase().endsWith(".png")) {
    // The SillyTavern card PNG is itself the portrait — keep it as the avatar.
    await writeFile(join(dir, "avatar.png"), await readFile(resolve(target)));
    avatarNote = " + avatar.png";
  }
  console.log(`[character-card] imported -> agents/${slug}/SOUL.md + AGENTS.md${avatarNote}`);
  console.log(`  소환: 자율실행 패널에서 페르소나 이름 "${slug}" 로 summon 가능`);
}

async function runExport() {
  if (!target) return fail("usage: export <persona-name> [--out card.json]");
  const dir = join(agentsDir, target);
  const soulPath = join(dir, "SOUL.md");
  const agentsPath = join(dir, "AGENTS.md");
  if (!(await exists(soulPath)) || !(await exists(agentsPath))) {
    return fail(`persona "${target}" not found (need agents/${target}/SOUL.md and AGENTS.md)`);
  }
  const card = personaFilesToCharacterCard({
    personaName: target,
    soulMd: await readFile(soulPath, "utf8"),
    agentsMd: await readFile(agentsPath, "utf8"),
  });
  const out = resolve(flagValue("--out", `${target}.card.json`));
  await writeFile(out, `${JSON.stringify(card, null, 2)}\n`, "utf8");
  console.log(`[character-card] exported persona "${target}" -> ${out}`);
}

if (command === "import") {
  await runImport().catch((error) => fail(error instanceof Error ? error.message : String(error)));
} else if (command === "export") {
  await runExport().catch((error) => fail(error instanceof Error ? error.message : String(error)));
} else {
  fail("usage: character-card.mjs <import|export> ...");
}
