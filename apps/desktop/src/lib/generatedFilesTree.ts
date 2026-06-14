import { evaluateScaffoldFile, type MissionScaffoldFile, type ScaffoldGateReason } from "./missionPublishPrefill";

/**
 * Scaffold 파일 배열을 Mission Workspace에 표시할 트리 구조로 변환한다.
 *
 *   - 입력: `MissionScaffoldFile[]` (path는 repo-root-relative, '/' 구분)
 *   - 출력: 디렉토리/파일 노드의 재귀 트리. 한 디렉토리 안에서는
 *     디렉토리 먼저, 파일 그 다음으로 정렬한다. 둘 다 알파벳 순.
 *   - 파일 노드에는 `gate` 평가 결과(safe / 사유)와 utf-8 바이트 수, 라인 수를
 *     함께 실어준다. UI가 따로 계산하지 않게.
 *   - 정직성: 추측 X. 빈 경로 / NUL 포함 등은 모두 gate에서 "blocked"로
 *     처리되어 사용자에게 그대로 노출된다.
 *
 * 자동 실행 0 — 순수 변환.
 */

export type GeneratedFileGate =
  | { ok: true }
  | { ok: false; reason: ScaffoldGateReason };

export type GeneratedFileLeaf = {
  kind: "file";
  /** 표시용 이름(예: "App.tsx") — 트리의 마지막 segment. */
  name: string;
  /** 전체 path(예: "apps/desktop/src/App.tsx"). 노드 키로 사용. */
  path: string;
  /** create/update 표식(원본에 있는 경우만). 정직성 — 추측 금지. */
  operation?: "create" | "update";
  gate: GeneratedFileGate;
  /** utf-8 바이트 수 — UI 정직 신호("xx KB"). */
  byteLength: number;
  /** 라인 수(빈 파일이면 0, 마지막 줄 newline은 한 줄로 계산). */
  lineCount: number;
  /** 원본 file 참조 — 내용 미리보기에서 그대로 쓴다. */
  file: MissionScaffoldFile;
};

export type GeneratedFileBranch = {
  kind: "dir";
  /** 표시용 이름(예: "components") — 트리의 한 segment. */
  name: string;
  /** 누적 path(예: "apps/desktop/src/components"). 노드 키로 사용. */
  path: string;
  children: ReadonlyArray<GeneratedFileNode>;
};

export type GeneratedFileNode = GeneratedFileBranch | GeneratedFileLeaf;

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function countLines(text: string): number {
  if (!text) return 0;
  // splitting '\n' includes a trailing "" for content that ends with newline.
  // We want the *visible* line count: a 3-line file ends with two '\n's or three.
  // The simplest honest read: count '\n' + (last segment non-empty ? 1 : 0).
  let nl = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) nl += 1;
  }
  const trailingNewline = text.charCodeAt(text.length - 1) === 10;
  return trailingNewline ? nl : nl + 1;
}

function makeLeaf(file: MissionScaffoldFile, segments: string[]): GeneratedFileLeaf {
  const path = segments.join("/");
  const gate = evaluateScaffoldFile(file);
  return {
    kind: "file",
    name: segments[segments.length - 1] ?? path,
    path,
    operation: file.operation,
    gate: gate.ok ? { ok: true } : { ok: false, reason: gate.reason },
    byteLength: utf8ByteLength(file.newContent),
    lineCount: countLines(file.newContent),
    file,
  };
}

function sortChildren(children: GeneratedFileNode[]): GeneratedFileNode[] {
  // 디렉토리 먼저, 그 다음 파일. 같은 종류 내에서는 알파벳 순.
  return children
    .slice()
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

type WorkingBranch = {
  kind: "dir";
  name: string;
  path: string;
  childrenByName: Map<string, WorkingBranch | GeneratedFileLeaf>;
};

function emptyBranch(name: string, path: string): WorkingBranch {
  return { kind: "dir", name, path, childrenByName: new Map() };
}

function finalize(branch: WorkingBranch): GeneratedFileBranch {
  const children: GeneratedFileNode[] = [];
  for (const node of branch.childrenByName.values()) {
    children.push(node.kind === "dir" ? finalize(node) : node);
  }
  return {
    kind: "dir",
    name: branch.name,
    path: branch.path,
    children: sortChildren(children),
  };
}

export function buildScaffoldFileTree(
  files: ReadonlyArray<MissionScaffoldFile>,
): ReadonlyArray<GeneratedFileNode> {
  const root = emptyBranch("", "");
  for (const file of files) {
    // empty_path는 gate에서 "blocked"로 잡힘. 트리에서는 path 그대로 노드를 만든다.
    const raw = file.path ?? "";
    const segments = raw.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) {
      // 트리 상 root 바로 아래에 익명 leaf(name=""). UI는 gate.reason="empty_path"로 노출.
      const leaf = makeLeaf(file, [""]);
      root.childrenByName.set(`__empty_${root.childrenByName.size}`, leaf);
      continue;
    }
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const name = segments[i]!;
      const existing = cursor.childrenByName.get(name);
      if (existing && existing.kind === "dir") {
        cursor = existing;
      } else if (existing && existing.kind === "file") {
        // 동일 이름의 파일과 디렉토리가 충돌 — 디렉토리로 승격하지 않고
        // 별도 키로 두 노드를 모두 유지(정직성: 입력의 충돌을 숨기지 않는다).
        const branch = emptyBranch(name, [...segments.slice(0, i + 1)].join("/"));
        cursor.childrenByName.set(`${name}__dir`, branch);
        cursor = branch;
      } else {
        const branch = emptyBranch(name, [...segments.slice(0, i + 1)].join("/"));
        cursor.childrenByName.set(name, branch);
        cursor = branch;
      }
    }
    const leafName = segments[segments.length - 1]!;
    const leaf = makeLeaf(file, segments);
    // 동일 path 중복 시 마지막 것이 이긴다 — 입력 순서를 호출자가 보장해야 함.
    cursor.childrenByName.set(leafName, leaf);
  }
  const finalized: GeneratedFileNode[] = [];
  for (const node of root.childrenByName.values()) {
    finalized.push(node.kind === "dir" ? finalize(node) : node);
  }
  return sortChildren(finalized);
}

/** 트리 전체에서 leaf만 평탄화 — 통계, 키보드 내비게이션에 사용. */
export function flattenLeaves(nodes: ReadonlyArray<GeneratedFileNode>): ReadonlyArray<GeneratedFileLeaf> {
  const out: GeneratedFileLeaf[] = [];
  const walk = (list: ReadonlyArray<GeneratedFileNode>): void => {
    for (const n of list) {
      if (n.kind === "file") out.push(n);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export type GeneratedFilesSummary = {
  total: number;
  safe: number;
  blocked: Record<ScaffoldGateReason, number>;
  totalBytes: number;
};

export function summarizeGeneratedFiles(
  nodes: ReadonlyArray<GeneratedFileNode>,
): GeneratedFilesSummary {
  const summary: GeneratedFilesSummary = {
    total: 0,
    safe: 0,
    blocked: { empty_path: 0, binary: 0, too_large: 0, secret_suspect: 0 },
    totalBytes: 0,
  };
  for (const leaf of flattenLeaves(nodes)) {
    summary.total += 1;
    summary.totalBytes += leaf.byteLength;
    if (leaf.gate.ok) summary.safe += 1;
    else summary.blocked[leaf.gate.reason] += 1;
  }
  return summary;
}
