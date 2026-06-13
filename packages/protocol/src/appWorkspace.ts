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
  status: z.enum(["not_started", "starting", "running", "failed"]),
  port: z.number().int().optional(),
  url: z.string().optional(),
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
