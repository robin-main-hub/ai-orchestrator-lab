import { describe, expect, it } from "vitest";
import { SsotProviderAdapter } from "./ssotProvider";

describe("SsotProviderAdapter", () => {
  it("creates a consistent project SSOT snapshot with unique revision and content hash", async () => {
    const adapter = new SsotProviderAdapter({
      projectId: "project_test_001",
      providerKind: "markdown",
      sourceUrl: "file:///F:/obsidian/ai-headquarter/project_test_001",
    });

    const now = "2026-05-24T00:00:00.000Z";
    const snapshot = await adapter.createSnapshot(42, now);

    expect(snapshot.projectId).toBe("project_test_001");
    expect(snapshot.providerKind).toBe("markdown");
    expect(snapshot.itemCount).toBe(42);
    expect(snapshot.observedAt).toBe(now);
    expect(snapshot.id).toContain("ssot_snapshot_");
    expect(snapshot.contentHash).toContain("sha256_");
  });
});

// Characterization tests for the SSOT snapshot identity derivation (no behavior
// change, no network, no secret). These pin: determinism for identical inputs,
// the internal consistency of the three hash-derived fields (id/contentHash/
// revision all share one stableId), input sensitivity (itemCount, providerKind,
// and timestamp each perturb the hash), the undefined sourceUrl passthrough,
// and the default observedAt timestamp when `now` is omitted.
describe("ssotProvider — snapshot identity derivation characterization", () => {
  const baseConfig = {
    projectId: "project_test_001",
    providerKind: "markdown" as const,
    sourceUrl: "file:///obsidian/project_test_001",
  };
  const now = "2026-05-24T00:00:00.000Z";

  it("produces an identical snapshot identity for identical inputs", async () => {
    const adapter = new SsotProviderAdapter(baseConfig);

    const first = await adapter.createSnapshot(42, now);
    const second = await adapter.createSnapshot(42, now);

    expect(second.id).toBe(first.id);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.revision).toBe(first.revision);
  });

  it("keeps id, contentHash, and revision derived from one shared stable hash", async () => {
    const snapshot = await new SsotProviderAdapter(baseConfig).createSnapshot(7, now);

    const hashFromId = snapshot.id.replace("ssot_snapshot_", "");
    const hashFromContent = snapshot.contentHash.replace("sha256_", "");

    expect(hashFromContent).toBe(hashFromId);
    expect(snapshot.revision).toBe(`rev_${hashFromId.slice(0, 8)}`);
  });

  it("perturbs the hash when itemCount, providerKind, or timestamp changes", async () => {
    const adapter = new SsotProviderAdapter(baseConfig);
    const baseline = await adapter.createSnapshot(42, now);

    const byItemCount = await adapter.createSnapshot(43, now);
    const byTimestamp = await adapter.createSnapshot(42, "2026-05-24T00:00:01.000Z");
    const byProviderKind = await new SsotProviderAdapter({
      ...baseConfig,
      providerKind: "notion",
    }).createSnapshot(42, now);

    expect(byItemCount.contentHash).not.toBe(baseline.contentHash);
    expect(byTimestamp.contentHash).not.toBe(baseline.contentHash);
    expect(byProviderKind.contentHash).not.toBe(baseline.contentHash);
  });

  it("passes through an undefined sourceUrl when none is configured", async () => {
    const adapter = new SsotProviderAdapter({
      projectId: "project_test_002",
      providerKind: "markdown",
    });

    const snapshot = await adapter.createSnapshot(1, now);

    expect(snapshot.sourceUrl).toBeUndefined();
    expect(snapshot.id).toContain("ssot_snapshot_");
  });

  it("defaults observedAt to a current ISO timestamp when `now` is omitted", async () => {
    const snapshot = await new SsotProviderAdapter(baseConfig).createSnapshot(1);

    expect(snapshot.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(snapshot.id).toContain("ssot_snapshot_");
  });
});
