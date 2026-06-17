import type { RunnerPatchHandoff } from "./runnerPatchHandoff";
import type { RunnerPatchSafetyReport } from "./runnerPatchSafety";
import type { RunnerPatchApprovalItem } from "./runnerPatchApprovalQueue";
import type {
  PatchCandidateInput,
  PatchFilePreview,
  PatchRisk,
  PatchSafetyStatus,
  PatchVerificationStatus,
} from "./plugins/patchCandidateSource";

/**
 * Batch 18 LINE A — pure mapper: H8 runner patch handoff → generic, read-only
 * PatchCandidateInput for the Assistant Inbox Patch Candidate lane.
 *
 * **Type-only imports only** — RunnerPatchHandoff / RunnerPatchSafetyReport are
 * imported with `import type`, so this module pulls in NO runner execution path at
 * runtime (no codingRunner, no apply/dispatch). The inbox surface
 * (patchCandidateSource.ts) still imports nothing from runner-land; this adapter
 * is the App-side bridge.
 *
 * Pure: no Date.now, no I/O, no fetch, no apply/commit/dispatch. Read-only.
 * Honest: missing safety report degrades to "warning" (never "pass"); observed is
 * true only when the handoff did not flag not_observed; raw diff text is NEVER
 * surfaced (hunkSummary is omitted — only counts/flags cross the boundary).
 */

function riskFor(additions: number, deletions: number): PatchRisk {
  const churn = additions + deletions;
  if (churn > 100) return "high";
  if (churn > 20) return "medium";
  return "low";
}

function mapFiles(handoff: RunnerPatchHandoff): PatchFilePreview[] {
  return handoff.files.map((f) => ({
    path: f.path,
    change: f.change,
    additions: f.additions,
    deletions: f.deletions,
    // NEVER surface raw diff (f.diff) — could contain secret-looking lines. Only a
    // size-derived risk badge crosses the boundary; hunkSummary stays omitted.
    risk: riskFor(f.additions, f.deletions),
  }));
}

function safetyStatusFor(
  handoff: RunnerPatchHandoff,
  safety: RunnerPatchSafetyReport | undefined,
): PatchSafetyStatus {
  if (handoff.blockers.length > 0) return "blocked";
  if (safety) {
    if (safety.status === "pass" && handoff.warnings.length > 0) return "warning";
    return safety.status;
  }
  // No safety report → cannot claim "pass". Degrade to warning (honest).
  return "warning";
}

function verificationStatusFor(
  handoff: RunnerPatchHandoff,
  safety: RunnerPatchSafetyReport | undefined,
): PatchVerificationStatus {
  const actual = safety?.verification.actualVerification.status;
  if (actual === "passed" || actual === "failed") return "actual";
  if (handoff.testResult.ran) return "claimed";
  return "not_run";
}

function safetyBlockers(
  handoff: RunnerPatchHandoff,
  safety: RunnerPatchSafetyReport | undefined,
): string[] {
  const out: string[] = [...handoff.blockers];
  if (safety?.secretScan.status === "blocked") out.push("secret_in_patch");
  if (safety?.pathPolicy.status === "blocked") out.push("path_policy_violation");
  return out;
}

function safetyWarnings(
  handoff: RunnerPatchHandoff,
  safety: RunnerPatchSafetyReport | undefined,
): string[] {
  const out: string[] = [...handoff.warnings];
  if (safety?.pathPolicy.status === "warning") out.push("path_policy_unset");
  if (safety?.verification.mismatch) out.push("verification_mismatch");
  return out;
}

/** Map one H8 handoff (+ optional safety report) → a read-only PatchCandidateInput. */
export function patchCandidateFromHandoff(
  handoff: RunnerPatchHandoff,
  safety?: RunnerPatchSafetyReport,
): PatchCandidateInput {
  const actual = safety?.verification.actualVerification;
  return {
    candidateId: handoff.id,
    runnerId: handoff.runnerId,
    missionId: handoff.missionId,
    createdAt: handoff.createdAt,
    changedFileCount: handoff.stats.files,
    additions: handoff.stats.additions,
    deletions: handoff.stats.deletions,
    safetyStatus: safetyStatusFor(handoff, safety),
    verificationStatus: verificationStatusFor(handoff, safety),
    source: "handoff",
    observed: !handoff.blockers.includes("not_observed"),
    files: mapFiles(handoff),
    safetyBlockers: safetyBlockers(handoff, safety),
    safetyWarnings: safetyWarnings(handoff, safety),
    secretFindingCount: safety?.secretScan.findings.length ?? 0,
    pathPolicyStatus: safety?.pathPolicy.status,
    claimedTests: {
      ran: handoff.testResult.ran,
      passed: handoff.testResult.passed,
      failed: handoff.testResult.failed,
    },
    actualTests: actual
      ? {
          status: actual.status === "passed" || actual.status === "failed" ? "actual" : "not_run",
          summary: actual.summary,
        }
      : undefined,
    evidenceRefs: [],
  };
}

/**
 * Map the runner-patch approval queue items → PatchCandidateInput[]. Each
 * RunnerPatchApprovalItem bundles a SafetyAnnotatedHandoff (handoff + safety), so
 * this is the live-queue → inbox bridge. Read-only; preserves blocked/warning.
 */
export function patchCandidatesFromApprovalItems(
  items: ReadonlyArray<RunnerPatchApprovalItem> = [],
): PatchCandidateInput[] {
  return items.map((item) => patchCandidateFromHandoff(item.handoff, item.handoff.safety));
}
