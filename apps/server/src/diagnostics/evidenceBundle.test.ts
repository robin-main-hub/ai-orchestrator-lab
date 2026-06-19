import { describe, expect, it } from "vitest";
import type { ProviderRegistrySnapshot, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { projectEvidenceBundle, type EvidenceBundleInput } from "./evidenceBundle";

const FIXED_NOW = "2026-06-19T00:00:00.000Z";

function fakeProviderRegistry(): ProviderRegistrySnapshot {
  return {
    id: "provider_registry_test",
    authorityNodeId: "dgx-02",
    entries: [
      {
        providerProfileId: "provider_ready",
        name: "Ready",
        kind: "openai",
        trustLevel: "trusted",
        tags: ["healthy"],
        defaultModelIds: ["m"],
        supportsModelList: true,
        authMode: "none",
        secretAvailability: "available",
        // 시크릿-유사 값을 일부러 심어 누출 여부를 검증한다.
        secretRefPreview: "dgx-02:ANTHROPIC_API_KEY",
        secretSourceRefs: ["env:ANTHROPIC_API_KEY"],
        updatedAt: FIXED_NOW,
      },
      {
        providerProfileId: "provider_degraded",
        name: "Degraded",
        kind: "openai",
        trustLevel: "trusted",
        tags: ["discovery-degraded"],
        defaultModelIds: ["m"],
        supportsModelList: false,
        authMode: "api_key_required",
        secretAvailability: "missing",
        updatedAt: FIXED_NOW,
      },
    ],
    summary: { total: 2, ready: 1, missingSecrets: 1, dgxVaultBacked: 0, oauthSessions: 0, noAuth: 1 },
    rawSecretPersisted: false,
    createdAt: FIXED_NOW,
  };
}

function fakeRuntime(recentError?: string): RuntimeSnapshot {
  return {
    status: "degraded",
    dgxStatus: "online",
    localModelStatus: "offline",
    memorySyncStatus: "syncing",
    runtimeNodes: [],
    localModels: [],
    syncTopology: {
      authorityNodeId: "dgx-02",
      authorityLabel: "DGX-02",
      eventStoreMode: "dgx02_authoritative_with_client_cache",
      offlineWritePolicy: "append_local_outbox_when_offline",
      conflictPolicy: "dgx02_authority_wins",
      clients: [
        { id: "a", label: "A", kind: "server", status: "online", syncRole: "authority", localStore: "sqlite", outboxCount: 2, lastSeenAt: FIXED_NOW },
        { id: "b", label: "B", kind: "macbook", status: "online", syncRole: "cache_client", localStore: "sqlite", outboxCount: 3, lastSeenAt: FIXED_NOW },
      ],
    },
    activeProviderProfileId: undefined,
    recentError,
    updatedAt: FIXED_NOW,
  };
}

const baseGit = { sha: "abc1234", branch: "main", dirty: false };

describe("projectEvidenceBundle", () => {
  it("redacts secret-like strings in runtime error and CI notes", () => {
    const bundle = projectEvidenceBundle({
      now: FIXED_NOW,
      git: baseGit,
      runtime: fakeRuntime("auth failed for Bearer sk-livesecrettoken000000000000"),
      ciBaselineNotes: ["token leak: API_KEY=supersecretvalue123 in log"],
    });

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("sk-livesecrettoken");
    expect(serialized).not.toContain("supersecretvalue123");
    expect(serialized).toContain("<redacted>");
    expect(bundle.redaction.applied).toBe(true);
  });

  it("emits provider counts only and never leaks raw secret refs", () => {
    const bundle = projectEvidenceBundle({ now: FIXED_NOW, git: baseGit, providerRegistry: fakeProviderRegistry() });

    expect(bundle.providers).toEqual({ status: "collected", total: 2, ready: 1, notReady: 1, degraded: 1 });
    const serialized = JSON.stringify(bundle);
    // counts만 담아야 한다 — raw secret ref / source ref가 새면 안 된다.
    expect(serialized).not.toContain("ANTHROPIC_API_KEY");
    expect(serialized).not.toContain("provider_ready");
  });

  it("degrades honestly when optional inputs are absent", () => {
    const bundle = projectEvidenceBundle({ now: FIXED_NOW, git: baseGit });

    expect(bundle.tests).toEqual({ status: "not_run" });
    expect(bundle.providers).toEqual({ status: "unavailable" });
    expect(bundle.runtime).toEqual({ status: "unavailable" });
    expect(bundle.stream).toEqual({ status: "unavailable" });
    expect(bundle.outbox).toEqual({ status: "unavailable" });
    expect(bundle.ciBaselineNotes).toEqual([]);
  });

  it("derives outbox pending from runtime clients when no explicit sync result is given", () => {
    const bundle = projectEvidenceBundle({ now: FIXED_NOW, git: baseGit, runtime: fakeRuntime() });
    expect(bundle.outbox).toEqual({ status: "collected", pendingCount: 5, conflictCount: 0, source: "runtime" });
  });

  it("prefers explicit outbox/conflict counts over runtime-derived", () => {
    const bundle = projectEvidenceBundle({
      now: FIXED_NOW,
      git: baseGit,
      runtime: fakeRuntime(),
      outbox: { pendingCount: 1, conflictCount: 4 },
    });
    expect(bundle.outbox).toEqual({ status: "collected", pendingCount: 1, conflictCount: 4, source: "explicit" });
  });

  it("is deterministic and does not mutate its input", () => {
    const input: EvidenceBundleInput = {
      now: FIXED_NOW,
      git: baseGit,
      runtime: fakeRuntime("ok"),
      stream: { activeSessions: 4, degradedSessions: 1 },
      tests: { status: "passed", command: "pnpm test", passed: 10, failed: 0, total: 10 },
    };
    const frozen = JSON.stringify(input);
    const a = projectEvidenceBundle(input);
    const b = projectEvidenceBundle(input);

    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(FIXED_NOW);
    expect(a.stream).toEqual({ status: "collected", activeSessions: 4, degradedSessions: 1 });
    expect(a.tests).toEqual({ status: "passed", command: "pnpm test", passed: 10, failed: 0, total: 10 });
    // 입력 불변(read-only) 보장.
    expect(JSON.stringify(input)).toBe(frozen);
  });
});
