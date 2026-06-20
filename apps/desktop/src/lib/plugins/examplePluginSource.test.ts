import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PLUGIN_EVIDENCE,
  EXAMPLE_PLUGIN_SOURCES,
  EXAMPLE_SOURCE_SCENARIOS,
  SOURCE_SCENARIO_KEYS,
} from "./examplePluginSource";
import { projectPluginWorkItems, type WorkItemLiteProviderResult } from "./pluginWorkItemSource";

// Characterization tests (no behavior change, pure, no execution/import/network)
// for the PREVIEW-only example plugin deck. The fixtures themselves are 0-ref in
// tests — pluginProviders.test.ts exercises projectPluginWorkItems with its own
// synthetic rows, never these EXAMPLE_* exports — so the scenario-map wiring and
// the static fixtures' projection behavior are unpinned. These fixtures gate what
// the PREVIEW Source Dock shows, so their invariants are load-bearing:
//   1. SOURCE_SCENARIO_KEYS must exactly index EXAMPLE_SOURCE_SCENARIOS (a missing
//      key would render a blank dock; an orphan map entry would be unreachable).
//   2. Projection is gated by status === "active" ONLY — health (stale/connected)
//      never gates, and non-active (error/disabled) providers contribute nothing.
//   3. Evidence titles stay free of action words even when approvalState is
//      "approved", so the read-only surface stays honest (the module's own rule).
// We verify projection via the real projectPluginWorkItems and derive the expected
// row count from the fixtures themselves (self-consistent, no magic numbers).

// expected projected-row count = rows of ACTIVE providers that carry id refs.
function expectedActiveRows(sources: ReadonlyArray<WorkItemLiteProviderResult>): number {
  return sources
    .filter((s) => s.status === "active")
    .flatMap((s) => s.rows)
    .filter((r) => r.pluginId.trim().length > 0 && r.sourceRef.trim().length > 0).length;
}

describe("examplePluginSource — preview scenario deck", () => {
  it("scenario keys exactly index the scenario map (no orphan or missing scenario)", () => {
    expect([...SOURCE_SCENARIO_KEYS].sort()).toEqual(Object.keys(EXAMPLE_SOURCE_SCENARIOS).sort());
    for (const key of SOURCE_SCENARIO_KEYS) {
      const scenario = EXAMPLE_SOURCE_SCENARIOS[key];
      expect(scenario).toBeDefined();
      expect(Array.isArray(scenario.sources)).toBe(true);
      expect(Array.isArray(scenario.evidence)).toBe(true);
    }
  });

  it("projects every scenario by status === active only, matching the fixtures' own active-row count", () => {
    for (const key of SOURCE_SCENARIO_KEYS) {
      const { sources } = EXAMPLE_SOURCE_SCENARIOS[key];
      const projected = projectPluginWorkItems(sources);
      expect(projected).toHaveLength(expectedActiveRows(sources));
      // every projected row keeps its plugin id refs (the provider contract).
      for (const row of projected) {
        expect(row.pluginId.trim().length).toBeGreaterThan(0);
        expect(row.sourceRef.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("drops the disabled plugin's row from the mixed deck (never surfaces 'should not appear')", () => {
    // mixed reuses the Batch 14 fixture: example-plugin(active,2) + external-source(active,1) + disabled-plugin(disabled,1).
    const projected = projectPluginWorkItems(EXAMPLE_PLUGIN_SOURCES);
    expect(projected).toHaveLength(3);
    expect(projected.some((r) => r.title === "should not appear")).toBe(false);
    expect(projected.some((r) => r.pluginId === "disabled-plugin")).toBe(false);
  });

  it("treats health as cosmetic — stale still projects, error/disabled never do", () => {
    // stale: provider is active+stale → its row still projects.
    expect(projectPluginWorkItems(EXAMPLE_SOURCE_SCENARIOS.stale.sources)).toHaveLength(1);
    // error/disabled: non-active status → no rows, regardless of the rows present.
    expect(projectPluginWorkItems(EXAMPLE_SOURCE_SCENARIOS.error.sources)).toHaveLength(0);
    expect(projectPluginWorkItems(EXAMPLE_SOURCE_SCENARIOS.disabled.sources)).toHaveLength(0);
    // healthy: all providers active → all rows project.
    expect(projectPluginWorkItems(EXAMPLE_SOURCE_SCENARIOS.healthy.sources)).toHaveLength(3);
  });

  it("keeps evidence titles free of action words even when approvalState is approved", () => {
    expect(EXAMPLE_PLUGIN_EVIDENCE.length).toBeGreaterThan(0);
    // at least one approved entry exists, so this is a real test of the honesty rule.
    expect(EXAMPLE_PLUGIN_EVIDENCE.some((e) => e.approvalState === "approved")).toBe(true);
    for (const evidence of EXAMPLE_PLUGIN_EVIDENCE) {
      expect(evidence.title).not.toMatch(/approve|enable/i);
    }
  });

  it("wires evidence per scenario: mixed reuses the deck, healthy keeps only the first, others carry none", () => {
    // reference identity — mixed must keep the Batch 14 evidence deck intact.
    expect(EXAMPLE_SOURCE_SCENARIOS.mixed.evidence).toBe(EXAMPLE_PLUGIN_EVIDENCE);
    expect(EXAMPLE_SOURCE_SCENARIOS.healthy.evidence).toEqual([EXAMPLE_PLUGIN_EVIDENCE[0]]);
    expect(EXAMPLE_SOURCE_SCENARIOS.stale.evidence).toEqual([]);
    expect(EXAMPLE_SOURCE_SCENARIOS.error.evidence).toEqual([]);
    expect(EXAMPLE_SOURCE_SCENARIOS.disabled.evidence).toEqual([]);
  });
});
