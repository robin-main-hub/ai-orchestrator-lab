/**
 * Lite repo map (P0-3, KIMI 브리프). "어떤 파일을 컨텍스트에 넣을지"를 자동
 * 선택하는 경량 엔진. 현재는 @멘션 수동 첨부뿐이라 큰 레포에서 부담이 크다.
 *
 * Aider repo-map(tree-sitter + PageRank)의 경량판: 네이티브 tree-sitter 의존성
 * 없이 정규식으로 export/정의/import 심볼을 뽑고, import 그래프 위에서
 * PageRank-lite로 파일을 순위화한 뒤, 토큰 예산 안에서 상위 파일의 시그니처만
 * 렌더한다. 순수 함수라 브라우저/vite에서 동작하고 단위 테스트가 쉽다.
 *
 * Tier 1(구조적, 항상 ON)에 해당. Tier 2(임베딩 의미 검색)는 후속.
 */

export type SymbolKind = "function" | "class" | "interface" | "type" | "const" | "enum";

export type FileSymbols = {
  path: string;
  /** 이 파일이 정의(export 우선)한 심볼 시그니처 라인 */
  defs: Array<{ kind: SymbolKind; name: string; signature: string; exported: boolean }>;
  /** 이 파일이 import하는 모듈 경로(상대경로는 정규화 전 원문) */
  imports: string[];
};

const DEF_PATTERNS: Array<{ kind: SymbolKind; re: RegExp }> = [
  { kind: "function", re: /^(\s*export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*(\([^)]*\))?/ },
  { kind: "class", re: /^(\s*export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: "interface", re: /^(\s*export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: "type", re: /^(\s*export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: "enum", re: /^(\s*export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
  // const/let 함수형·값 export (화살표 함수 포함). 마지막에 둬서 function/class와 안 겹치게.
  { kind: "const", re: /^(\s*export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[:=]/ },
];

const IMPORT_RE = /^\s*(?:import\b[^'"]*?from\s*|import\s*|export\s+[^'"]*?from\s*)['"]([^'"]+)['"]/;

/** 한 파일의 정의/import 심볼을 정규식으로 추출 (TS/JS 대상) */
export function extractSymbols(path: string, content: string): FileSymbols {
  const defs: FileSymbols["defs"] = [];
  const imports: string[] = [];
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const importMatch = IMPORT_RE.exec(line);
    if (importMatch) {
      imports.push(importMatch[1]!);
      continue;
    }
    for (const { kind, re } of DEF_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        const exported = Boolean(m[1]);
        const name = m[2]!;
        defs.push({ kind, name, exported, signature: line.trim().slice(0, 200) });
        break; // 한 라인은 하나의 정의로
      }
    }
  }
  // export된 심볼을 먼저, 같은 이름 중복 제거
  const seen = new Set<string>();
  const dedup = defs
    .sort((a, b) => Number(b.exported) - Number(a.exported))
    .filter((d) => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });
  return { path, defs: dedup, imports: Array.from(new Set(imports)) };
}

/** 상대 import를 파일 경로로 해석 (확장자 추론 + index). 매칭 실패 시 null */
export function resolveImport(fromPath: string, spec: string, knownPaths: Set<string>): string | null {
  if (!spec.startsWith(".")) return null; // 외부 패키지는 그래프에서 제외
  const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const parts = `${baseDir}/${spec}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  const target = stack.join("/");
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    `${target}.jsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ];
  for (const c of candidates) if (knownPaths.has(c)) return c;
  return null;
}

export type RankedFile = { path: string; score: number };

/**
 * PageRank-lite: import 그래프에서 "참조 받는 정도"를 가중 합으로 근사한다.
 * - 다른 파일이 import할수록 점수↑ (sqrt 감쇠로 허브 과대평가 방지)
 * - chat 파일(편집 중)이 import하는 파일에 큰 부스트 (가장 강한 관련 신호)
 * - mentionedSymbols를 export하는 파일에 부스트
 * 반복 PageRank 대신 2-hop 가중 전파로 충분한 신호를 얻는다 (브리프 "lite").
 */
export function rankFiles(input: {
  files: FileSymbols[];
  chatFiles?: string[];
  mentionedSymbols?: string[];
}): RankedFile[] {
  const { files } = input;
  const chatFiles = new Set(input.chatFiles ?? []);
  const mentioned = new Set((input.mentionedSymbols ?? []).map((s) => s.toLowerCase()));
  const known = new Set(files.map((f) => f.path));
  const byPath = new Map(files.map((f) => [f.path, f]));

  const inboundFrom = new Map<string, Set<string>>(); // target → {importers}
  for (const f of files) {
    for (const spec of f.imports) {
      const target = resolveImport(f.path, spec, known);
      if (!target) continue;
      if (!inboundFrom.has(target)) inboundFrom.set(target, new Set());
      inboundFrom.get(target)!.add(f.path);
    }
  }

  const scores = new Map<string, number>();
  for (const f of files) {
    let score = 1; // base
    const importers = inboundFrom.get(f.path) ?? new Set();
    score += Math.sqrt(importers.size); // 참조 빈도 (감쇠)
    for (const importer of importers) {
      if (chatFiles.has(importer)) score += 8; // 편집 중 파일이 직접 import → 강한 신호
    }
    if (chatFiles.has(f.path)) score += 5; // 자기 자신이 편집 중
    if (mentioned.size > 0) {
      const exportsMentioned = (byPath.get(f.path)?.defs ?? []).some(
        (d) => d.exported && mentioned.has(d.name.toLowerCase()),
      );
      if (exportsMentioned) score += 6;
    }
    scores.set(f.path, score);
  }

  // 2-hop: chat 파일이 import한 파일이 다시 import한 파일에도 약한 전파
  for (const chat of chatFiles) {
    const f = byPath.get(chat);
    if (!f) continue;
    for (const spec of f.imports) {
      const t1 = resolveImport(chat, spec, known);
      if (!t1) continue;
      const f1 = byPath.get(t1);
      if (!f1) continue;
      for (const spec2 of f1.imports) {
        const t2 = resolveImport(t1, spec2, known);
        if (t2 && t2 !== chat) scores.set(t2, (scores.get(t2) ?? 1) + 2);
      }
    }
  }

  return Array.from(scores.entries())
    .map(([path, score]) => ({ path, score }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** 대략적 토큰 추정 (영문/코드 ~4자 = 1토큰) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type RenderRepoMapInput = {
  files: FileSymbols[];
  ranked: RankedFile[];
  /** repo-map에 허용된 토큰 예산 (기본 1024, Aider와 동일) */
  maxTokens?: number;
  /** 이미 컨텍스트에 완전히 들어간 파일 — 맵에서 제외 */
  excludePaths?: string[];
};

/**
 * 순위 상위 파일의 export 시그니처를 토큰 예산 안에서 렌더한다. Aider의
 * scope-aware 렌더링 경량판: 파일별로 export 정의 라인만 보여주고 본문은 생략.
 */
export function renderRepoMap(input: RenderRepoMapInput): string {
  const maxTokens = input.maxTokens ?? 1024;
  const exclude = new Set(input.excludePaths ?? []);
  const byPath = new Map(input.files.map((f) => [f.path, f]));

  const sections: string[] = [];
  let used = 0;
  for (const { path } of input.ranked) {
    if (exclude.has(path)) continue;
    const file = byPath.get(path);
    if (!file) continue;
    const exportedDefs = file.defs.filter((d) => d.exported);
    const shown = exportedDefs.length > 0 ? exportedDefs : file.defs.slice(0, 3);
    if (shown.length === 0) continue;
    const lines = shown.map((d) => `  ${d.signature}`);
    const section = `${path}:\n${lines.join("\n")}`;
    const cost = estimateTokens(section);
    if (used + cost > maxTokens) {
      if (sections.length === 0) {
        // 최소 한 파일은 시그니처 일부라도 — 예산 내로 잘라 넣는다
        sections.push(`${path}:\n${lines.slice(0, 3).join("\n")}`);
      }
      break;
    }
    sections.push(section);
    used += cost;
  }

  if (sections.length === 0) return "";
  return ["저장소 맵 (관련 파일 시그니처 — 전체 코드 아님):", ...sections].join("\n\n");
}

/** 파일 맵 → repo-map 텍스트 (편의 진입점) */
export function buildRepoMap(input: {
  files: Array<{ path: string; content: string }>;
  chatFiles?: string[];
  mentionedSymbols?: string[];
  maxTokens?: number;
}): { repoMap: string; ranked: RankedFile[]; symbols: FileSymbols[] } {
  const symbols = input.files.map((f) => extractSymbols(f.path, f.content));
  const ranked = rankFiles({
    files: symbols,
    chatFiles: input.chatFiles,
    mentionedSymbols: input.mentionedSymbols,
  });
  const repoMap = renderRepoMap({
    files: symbols,
    ranked,
    maxTokens: input.maxTokens,
    excludePaths: input.chatFiles, // 편집 중 파일은 이미 컨텍스트에 있음
  });
  return { repoMap, ranked, symbols };
}
