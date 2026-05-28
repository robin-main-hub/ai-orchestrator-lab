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
