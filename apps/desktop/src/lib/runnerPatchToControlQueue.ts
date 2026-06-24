import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import type { RunnerPatchHandoff, PatchHandoffBlocker } from "./runnerPatchHandoff";

export const RUNNER_PATCH_SOURCE_ITEM_PREFIX = "runner_patch:";

export function runnerPatchBlockerSummary(blockers: PatchHandoffBlocker[], warnings: PatchHandoffBlocker[]): string {
  const parts: string[] = [];
  if (blockers.length > 0) {
    parts.push(`차단: ${blockers.join(", ")}`);
  }
  if (warnings.length > 0) {
    parts.push(`경고: ${warnings.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" / ") : "적용 가능";
}

/**
 * RunnerPatchHandoff → ApprovalQueueItem 변환 (순수).
 *
 * handoff가 곧바로 runner/dispatch로 이어지지 않고 control queue approval item으로 들어간다.
 * - state는 항상 "required" — 사람 승인 전에 적용 불가
 * - action은 "file_write" — 패치 적용 = 파일 변경
 * - permissions는 ["write_files"] — 파일 변경 권한
 * - commandPreview에 unified diff를 요약으로 실음 (전체 diff가 아닌 변경 파일 목록)
 * - runner dispatch는 이 함수에서 호출되지 않는다
 */
export function runnerPatchHandoffToApprovalQueueItem(handoff: RunnerPatchHandoff): ApprovalQueueItem {
  const fileNames = handoff.files.map((f) => f.path).slice(0, 8);
  const fileList = fileNames.length < handoff.files.length
    ? `${fileNames.join(", ")} 외 ${handoff.files.length - fileNames.length}개`
    : fileNames.join(", ");

  return {
    id: `approval_${handoff.id}`,
    sourceItemId: `${RUNNER_PATCH_SOURCE_ITEM_PREFIX}${handoff.id}`,
    summary: `패치 적용: ${handoff.stats.files}개 파일 (+${handoff.stats.additions}/−${handoff.stats.deletions}) — ${fileList}`,
    requestedBy: "agent",
    action: "file_write",
    reason: runnerPatchBlockerSummary(handoff.blockers, handoff.warnings),
    sourceTrust: "trusted",
    permissions: ["write_files"],
    state: "required",
    commandPreview: handoff.files.map((f) => `${f.change}: ${f.path} (+${f.additions}/−${f.deletions})`).join("\n"),
    createdAt: handoff.createdAt,
  };
}

/**
 * handoff를 control queue approval item으로 라우팅한다.
 *
 * 이 함수는 runner dispatch를 호출하지 않는다 — 승인 전 실행 금지.
 * 호출자가 반환된 item을 control queue에 enqueue한다.
 */
export function routeHandoffToControlQueue(
  handoff: RunnerPatchHandoff,
): ApprovalQueueItem {
  return runnerPatchHandoffToApprovalQueueItem(handoff);
}
