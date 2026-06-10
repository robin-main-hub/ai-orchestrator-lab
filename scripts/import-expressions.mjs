#!/usr/bin/env node
/**
 * 표정 세트 임포터 — 외부 에이전트(Manus 등)가 만든 <캐릭터>_mapped/ 폴더를
 * agents/<슬러그>/expressions/ 로 배치한다.
 *
 *   node scripts/import-expressions.mjs [소스 디렉터리...]
 *
 * 소스 미지정 시 ~/Downloads 를 스캔한다. 각 소스에서 재귀적으로
 * "*_mapped" 폴더(또는 그 zip을 풀어둔 트리)를 찾아 캐릭터명을 도감
 * 슬러그로 매핑하고, png/jpg/webp 표정 파일을 복사한다. 파일명은
 * 표정명(go_emotions 28종: neutral.png, joy.png, … remorse.png)이어야
 * 데스크톱의 expressions 글롭이 그대로 인식한다.
 *
 * 멱등: 같은 파일은 덮어쓴다. dry-run: --dry
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const agentsDir = join(repoRoot, "agents");

/** 외부 산출물 폴더명 → agents/<슬러그> */
const SLUG_ALIASES = {
  kurumi: "kurumi",
  yuno: "yuno",
  rem: "executor",
  yoshiko: "yohane",
  yohane: "yohane",
  herta: "domain_expert",
  sparkle: "negotiator",
  makima: "orchestrator",
  shinobu: "architect",
  kurisu: "verifier",
  makise: "verifier",
  kaguya: "reviewer",
  asuka: "skeptic",
  rei: "memory_curator",
  ayanami: "memory_curator",
  yui: "builder",
  maomao: "researcher",
  cc: "risk_officer",
  robin: "mediator",
  nico_robin: "mediator",
  frieren: "watchdog",
  misato: "external",
};

const EXPRESSION_RE = /^[a-z_]+\.(png|jpe?g|webp)$/i;

function findMappedDirs(root, found = [], depth = 0) {
  if (depth > 6) return found;
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(root, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;
    if (/_mapped$/i.test(entry)) {
      found.push(full);
    } else if (!["node_modules", ".git", "dist"].includes(entry)) {
      findMappedDirs(full, found, depth + 1);
    }
  }
  return found;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const sources = args.filter((arg) => arg !== "--dry");
if (sources.length === 0) sources.push(join(homedir(), "Downloads"));

let imported = 0;
let skipped = 0;
for (const source of sources) {
  if (!existsSync(source)) {
    console.warn(`소스 없음: ${source}`);
    continue;
  }
  for (const mappedDir of findMappedDirs(source)) {
    const character = basename(mappedDir).replace(/_mapped$/i, "").toLowerCase();
    const slug = SLUG_ALIASES[character];
    if (!slug) {
      console.warn(`매핑 없는 캐릭터, 건너뜀: ${basename(mappedDir)} (SLUG_ALIASES에 추가하세요)`);
      skipped += 1;
      continue;
    }
    const files = readdirSync(mappedDir).filter((file) => EXPRESSION_RE.test(file));
    if (files.length === 0) {
      console.warn(`표정 파일 없음: ${mappedDir}`);
      continue;
    }
    const destDir = join(agentsDir, slug, "expressions");
    if (!dryRun) mkdirSync(destDir, { recursive: true });
    for (const file of files) {
      const dest = join(destDir, file.toLowerCase());
      if (!dryRun) cpSync(join(mappedDir, file), dest);
    }
    console.log(`${character} → agents/${slug}/expressions/ (${files.length}종)${dryRun ? " [dry]" : ""}`);
    imported += 1;
  }
}

console.log(`\n완료: ${imported}캐릭터 임포트, ${skipped}건 건너뜀`);
if (imported === 0) {
  console.log("힌트: <캐릭터>_mapped 폴더(또는 zip을 푼 트리)를 Downloads에 두고 다시 실행하세요.");
  process.exitCode = 1;
}
