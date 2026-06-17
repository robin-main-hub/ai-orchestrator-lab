// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validatePluginManifest,
  canProvidePluginLive,
  pluginHasCapability,
  PLUGIN_CAPABILITIES,
  type PluginManifest,
} from "./pluginManifest";

const base = (over: Partial<PluginManifest> = {}): unknown => ({
  id: "example-plugin",
  name: "Example Plugin",
  version: "1.0.0",
  capabilities: ["workitem_lite_provider"],
  sourceKind: "static",
  enabled: true,
  ...over,
});

describe("Batch 14 — LINE A: plugin manifest protocol (generic, declarative)", () => {
  it("accepts a valid generic manifest", () => {
    const v = validatePluginManifest(base());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.manifest.id).toBe("example-plugin");
  });

  it("rejects unknown capabilities and missing required fields", () => {
    expect(validatePluginManifest(base({ capabilities: ["bogus_cap"] as never })).ok).toBe(false);
    expect(validatePluginManifest(base({ capabilities: [] })).ok).toBe(false);
    expect(validatePluginManifest(base({ id: "" })).ok).toBe(false);
    expect(validatePluginManifest(base({ sourceKind: "wormhole" as never })).ok).toBe(false);
    expect(validatePluginManifest({ nope: 1 }).ok).toBe(false);
  });

  it("de-duplicates capabilities deterministically", () => {
    const v = validatePluginManifest(
      base({ capabilities: ["evidence_provider", "evidence_provider", "command_provider"] }),
    );
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.manifest.capabilities).toEqual(["evidence_provider", "command_provider"]);
  });

  it("a disabled plugin cannot provide a live source", () => {
    const enabled = validatePluginManifest(base({ enabled: true }));
    const disabled = validatePluginManifest(base({ enabled: false }));
    if (enabled.ok) expect(canProvidePluginLive(enabled.manifest)).toBe(true);
    if (disabled.ok) expect(canProvidePluginLive(disabled.manifest)).toBe(false);
  });

  it("capability lookup works on a validated manifest", () => {
    const v = validatePluginManifest(base({ capabilities: ["evidence_provider"] }));
    if (v.ok) {
      expect(pluginHasCapability(v.manifest, "evidence_provider")).toBe(true);
      expect(pluginHasCapability(v.manifest, "panel_provider")).toBe(false);
    }
    expect(PLUGIN_CAPABILITIES).toContain("inbox_source_provider");
  });

  it("the OS-core plugin protocol contains no domain terms (caught by fixture)", () => {
    const rel = "src/lib/plugins/pluginManifest.ts";
    const path =
      [resolve(process.cwd(), rel), resolve(process.cwd(), "apps/desktop", rel)].find((p) =>
        existsSync(p),
      ) ?? resolve(process.cwd(), rel);
    const src = readFileSync(path, "utf8").toLowerCase();
    for (const banned of [
      "erp",
      "giolite",
      "gio",
      "customer",
      "sales",
      "quotation",
      "sample request",
      "buyer",
      "factory",
      "서흥",
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });
});
