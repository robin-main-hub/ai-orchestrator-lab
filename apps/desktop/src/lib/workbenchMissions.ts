/**
 * 워크벤치 미션 — 공유 스토어.
 *
 * Mission Board(코딩 탭)와 "대화를 worker로 포크"(대화 탭)가 같은 미션 목록을
 * 공유하도록, 마누스가 CodingWorkbench 안에 두었던 타입/생성/저장을 모듈 싱글톤
 * 스토어로 승격한다. useSyncExternalStore로 두 탭이 같은 진실을 본다.
 */

export type MissionStatus =
  | "running"
  | "done"
  | "blocked"
  | "failed"
  | "needs_review"
  | "killed"
  | "cleanup_ready";

export type WorkbenchMission = {
  id: string;
  title: string;
  role: string;
  agent: string;
  model: string;
  status: MissionStatus;
  worktree: { branch: string; path: string; baseBranch: string };
  allowedPaths: string[];
  deniedPaths: string[];
  tmux: { session: string; window: string; pane: string };
  gates: string[];
  artifacts: string[];
  diffPath: string;
  testOutputPath: string;
  heartbeat: string;
  lastOutput: string;
  events: Array<{ id: string; at: string; text: string }>;
  /** 대화 포크로 생성된 경우의 출처 요약 */
  origin?: string;
};

export const MISSIONS_STORAGE_KEY = "orch.codingWorkbench.missions.v1";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "agent-task"
  );
}

export function createMission(input: {
  role?: string;
  task?: string;
  model?: string;
  baseBranch?: string;
  allowedPaths?: string[];
  origin?: string;
  originEvent?: string;
}): WorkbenchMission {
  const now = new Date().toISOString();
  const slug = slugify(input.task || "agent task");
  const id = `ms_${Date.now().toString(36)}`;
  const role = input.role || "Implementer";
  return {
    id,
    title: input.task || `${role} 병렬 작업`,
    role,
    agent: role === "QA/Verifier" ? "qa-verifier" : role.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    model: input.model || "route: task complexity policy",
    status: "blocked",
    worktree: {
      branch: `agent/${slug}-${id.slice(-4)}`,
      path: `../ai-orchestrator-lab__worktrees/${slug}`,
      baseBranch: input.baseBranch || "main",
    },
    allowedPaths: input.allowedPaths ?? ["apps/desktop/src/**", "docs/**"],
    deniedPaths: [".env", "**/secrets/**", "node_modules/**"],
    tmux: { session: `orch-${id}`, window: "worker", pane: "0" },
    gates: ["human approval before send-keys", "diff review before merge", "sequential merge queue only"],
    artifacts: [],
    diffPath: `artifacts/${id}/changes.diff`,
    testOutputPath: `artifacts/${id}/verify.log`,
    heartbeat: now,
    lastOutput: "Mission shell is prepared as a safe fallback. Actual tmux/worktree runner is not attached yet.",
    events: [{ id: `ev_${Date.now()}`, at: now, text: input.originEvent ?? "Mission created from /fork fallback UI." }],
    origin: input.origin,
  };
}

// ── 모듈 싱글톤 스토어 ──

type Listener = () => void;

function loadInitial(): WorkbenchMission[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MISSIONS_STORAGE_KEY) ?? "[]") as WorkbenchMission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let missions: WorkbenchMission[] = loadInitial();
const listeners = new Set<Listener>();

function emit() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions));
    }
  } catch {
    // storage 불가 환경은 세션 한정
  }
  listeners.forEach((listener) => listener());
}

export const workbenchMissionStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): WorkbenchMission[] {
    return missions;
  },
  setMissions(updater: (current: WorkbenchMission[]) => WorkbenchMission[]): void {
    missions = updater(missions);
    emit();
  },
  add(mission: WorkbenchMission): void {
    missions = [mission, ...missions];
    emit();
  },
};

/** 호환용 — 초기 로드 */
export function loadMissions(): WorkbenchMission[] {
  return workbenchMissionStore.getSnapshot();
}
