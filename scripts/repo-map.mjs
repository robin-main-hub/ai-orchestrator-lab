#!/usr/bin/env node
/**
 * Repo-map generator (P0-3 후속, KIMI 브리프). 전체 레포를 한 번에 인덱싱해
 * repo-map 텍스트를 stdout으로 출력한다. 코딩 워크벤치는 세션 시작 시 이 스크립트를
 * 원격(dgx) tmux에서 실행해, 첫 턴부터 "어떤 파일이 있고 무엇을 export하는지"를
 * 시스템 프롬프트에 시드한다(read 누적만으론 첫 턴 맵이 비어 있음).
 *
 * 알고리즘은 apps/desktop/src/lib/repoMap.ts와 동일 명세(정규식 심볼 추출 + import
 * 그래프 PageRank-lite + 토큰 예산 렌더링). 그쪽이 vitest로 명세를 고정하고, 이
 * 스크립트는 git ls-files로 전체 파일을 읽어 dgx에서 자립 실행한다(추가 의존성 0).
 *
 * 사용:
 *   node scripts/repo-map.mjs [--max-tokens 1200] [--chat <path>[,<path>]] [glob ...]
 * 기본 대상: git ls-files 중 *.ts/*.tsx/*.js/*.jsx (node_modules/dist 제외)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
let maxTokens = 1200;
let chatFiles = [];
const globs = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--max-tokens") { maxTokens = Number(args[++i]) || maxTokens; }
  else if (args[i] === "--chat") { chatFiles = (args[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean); }
  else globs.push(args[i]);
}

// ── 파일 목록 (git 추적, 코드 파일만) ────────────────────────────────────────
let tracked = [];
try {
  const out = execSync("git ls-files", { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  tracked = out.split("\n").map((s) => s.trim()).filter(Boolean);
} catch {
  console.error("repo-map: git ls-files 실패 (git 레포가 아님?)");
  process.exit(1);
}
const CODE_RE = /\.(t|j)sx?$/;
const SKIP_RE = /(^|\/)(node_modules|dist|build|\.next|coverage)\//;
let files = tracked.filter((p) => CODE_RE.test(p) && !SKIP_RE.test(p) && !p.includes(".test.") && !p.includes(".spec."));
if (globs.length > 0) {
  files = files.filter((p) => globs.some((g) => p.includes(g.replace(/\*/g, ""))));
}
// 과도한 레포 방지: 상한
files = files.slice(0, 4000);

// ── 심볼 추출 (repoMap.ts와 동일 패턴) ───────────────────────────────────────
const DEF_PATTERNS = [
  ["function", /^(\s*export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*(\([^)]*\))?/],
  ["class", /^(\s*export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/],
  ["interface", /^(\s*export\s+)?interface\s+([A-Za-z_$][\w$]*)/],
  ["type", /^(\s*export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/],
  ["enum", /^(\s*export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/],
  ["const", /^(\s*export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[:=]/],
];
const IMPORT_RE = /^\s*(?:import\b[^'"]*?from\s*|import\s*|export\s+[^'"]*?from\s*)['"]([^'"]+)['"]/;

function extractSymbols(path, content) {
  const defs = [];
  const imports = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\t/g, "  ");
    const im = IMPORT_RE.exec(line);
    if (im) { imports.push(im[1]); continue; }
    for (const [kind, re] of DEF_PATTERNS) {
      const m = re.exec(line);
      if (m) { defs.push({ kind, name: m[2], exported: Boolean(m[1]), signature: line.trim().slice(0, 200) }); break; }
    }
  }
  const seen = new Set();
  const dedup = defs.sort((a, b) => Number(b.exported) - Number(a.exported)).filter((d) => (seen.has(d.name) ? false : (seen.add(d.name), true)));
  return { path, defs: dedup, imports: [...new Set(imports)] };
}

function resolveImport(fromPath, spec, known) {
  if (!spec.startsWith(".")) return null;
  const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const stack = [];
  for (const part of `${baseDir}/${spec}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop(); else stack.push(part);
  }
  const t = stack.join("/");
  for (const c of [t, `${t}.ts`, `${t}.tsx`, `${t}.js`, `${t}.jsx`, `${t}/index.ts`, `${t}/index.tsx`]) if (known.has(c)) return c;
  return null;
}

const symbols = [];
for (const path of files) {
  try { symbols.push(extractSymbols(path, readFileSync(path, "utf-8"))); } catch { /* 읽기 실패 무시 */ }
}

// ── 랭킹 (PageRank-lite) ─────────────────────────────────────────────────────
const known = new Set(symbols.map((f) => f.path));
const chatSet = new Set(chatFiles);
const inbound = new Map();
for (const f of symbols) for (const spec of f.imports) {
  const t = resolveImport(f.path, spec, known);
  if (!t) continue;
  if (!inbound.has(t)) inbound.set(t, new Set());
  inbound.get(t).add(f.path);
}
const scores = new Map();
for (const f of symbols) {
  let s = 1;
  const importers = inbound.get(f.path) ?? new Set();
  s += Math.sqrt(importers.size);
  for (const imp of importers) if (chatSet.has(imp)) s += 8;
  if (chatSet.has(f.path)) s += 5;
  scores.set(f.path, s);
}
const ranked = [...scores.entries()].map(([path, score]) => ({ path, score })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

// ── 렌더 (토큰 예산) ─────────────────────────────────────────────────────────
const byPath = new Map(symbols.map((f) => [f.path, f]));
const estTokens = (t) => Math.ceil(t.length / 4);
const sections = [];
let used = 0;
for (const { path } of ranked) {
  if (chatSet.has(path)) continue;
  const f = byPath.get(path);
  if (!f) continue;
  const exported = f.defs.filter((d) => d.exported);
  const shown = exported.length > 0 ? exported : f.defs.slice(0, 3);
  if (shown.length === 0) continue;
  const section = `${path}:\n${shown.map((d) => `  ${d.signature}`).join("\n")}`;
  const cost = estTokens(section);
  if (used + cost > maxTokens) break;
  sections.push(section);
  used += cost;
}

if (sections.length === 0) {
  console.log("(repo-map: 인덱싱된 export 심볼 없음)");
} else {
  console.log(`저장소 맵 (${symbols.length}개 파일 인덱싱, 상위 ${sections.length}개 표시 · ~${used} 토큰):`);
  console.log("");
  console.log(sections.join("\n\n"));
}
