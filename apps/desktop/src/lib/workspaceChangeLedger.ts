import type { ToolCall } from "./codingChat";

/**
 * Phase A — 워크스페이스 변경 원장.
 *
 * 코딩 워크벤치의 도구 실행(write/edit/read/grep…)을 기록하는 모듈 싱글톤 스토어.
 * 대화 탭 사이드 패널의 Diff/Files 모드가 useSyncExternalStore로 구독해, 에이전트가
 * 어떤 파일을 만졌고 어떤 변경을 만들었는지 탭을 오가며 실시간으로 본다.
 * localStorage에 최근 항목을 지속해 새로고침에도 살아남는다. 순수 로직은 분리·테스트.
 */

export type WorkspaceChangeKind = "write" | "edit" | "read" | "grep" | "glob" | "bash";

export type WorkspaceChange = {
  id: string;
  at: string;
  kind: WorkspaceChangeKind;
  /** 대상 경로 (bash는 명령 문자열) */
  path: string;
  /** write: 새 내용 머리 / edit: old→new 블록 / bash: 명령 */
  preview?: string;
  /** write 내용 전체 줄 수 */
  lineCount?: number;
  /** 변경 도구인가 (Diff 패널 대상) */
  mutating: boolean;
};

const STORAGE_KEY = "orch.workspaceChanges.v1";
const MAX_ENTRIES = 80;

/** ToolCall → 원장 항목 (기록 불필요한 호출은 null) */
export function changeFromToolCall(call: ToolCall, now: string, seq: number): WorkspaceChange | null {
  const input = call.input ?? {};
  const path = String(input.path ?? "").trim();
  switch (call.tool) {
    case "write": {
      if (!path) return null;
      const content = String(input.content ?? "");
      const lines = content.length === 0 ? 0 : content.split("\n").length;
      return {
        id: `wc_${now}_${seq}`,
        at: now,
        kind: "write",
        path,
        preview: content.split("\n").slice(0, 8).join("\n"),
        lineCount: lines,
        mutating: true,
      };
    }
    case "edit": {
      if (!path) return null;
      const oldString = String(input.old_string ?? input.oldString ?? "");
      const newString = String(input.new_string ?? input.newString ?? "");
      const preview = [
        ...oldString.split("\n").slice(0, 4).map((line) => `- ${line}`),
        ...newString.split("\n").slice(0, 4).map((line) => `+ ${line}`),
      ].join("\n");
      return { id: `wc_${now}_${seq}`, at: now, kind: "edit", path, preview, mutating: true };
    }
    case "read":
    case "grep":
    case "glob": {
      const target = path || String(input.pattern ?? "").trim();
      if (!target) return null;
      return { id: `wc_${now}_${seq}`, at: now, kind: call.tool, path: target, mutating: false };
    }
    case "bash": {
      const command = String(input.command ?? "").trim();
      if (!command) return null;
      return { id: `wc_${now}_${seq}`, at: now, kind: "bash", path: command.slice(0, 120), mutating: true };
    }
    default:
      return null;
  }
}

export type FileTouch = {
  path: string;
  /** 가장 강한 작업 종류 (write > edit > bash > read/grep/glob) */
  kind: WorkspaceChangeKind;
  count: number;
  lastAt: string;
};

const KIND_WEIGHT: Record<WorkspaceChangeKind, number> = { write: 5, edit: 4, bash: 3, read: 2, grep: 1, glob: 1 };

/** 변경 목록 → 파일별 집계 (Files 패널) — bash는 파일이 아니므로 제외 */
export function touchesFromChanges(changes: ReadonlyArray<WorkspaceChange>): FileTouch[] {
  const byPath = new Map<string, FileTouch>();
  for (const change of changes) {
    if (change.kind === "bash") continue;
    const existing = byPath.get(change.path);
    if (!existing) {
      byPath.set(change.path, { path: change.path, kind: change.kind, count: 1, lastAt: change.at });
    } else {
      existing.count += 1;
      existing.lastAt = change.at > existing.lastAt ? change.at : existing.lastAt;
      if (KIND_WEIGHT[change.kind] > KIND_WEIGHT[existing.kind]) existing.kind = change.kind;
    }
  }
  return [...byPath.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// ── 모듈 싱글톤 스토어 (useSyncExternalStore 호환) ──

type Listener = () => void;

function loadInitial(): WorkspaceChange[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as WorkspaceChange[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let changes: WorkspaceChange[] = loadInitial();
const listeners = new Set<Listener>();
let seq = 0;

function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(changes.slice(0, MAX_ENTRIES)));
    }
  } catch {
    // storage 불가 환경은 세션 한정
  }
}

export const workspaceChangeLedger = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): WorkspaceChange[] {
    return changes;
  },
  recordToolCall(call: ToolCall): void {
    const entry = changeFromToolCall(call, new Date().toISOString(), (seq += 1));
    if (!entry) return;
    changes = [entry, ...changes].slice(0, MAX_ENTRIES);
    persist();
    listeners.forEach((listener) => listener());
  },
  clear(): void {
    changes = [];
    persist();
    listeners.forEach((listener) => listener());
  },
};
