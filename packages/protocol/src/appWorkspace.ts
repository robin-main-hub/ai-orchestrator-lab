import { z } from "zod";
import { truthStatusSchema } from "./truthStatus.js";

/**
 * AppWorkspace — Dyad식 "앱을 만들고 바로 본다" 경험을 현재 Mission/EventStorage/
 * SandboxRunner 위에 흡수하는 1차 primitive. Mission이 코딩/디자인을 수행할 때 붙는
 * 작업 공간(repo/worktree/preview/terminal/files)이다.
 *
 * 불변식(Dyad보다 권한 경계가 더 강해야 한다):
 *   - Workspace는 Mission에 붙는다. **source of truth가 아니다** — EventStorage가 진실,
 *     이건 mission.workspace.* 이벤트에서 materialize된 뷰다.
 *   - preview.port/url은 **실제 관측될 때만** truthStatus observed. 시작 전/실패는
 *     planned/configured — 가짜 running 금지.
 *   - terminal은 host shell 직결이 아니라 SandboxRunner/approval boundary 뒤에 둔다.
 *     이 primitive는 "의도/메타데이터"만 기록하고, 실제 실행은 기존 runner 경로로 간다.
 */

export const sandboxRunnerKindSchema = z.enum(["local", "docker", "gvisor", "tmux_observation"]);
export type SandboxRunnerKind = z.infer<typeof sandboxRunnerKindSchema>;

export const appTypeSchema = z.enum(["react_vite", "nextjs", "tauri", "unknown"]);
export type AppType = z.infer<typeof appTypeSchema>;

export const appWorkspacePreviewSchema = z.object({
  status: z.enum(["not_started", "starting", "running", "failed", "stopped", "blocked"]),
  port: z.number().int().optional(),
  url: z.string().optional(),
  /** 실행한 preview 명령(있으면) — trace/디버깅용. */
  command: z.string().optional(),
  /** 실패/blocked 사유 preview(redacted). */
  detail: z.string().optional(),
  truthStatus: truthStatusSchema,
});
export type AppWorkspacePreview = z.infer<typeof appWorkspacePreviewSchema>;

export const appWorkspaceTerminalSchema = z.object({
  runnerKind: sandboxRunnerKindSchema,
  sessionId: z.string().optional(),
  mode: z.enum(["read_only", "verify", "build"]),
});
export type AppWorkspaceTerminal = z.infer<typeof appWorkspaceTerminalSchema>;

export const appWorkspaceSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  repoRootRef: z.string(),
  worktreeRef: z.string().optional(),
  appType: appTypeSchema,
  preview: appWorkspacePreviewSchema,
  terminal: appWorkspaceTerminalSchema,
  files: z.object({ changedCount: z.number().int(), lastDiffRef: z.string().optional() }),
  createdAt: z.string(),
});
export type AppWorkspace = z.infer<typeof appWorkspaceSchema>;

/** 클라이언트 attach 요청 — id/createdAt/preview 기본값은 서버가 정한다(주장 못 함). */
export const appWorkspaceAttachRequestSchema = z.object({
  repoRootRef: z.string().min(1).max(1024),
  worktreeRef: z.string().max(1024).optional(),
  appType: appTypeSchema.default("unknown"),
  terminalMode: z.enum(["read_only", "verify", "build"]).default("read_only"),
  runnerKind: sandboxRunnerKindSchema.default("local"),
});
export type AppWorkspaceAttachRequest = z.infer<typeof appWorkspaceAttachRequestSchema>;

export const missionWorkspaceAttachedPayloadSchema = z.object({
  missionId: z.string(),
  workspace: appWorkspaceSchema,
});
export type MissionWorkspaceAttachedPayload = z.infer<typeof missionWorkspaceAttachedPayloadSchema>;

/**
 * attach 요청 → AppWorkspace(순수). 막 붙인 workspace는 preview 미시작이므로
 * truthStatus planned(실측 0). preview observed는 실제 포트 바인딩을 본 뒤(후속 preview
 * runner)에만 부여된다.
 */
export function buildAppWorkspace(
  request: AppWorkspaceAttachRequest,
  opts: { id: string; missionId: string; now: () => string },
): AppWorkspace {
  return {
    id: opts.id,
    missionId: opts.missionId,
    repoRootRef: request.repoRootRef,
    worktreeRef: request.worktreeRef,
    appType: request.appType,
    preview: { status: "not_started", truthStatus: "planned" },
    terminal: { runnerKind: request.runnerKind, mode: request.terminalMode },
    files: { changedCount: 0 },
    createdAt: opts.now(),
  };
}

// ── Preview (D4: probe-only) ─────────────────────────────────────────────────
// Dyad식 "바로 본다"의 정직한 1차: deterministic 포트 + 실제 포트 바인딩을 **관측**한
// 결과만 observed로 기록한다. dev 서버 spawn/lifecycle 관리는 후속(여기서는 관측만).

/**
 * workspace id로 결정되는 안정적 preview 포트(순수). 같은 워크스페이스는 항상 같은
 * 포트를 받는다(deterministic — Dyad의 deterministic preview ports에 대응).
 */
export function derivePreviewPort(workspaceId: string, opts: { base?: number; span?: number } = {}): number {
  const base = opts.base ?? 4400;
  const span = opts.span ?? 600;
  let hash = 0;
  for (let i = 0; i < workspaceId.length; i += 1) {
    hash = (hash * 31 + workspaceId.charCodeAt(i)) >>> 0;
  }
  return base + (hash % span);
}

export const previewProbeRequestSchema = z.object({
  host: z.string().max(255).default("127.0.0.1"),
  /** 미지정이면 derivePreviewPort(workspaceId) */
  port: z.number().int().min(1).max(65_535).optional(),
});
export type PreviewProbeRequest = z.infer<typeof previewProbeRequestSchema>;

/**
 * 포트 probe 결과 → workspace preview. **observed는 실제 바인딩을 관측했을 때만**.
 * 미바인딩은 failed/configured(시도했으나 서빙 안 함 — 가짜 running 금지).
 */
export function previewFromProbe(input: { bound: boolean; host: string; port: number }): AppWorkspacePreview {
  if (input.bound) {
    return { status: "running", port: input.port, url: `http://${input.host}:${input.port}`, truthStatus: "observed" };
  }
  return { status: "failed", port: input.port, truthStatus: "configured" };
}

export const missionWorkspacePreviewRecordedPayloadSchema = z.object({
  missionId: z.string(),
  workspaceId: z.string(),
  preview: appWorkspacePreviewSchema,
});
export type MissionWorkspacePreviewRecordedPayload = z.infer<typeof missionWorkspacePreviewRecordedPayloadSchema>;

// ── Preview start (D5a: 실제 dev 프로세스 → observed) ─────────────────────────

/** preview를 실제로 띄우는 요청. command 미지정이면 appType 기본값을 쓴다. */
export const previewStartRequestSchema = z.object({
  command: z.string().min(1).max(400).optional(),
  host: z.string().max(255).default("127.0.0.1"),
  port: z.number().int().min(1).max(65_535).optional(),
});
export type PreviewStartRequest = z.infer<typeof previewStartRequestSchema>;

/** appType별 기본 preview 명령(없으면 vite preview). 실제 실행은 서버 preview 정책 뒤. */
export function defaultPreviewCommandForAppType(appType: AppType): string {
  switch (appType) {
    case "nextjs":
      return "npm run preview";
    case "react_vite":
      return "vite preview";
    case "tauri":
    case "unknown":
    default:
      return "vite preview";
  }
}

/**
 * preview 상태 빌더(순수, 정직성 단일 지점). **running만 observed**. 실제 포트 관측
 * 없이는 절대 observed가 아니다.
 */
export function previewRunning(input: { host: string; port: number; command?: string }): AppWorkspacePreview {
  return { status: "running", port: input.port, url: `http://${input.host}:${input.port}`, command: input.command, truthStatus: "observed" };
}
export function previewFailed(input: { port?: number; command?: string; detail?: string }): AppWorkspacePreview {
  return { status: "failed", port: input.port, command: input.command, detail: input.detail, truthStatus: "configured" };
}
export function previewBlocked(input: { command?: string; detail: string }): AppWorkspacePreview {
  return { status: "blocked", command: input.command, detail: input.detail, truthStatus: "configured" };
}
export function previewStopped(input: { command?: string } = {}): AppWorkspacePreview {
  return { status: "stopped", command: input.command, truthStatus: "configured" };
}
