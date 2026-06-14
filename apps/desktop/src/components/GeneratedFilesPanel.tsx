import { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderClosed,
  FolderOpen,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";
import {
  buildScaffoldFileTree,
  flattenLeaves,
  summarizeGeneratedFiles,
  type GeneratedFileBranch,
  type GeneratedFileLeaf,
  type GeneratedFileNode,
} from "../lib/generatedFilesTree";
import { Card, CardHeader, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

/**
 * Generated Files Inspector — Mission Workspace에서 "이 앱이 어떤 파일들로 구성되어 있는지"
 * 트리 + 내용으로 검토할 수 있게 한다. Dyad가 갖는 신뢰 신호의 핵심.
 *
 * 정직성:
 *   - 자동 실행 0 — 읽기 전용. 편집/삭제/배포 0.
 *   - scaffold 없음 → "스캐폴드 없음" 안내(가짜 파일 트리 X).
 *   - gate가 막은 파일은 사유를 그대로 노출(secret_suspect / binary / too_large /
 *     empty_path). Preview는 보여주되 publish 경로의 안전성과 무관함을 분명히.
 *   - 매우 큰 파일은 내용 미리보기를 잘라서 보여주고 "+ N 줄 더 있음" 표시.
 *
 * 라이선스: 우리 자체 구현 — Dyad/OSS 코드 이식 0. shadcn Card/Badge primitive 사용
 * (src/components/ui/, MIT — src/components/ui/LICENSE.md 참고).
 */

const MAX_PREVIEW_LINES = 200;

const GATE_LABEL: Record<string, string> = {
  empty_path: "빈 경로",
  binary: "바이너리",
  too_large: "대용량",
  secret_suspect: "시크릿 의심",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function previewLines(text: string): { shown: string[]; remaining: number } {
  if (!text) return { shown: [], remaining: 0 };
  const all = text.split("\n");
  // splitting 시 마지막 항목이 "" 이면 trailing newline. 표시 시에는 무시.
  const trimmed = all.length > 0 && all[all.length - 1] === "" ? all.slice(0, -1) : all;
  if (trimmed.length <= MAX_PREVIEW_LINES) return { shown: trimmed, remaining: 0 };
  return { shown: trimmed.slice(0, MAX_PREVIEW_LINES), remaining: trimmed.length - MAX_PREVIEW_LINES };
}

export function GeneratedFilesPanel({
  missionId,
  files,
}: {
  missionId: string;
  /** undefined: scaffold 로딩 안 됨/없음. 빈 배열: 명시적으로 "0 파일". */
  files: ReadonlyArray<MissionScaffoldFile> | undefined;
}) {
  const tree = useMemo(() => buildScaffoldFileTree(files ?? []), [files]);
  const summary = useMemo(() => summarizeGeneratedFiles(tree), [tree]);
  const leaves = useMemo(() => flattenLeaves(tree), [tree]);
  // 기본 선택: 첫 안전 파일, 없으면 첫 leaf.
  const initialPath = useMemo(() => {
    const firstSafe = leaves.find((l) => l.gate.ok);
    return (firstSafe ?? leaves[0])?.path;
  }, [leaves]);
  const [selectedPath, setSelectedPath] = useState<string | undefined>(initialPath);
  const selected = useMemo(
    () => leaves.find((l) => l.path === selectedPath) ?? leaves.find((l) => l.gate.ok) ?? leaves[0],
    [leaves, selectedPath],
  );

  if (!files) {
    return (
      <Card
        className="generated-files generated-files--empty"
        data-testid={`generated-files-${missionId}`}
        data-state="absent"
      >
        <CardHeader>
          <span className="generated-files__title">생성된 파일</span>
        </CardHeader>
        <CardContent>
          <p className="generated-files__muted" data-testid={`generated-files-empty-${missionId}`}>
            스캐폴드 없음 — preview 실행 또는 scaffold refresh가 필요합니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="generated-files"
      data-testid={`generated-files-${missionId}`}
      data-state="present"
      data-total={summary.total}
      data-safe={summary.safe}
    >
      <CardHeader className="generated-files__head flex flex-row items-center gap-2 flex-wrap">
        <span className="generated-files__title font-semibold">생성된 파일</span>
        <Badge variant="secondary" data-testid={`generated-files-total-${missionId}`}>
          총 {summary.total}개
        </Badge>
        <Badge variant="default" data-testid={`generated-files-safe-${missionId}`}>
          <ShieldCheck size={10} /> 안전 {summary.safe}
        </Badge>
        {summary.total - summary.safe > 0 ? (
          <Badge variant="destructive" data-testid={`generated-files-blocked-${missionId}`}>
            <ShieldAlert size={10} /> 막힘 {summary.total - summary.safe}
          </Badge>
        ) : null}
        <span className="generated-files__muted text-muted-foreground text-xs">
          {formatBytes(summary.totalBytes)}
        </span>
      </CardHeader>

      <CardContent>
        <div className="generated-files__grid grid grid-cols-[minmax(160px,1fr)_2fr] gap-3">
          {/* tree */}
          <nav
            className="generated-files__tree"
            data-testid={`generated-files-tree-${missionId}`}
            aria-label="생성된 파일 트리"
          >
            <FileTree
              missionId={missionId}
              nodes={tree}
              selectedPath={selected?.path}
              onSelect={(p) => setSelectedPath(p)}
            />
          </nav>

          {/* preview */}
          <div
            className="generated-files__preview"
            data-testid={`generated-files-preview-${missionId}`}
          >
            {selected ? (
              <FilePreview missionId={missionId} leaf={selected} />
            ) : (
              <p className="generated-files__muted">파일을 선택하세요.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FileTree({
  missionId,
  nodes,
  selectedPath,
  onSelect,
}: {
  missionId: string;
  nodes: ReadonlyArray<GeneratedFileNode>;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="generated-files__tree-list">
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <DirNode
            key={`dir:${node.path}`}
            missionId={missionId}
            node={node}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ) : (
          <LeafItem
            key={`file:${node.path}`}
            missionId={missionId}
            leaf={node}
            selected={node.path === selectedPath}
            onSelect={onSelect}
          />
        ),
      )}
    </ul>
  );
}

function DirNode({
  missionId,
  node,
  selectedPath,
  onSelect,
}: {
  missionId: string;
  node: GeneratedFileBranch;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li
      className={`generated-files__dir ${open ? "is-open" : "is-closed"}`}
      data-testid={`generated-files-dir-${missionId}-${node.path}`}
    >
      <button
        type="button"
        className="generated-files__dir-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`generated-files-dir-toggle-${missionId}-${node.path}`}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {open ? <FolderOpen size={11} /> : <FolderClosed size={11} />}
        <span>{node.name}</span>
        <span className="generated-files__muted text-muted-foreground text-xs ml-1">
          {node.children.length}
        </span>
      </button>
      {open ? (
        <FileTree
          missionId={missionId}
          nodes={node.children}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ) : null}
    </li>
  );
}

function LeafItem({
  missionId,
  leaf,
  selected,
  onSelect,
}: {
  missionId: string;
  leaf: GeneratedFileLeaf;
  selected: boolean;
  onSelect: (path: string) => void;
}) {
  return (
    <li className="generated-files__leaf">
      <button
        type="button"
        className={`generated-files__leaf-button ${selected ? "is-selected" : ""}`}
        onClick={() => onSelect(leaf.path)}
        aria-current={selected ? "true" : undefined}
        data-testid={`generated-files-leaf-${missionId}-${leaf.path}`}
        data-gate={leaf.gate.ok ? "ok" : leaf.gate.reason}
      >
        <FileText size={11} />
        <span className="generated-files__leaf-name">{leaf.name || "(빈 경로)"}</span>
        {leaf.operation ? (
          <Badge variant="outline" className="generated-files__op-badge ml-1">
            {leaf.operation}
          </Badge>
        ) : null}
        {!leaf.gate.ok ? (
          <Badge
            variant="destructive"
            className="generated-files__gate-badge ml-1"
            data-testid={`generated-files-leaf-gate-${missionId}-${leaf.path}`}
          >
            {GATE_LABEL[leaf.gate.reason]}
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

function FilePreview({ missionId, leaf }: { missionId: string; leaf: GeneratedFileLeaf }) {
  const { shown, remaining } = previewLines(leaf.file.newContent);
  return (
    <div className="generated-files__preview-inner">
      <div className="generated-files__preview-head flex items-center gap-2 flex-wrap mb-1">
        <code
          className="generated-files__preview-path text-xs"
          data-testid={`generated-files-preview-path-${missionId}`}
        >
          {leaf.path || "(빈 경로)"}
        </code>
        <span className="generated-files__muted text-muted-foreground text-xs">
          {formatBytes(leaf.byteLength)} · {leaf.lineCount}줄
        </span>
        {!leaf.gate.ok ? (
          <Badge variant="destructive" className="generated-files__preview-gate">
            {GATE_LABEL[leaf.gate.reason]}
          </Badge>
        ) : null}
      </div>
      <pre
        className="generated-files__preview-body text-xs bg-muted/40 rounded-md p-2 overflow-auto"
        data-testid={`generated-files-preview-body-${missionId}`}
      >
        {shown.map((line, idx) => (
          <div key={idx} className="generated-files__preview-line">
            <span className="generated-files__preview-lineno text-muted-foreground mr-2">
              {String(idx + 1).padStart(4, " ")}
            </span>
            <span>{line}</span>
          </div>
        ))}
      </pre>
      {remaining > 0 ? (
        <p
          className="generated-files__muted text-muted-foreground text-xs mt-1"
          data-testid={`generated-files-preview-truncated-${missionId}`}
        >
          + {remaining} 줄 더 있음 (미리보기는 최대 {MAX_PREVIEW_LINES} 줄)
        </p>
      ) : null}
    </div>
  );
}
