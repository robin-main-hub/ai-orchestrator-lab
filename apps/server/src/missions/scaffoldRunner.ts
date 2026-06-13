import { dirname, join } from "node:path";
import {
  buildScaffoldPlan,
  scaffoldForTemplate,
  type ScaffoldApplyResult,
  type ScaffoldPlan,
} from "@ai-orchestrator/protocol";
import { isAllowedRepoRoot } from "./gitWorktreeMergeRunner.js";

/**
 * Scaffold runner (D7) — 템플릿 스캐폴드를 plan(쓰기 없음) → apply(approval/checkpoint 뒤
 * 실제 쓰기)로 적용한다.
 *
 * 정직성/안전:
 *   - repoRoot는 allowlist에 있어야 한다(없으면 blocked, 쓰기 0).
 *   - **기존 파일 overwrite는 grant된 approval일 때만**(approvedOverwrite). 아니면 blocked.
 *   - apply 전 checkpoint(주입형, best-effort) — 되돌릴 지점 확보.
 *   - 파일 IO는 전부 DI(fileExists/writeFile/mkdir) — 단위 테스트는 fs 없이.
 */

export type ScaffoldFileExists = (absPath: string) => Promise<boolean>;
export type ScaffoldWriteFile = (absPath: string, content: string) => Promise<void>;
export type ScaffoldMkdir = (absDir: string) => Promise<void>;

export async function planScaffold(input: {
  id: string;
  missionId: string;
  workspaceId: string;
  templateId: string;
  templateInput: Record<string, string | number>;
  repoRoot: string;
  allowedRepoRoots: ReadonlyArray<string>;
  fileExists: ScaffoldFileExists;
  now: () => string;
}): Promise<{ ok: true; plan: ScaffoldPlan } | { ok: false; reason: string }> {
  if (!isAllowedRepoRoot(input.repoRoot, input.allowedRepoRoots)) {
    return { ok: false, reason: `repoRoot '${input.repoRoot}'가 ORCHESTRATOR_ALLOWED_REPO_ROOTS에 없습니다` };
  }
  const scaffold = scaffoldForTemplate(input.templateId, input.templateInput);
  if (scaffold.length === 0) {
    return { ok: false, reason: `템플릿 '${input.templateId}'에 스캐폴드가 없습니다` };
  }
  const existingPaths = new Set<string>();
  for (const file of scaffold) {
    if (await input.fileExists(join(input.repoRoot, file.path))) existingPaths.add(file.path);
  }
  const plan = buildScaffoldPlan({
    id: input.id,
    missionId: input.missionId,
    workspaceId: input.workspaceId,
    templateId: input.templateId,
    templateInput: input.templateInput,
    repoRootRef: input.repoRoot,
    scaffold,
    existingPaths,
    now: input.now,
  });
  return { ok: true, plan };
}

export async function applyScaffold(input: {
  plan: ScaffoldPlan;
  allowedRepoRoots: ReadonlyArray<string>;
  /** overwrite가 있는 plan은 이게 true(=grant된 approval)일 때만 적용된다 */
  approvedOverwrite: boolean;
  writeFile: ScaffoldWriteFile;
  mkdir: ScaffoldMkdir;
  /** apply 전 checkpoint(best-effort) — sha 또는 undefined */
  checkpoint: () => Promise<string | undefined>;
  now: () => string;
}): Promise<ScaffoldApplyResult> {
  const appliedAt = input.now();
  const block = (reason: string): ScaffoldApplyResult => ({ status: "blocked", appliedPaths: [], reason, observed: true, appliedAt });

  if (!isAllowedRepoRoot(input.plan.repoRootRef, input.allowedRepoRoots)) {
    return block(`repoRoot '${input.plan.repoRootRef}'가 allowlist에 없습니다`);
  }
  if (input.plan.hasOverwrites && !input.approvedOverwrite) {
    return block("기존 파일 덮어쓰기에는 승인된 approvalId가 필요합니다 (자동 overwrite 금지)");
  }

  let checkpointSha: string | undefined;
  try {
    checkpointSha = await input.checkpoint();
  } catch {
    /* checkpoint best-effort */
  }

  const scaffold = scaffoldForTemplate(input.plan.templateId, input.plan.input);
  const byPath = new Map(scaffold.map((file) => [file.path, file.content]));
  const appliedPaths: string[] = [];
  try {
    for (const file of input.plan.files) {
      const content = byPath.get(file.path);
      if (content === undefined) continue;
      const abs = join(input.plan.repoRootRef, file.path);
      await input.mkdir(dirname(abs));
      await input.writeFile(abs, content);
      appliedPaths.push(file.path);
    }
  } catch (error) {
    return { status: "failed", appliedPaths, reason: `쓰기 오류: ${error instanceof Error ? error.message : String(error)}`, observed: true, appliedAt, checkpointSha };
  }
  return { status: "applied", appliedPaths, checkpointSha, reason: `${appliedPaths.length}개 파일 기록`, observed: true, appliedAt };
}
