import { describe, expect, it } from "vitest";
import { EXAMPLE_SOURCE_PACK, projectSourcePack } from "./exampleSourcePack";
import { validatePluginManifest, pluginHasCapability } from "./pluginManifest";

const FORBIDDEN = ["giolite", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("Batch 23 — example source pack", () => {
  it("the pack manifest is a valid, declarative, generic manifest", () => {
    const v = validatePluginManifest(EXAMPLE_SOURCE_PACK.manifest);
    expect(v.ok).toBe(true);
    expect(EXAMPLE_SOURCE_PACK.manifest.sourceKind).toBe("static"); // no remote loading
    expect(pluginHasCapability(EXAMPLE_SOURCE_PACK.manifest, "inbox_source_provider")).toBe(true);
  });

  it("projectSourcePack exposes manifest + capabilities + rows + evidence (pure)", () => {
    const p = projectSourcePack(EXAMPLE_SOURCE_PACK);
    expect(p.manifest.id).toBe("example-pack");
    expect(p.capabilities).toContain("workitem_lite_provider");
    expect(p.sourceCount).toBe(1);
    expect(p.rows.length).toBe(2); // active source → 2 projected rows
    expect(p.rows[0]).toMatchObject({ pluginId: "example-pack", sourceRef: "source-001" });
    expect(p.evidence.length).toBe(1); // approved → 1 suggested candidate
    expect(p.evidence[0]).toMatchObject({ status: "suggested", observed: false });
  });

  it("is deterministic and carries no domain vocabulary", () => {
    const a = JSON.stringify(projectSourcePack(EXAMPLE_SOURCE_PACK));
    const b = JSON.stringify(projectSourcePack(EXAMPLE_SOURCE_PACK));
    expect(a).toBe(b);
    const blob = a.toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
