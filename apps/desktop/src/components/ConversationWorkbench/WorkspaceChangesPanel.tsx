import { useSyncExternalStore } from "react";
import { FileDiff, FileText, Hammer, Search, TerminalSquare, Trash2 } from "lucide-react";
import {
  touchesFromChanges,
  workspaceChangeLedger,
  type WorkspaceChangeKind,
} from "../../lib/workspaceChangeLedger";
import { cn } from "@/lib/utils";

/**
 * Phase A — 사이드 패널 Diff/Files 실연결.
 * 코딩 워크벤치의 도구 실행이 기록한 워크스페이스 변경 원장을 구독해,
 * Diff 모드는 변경(write/edit/bash) 카드를, Files 모드는 만진 파일 집계를 보여준다.
 */

const KIND_META: Record<WorkspaceChangeKind, { icon: typeof FileDiff; label: string; tone: string }> = {
  write: { icon: Hammer, label: "쓰기", tone: "text-primary border-primary/30 bg-primary/10" },
  edit: { icon: FileDiff, label: "수정", tone: "text-primary border-primary/30 bg-primary/10" },
  bash: { icon: TerminalSquare, label: "명령", tone: "text-primary border-primary/30 bg-primary/10" },
  read: { icon: FileText, label: "읽기", tone: "text-foreground border-white/15 bg-white/5" },
  grep: { icon: Search, label: "검색", tone: "text-foreground border-white/15 bg-white/5" },
  glob: { icon: Search, label: "탐색", tone: "text-foreground border-white/15 bg-white/5" },
};

function useWorkspaceChanges() {
  return useSyncExternalStore(workspaceChangeLedger.subscribe, workspaceChangeLedger.getSnapshot, workspaceChangeLedger.getSnapshot);
}

function timeLabel(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ""
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function WorkspaceDiffPanel() {
  const changes = useWorkspaceChanges().filter((change) => change.mutating);
  if (changes.length === 0) {
    return (
      <p className="p-6 text-center text-[12.5px] leading-relaxed text-muted-foreground">
        아직 기록된 변경이 없습니다.
        <br />
        코딩 탭에서 에이전트가 write/edit/bash를 실행하면 여기에 누적됩니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <header className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>변경 {changes.length}건 · 코딩 워크벤치</span>
        <button
          aria-label="기록 비우기"
          className="rounded-md p-1 hover:bg-white/5 hover:text-foreground"
          onClick={() => workspaceChangeLedger.clear()}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>
      {changes.map((change) => {
        const meta = KIND_META[change.kind];
        const Icon = meta.icon;
        return (
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5" key={change.id}>
            <div className="flex items-center gap-2">
              <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px]", meta.tone)}>
                <Icon className="h-3 w-3" /> {meta.label}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{change.path}</code>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeLabel(change.at)}</span>
            </div>
            {change.preview ? (
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                {change.preview}
                {change.lineCount && change.lineCount > 8 ? `\n… (총 ${change.lineCount}줄)` : ""}
              </pre>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function WorkspaceFilesPanel() {
  const touches = touchesFromChanges(useWorkspaceChanges());
  if (touches.length === 0) {
    return (
      <p className="p-6 text-center text-[12.5px] leading-relaxed text-muted-foreground">
        에이전트가 만진 파일이 여기에 모입니다.
        <br />
        코딩 탭에서 read/write/edit/grep이 실행되면 자동 집계됩니다.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5 p-3">
      {touches.map((touch) => {
        const meta = KIND_META[touch.kind];
        const Icon = meta.icon;
        return (
          <li
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2"
            key={touch.path}
          >
            <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px]", meta.tone)}>
              <Icon className="h-3 w-3" /> {meta.label}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{touch.path}</code>
            <span className="shrink-0 text-[10px] text-muted-foreground">×{touch.count}</span>
          </li>
        );
      })}
    </ol>
  );
}
