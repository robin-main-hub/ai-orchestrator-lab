/**
 * Read-only, redacted operational evidence bundle for bug-hunt handoffs.
 *
 * `projectEvidenceBundle` is a pure projection: it takes already-gathered
 * snapshots/metadata and produces a portable bundle that an operator can hand
 * off without leaking secrets or raw payloads. It performs NO network, NO fs,
 * NO mutation of its inputs. Every free-text field is passed through
 * `redactSecretsForLog`; provider/stream/outbox data is reduced to COUNTS only
 * (never raw keys, event payloads, or stream frames).
 */
import { redactSecretsForLog } from "@ai-orchestrator/providers";
import type { ProviderRegistrySnapshot, RuntimeSnapshot } from "@ai-orchestrator/protocol";

export type EvidenceBundleGit = {
  sha: string;
  branch: string;
  dirty: boolean;
};

export type EvidenceBundleTestResult =
  | { status: "not_run" }
  | { status: "passed" | "failed"; command: string; passed: number; failed: number; total: number };

export type EvidenceBundleStreamCounts = {
  activeSessions: number;
  degradedSessions: number;
};

export type EvidenceBundleOutboxCounts = {
  pendingCount: number;
  conflictCount: number;
};

export type EvidenceBundleInput = {
  now?: string;
  git: EvidenceBundleGit;
  tests?: EvidenceBundleTestResult;
  providerRegistry?: ProviderRegistrySnapshot;
  runtime?: RuntimeSnapshot;
  stream?: EvidenceBundleStreamCounts;
  outbox?: EvidenceBundleOutboxCounts;
  ciBaselineNotes?: string[];
};

export type EvidenceBundleProviders =
  | { status: "unavailable" }
  | { status: "collected"; total: number; ready: number; notReady: number; degraded: number };

export type EvidenceBundleRuntime =
  | { status: "unavailable" }
  | { status: "collected"; dgxStatus: string; memorySyncStatus: string; recentError?: string };

export type EvidenceBundleStream = { status: "unavailable" } | ({ status: "collected" } & EvidenceBundleStreamCounts);

export type EvidenceBundleOutbox =
  | { status: "unavailable" }
  | { status: "collected"; pendingCount: number; conflictCount: number; source: "explicit" | "runtime" };

export type EvidenceBundle = {
  kind: "ops_evidence_bundle";
  generatedAt: string;
  git: EvidenceBundleGit;
  tests: EvidenceBundleTestResult;
  providers: EvidenceBundleProviders;
  runtime: EvidenceBundleRuntime;
  stream: EvidenceBundleStream;
  outbox: EvidenceBundleOutbox;
  ciBaselineNotes: string[];
  redaction: { applied: true; helper: "redactSecretsForLog" };
};

const RECENT_ERROR_MAX = 240;

function projectProviders(snapshot: ProviderRegistrySnapshot | undefined): EvidenceBundleProviders {
  if (!snapshot) {
    return { status: "unavailable" };
  }
  const total = snapshot.summary.total;
  const ready = snapshot.summary.ready;
  // P4 격리 마커: discovery-degraded 태그가 붙은 entry = build 실패로 격리된 provider.
  const degraded = snapshot.entries.filter((entry) => entry.tags.includes("discovery-degraded")).length;
  return {
    status: "collected",
    total,
    ready,
    notReady: Math.max(0, total - ready),
    degraded,
  };
}

function projectRuntime(snapshot: RuntimeSnapshot | undefined): EvidenceBundleRuntime {
  if (!snapshot) {
    return { status: "unavailable" };
  }
  const recentError = snapshot.recentError
    ? redactSecretsForLog(snapshot.recentError).slice(0, RECENT_ERROR_MAX)
    : undefined;
  return {
    status: "collected",
    dgxStatus: snapshot.dgxStatus,
    memorySyncStatus: snapshot.memorySyncStatus,
    ...(recentError ? { recentError } : {}),
  };
}

function projectOutbox(
  explicit: EvidenceBundleOutboxCounts | undefined,
  runtime: RuntimeSnapshot | undefined,
): EvidenceBundleOutbox {
  if (explicit) {
    return {
      status: "collected",
      pendingCount: explicit.pendingCount,
      conflictCount: explicit.conflictCount,
      source: "explicit",
    };
  }
  if (runtime) {
    // 명시 event-sync 결과가 없으면 runtime client outbox 합으로 pending만 채운다.
    // conflict는 sync 결과가 있어야 알 수 있으므로 0으로 두고 source로 출처를 밝힌다.
    const pendingCount = runtime.syncTopology.clients.reduce((sum, client) => sum + client.outboxCount, 0);
    return { status: "collected", pendingCount, conflictCount: 0, source: "runtime" };
  }
  return { status: "unavailable" };
}

export function projectEvidenceBundle(input: EvidenceBundleInput): EvidenceBundle {
  const generatedAt = input.now ?? new Date().toISOString();
  const stream: EvidenceBundleStream = input.stream
    ? { status: "collected", activeSessions: input.stream.activeSessions, degradedSessions: input.stream.degradedSessions }
    : { status: "unavailable" };

  return {
    kind: "ops_evidence_bundle",
    generatedAt,
    git: { sha: input.git.sha, branch: input.git.branch, dirty: input.git.dirty },
    tests: input.tests ?? { status: "not_run" },
    providers: projectProviders(input.providerRegistry),
    runtime: projectRuntime(input.runtime),
    stream,
    outbox: projectOutbox(input.outbox, input.runtime),
    ciBaselineNotes: (input.ciBaselineNotes ?? []).map((note) => redactSecretsForLog(note)),
    redaction: { applied: true, helper: "redactSecretsForLog" },
  };
}
