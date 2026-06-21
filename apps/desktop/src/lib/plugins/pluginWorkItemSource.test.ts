import { describe, expect, it } from "vitest";
import {
  projectPluginWorkItems,
  type PluginWorkItemLiteRow,
  type WorkItemLiteProviderResult,
} from "./pluginWorkItemSource";

// projectPluginWorkItems is the generic-OS plugin seam that lets a plugin feed
// READ-ONLY WorkItem-lite rows into the Assistant Inbox. It was never
// characterized. Four authority facts make it safe: (1) STATUS GATE — only
// providers whose status is exactly "active" contribute; a "disabled"/"error"
// provider contributes nothing even when it carries rows (a degraded plugin can't
// smuggle live rows in). (2) DENY-BY-DEFAULT ATTRIBUTION — a row is dropped
// unless it names BOTH a non-blank pluginId AND sourceRef; an unattributed row
// never reaches the inbox. (3) DEGRADE-NOT-CRASH NORMALIZATION — missing/loose
// fields fall back to deterministic placeholders (id→`pluginId:sourceRef`,
// title→"(untitled)", unknown category→"unknown", status→"unknown",
// source→`plugin:pluginId`, createdAt→"") instead of throwing. (4) OBSERVED
// HONESTY — `observed` is true ONLY when the plugin asserts the literal `true`;
// any other (truthy-but-not-true) value reads as not-observed, so a plugin can't
// dress a record up as an observed fact. Pure: no Date.now / I/O — fixtures are
// self-consistent (placeholders derived from each row's own pluginId/sourceRef).

function row(over: Partial<PluginWorkItemLiteRow> & { pluginId: string; sourceRef: string }): PluginWorkItemLiteRow {
  return {
    id: "wi1",
    title: "do the thing",
    category: "failure",
    status: "observed",
    source: "events.failure",
    createdAt: "2026-06-21T00:00:00.000Z",
    observed: true,
    ...over,
  };
}

function provider(over: Partial<WorkItemLiteProviderResult> & { pluginId: string }): WorkItemLiteProviderResult {
  return {
    status: "active",
    health: "connected",
    rows: [],
    ...over,
  };
}

describe("projectPluginWorkItems — status gate + deny-by-default attribution (read-only inbox seam)", () => {
  it("only ACTIVE providers contribute — disabled/error providers add nothing even with rows", () => {
    const live = provider({ pluginId: "p_live", status: "active", rows: [row({ pluginId: "p_live", sourceRef: "s1" })] });
    const off = provider({ pluginId: "p_off", status: "disabled", rows: [row({ pluginId: "p_off", sourceRef: "s2" })] });
    const broken = provider({ pluginId: "p_err", status: "error", rows: [row({ pluginId: "p_err", sourceRef: "s3" })] });

    const out = projectPluginWorkItems([live, off, broken]);
    expect(out).toHaveLength(1);
    expect(out[0]!.pluginId).toBe("p_live"); // disabled/error rows never reach the inbox
  });

  it("drops rows missing a non-blank pluginId or sourceRef — unattributed rows are denied", () => {
    const p = provider({
      pluginId: "p1",
      rows: [
        row({ pluginId: "p1", sourceRef: "ok" }), // kept
        row({ pluginId: "  ", sourceRef: "ref" }), // blank pluginId → dropped
        row({ pluginId: "p1", sourceRef: "" }), // empty sourceRef → dropped
      ],
    });
    const out = projectPluginWorkItems([p]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceRef).toBe("ok");
  });

  it("defaults to [] when no providers are passed (no fabricated live data)", () => {
    expect(projectPluginWorkItems()).toEqual([]);
  });
});

describe("projectPluginWorkItems — degrade-not-crash normalization + observed honesty", () => {
  it("coerces loose/missing fields to deterministic placeholders instead of throwing", () => {
    const loose = {
      id: "",
      title: "",
      category: "bogus", // not in CATS → "unknown"
      status: "",
      source: "",
      createdAt: 12345, // wrong type → ""
      observed: true,
      pluginId: "px",
      sourceRef: "ref9",
    } as unknown as PluginWorkItemLiteRow;

    const [out] = projectPluginWorkItems([provider({ pluginId: "px", rows: [loose] })]);
    expect(out).toEqual({
      id: "px:ref9", // missing id → `${pluginId}:${sourceRef}`
      title: "(untitled)",
      category: "unknown", // unknown category degraded, not crashed
      status: "unknown",
      source: "plugin:px",
      createdAt: "", // non-string createdAt normalized to empty
      observed: true,
      pluginId: "px",
      sourceRef: "ref9",
    });
  });

  it("keeps a valid category untouched", () => {
    const [out] = projectPluginWorkItems([
      provider({ pluginId: "pc", rows: [row({ pluginId: "pc", sourceRef: "r", category: "runner" })] }),
    ]);
    expect(out!.category).toBe("runner"); // a known EVENT_CATEGORIES value passes through
  });

  it("observed is true ONLY for the literal true — any other value reads as not-observed", () => {
    const truthyNotTrue = row({ pluginId: "p", sourceRef: "a", observed: "yes" as unknown as boolean });
    const absent = { ...row({ pluginId: "p", sourceRef: "b" }) } as Record<string, unknown>;
    delete absent.observed;

    const out = projectPluginWorkItems([
      provider({ pluginId: "p", rows: [row({ pluginId: "p", sourceRef: "t", observed: true }), truthyNotTrue, absent as unknown as PluginWorkItemLiteRow] }),
    ]);
    expect(out.map((r) => r.observed)).toEqual([true, false, false]); // no record dressed up as an observed fact
  });
});
