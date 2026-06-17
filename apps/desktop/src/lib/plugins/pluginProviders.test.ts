import { describe, expect, it } from "vitest";
import {
  projectPluginWorkItems,
  type PluginWorkItemLiteRow,
  type WorkItemLiteProviderResult,
} from "./pluginWorkItemSource";
import {
  projectPluginEvidenceCandidates,
  type PluginEvidence,
} from "./pluginEvidenceSource";

const row = (over: Partial<PluginWorkItemLiteRow> = {}): PluginWorkItemLiteRow => ({
  id: "r1",
  title: "example row",
  category: "runner",
  status: "observed",
  source: "plugin:example",
  createdAt: "2026-06-17T09:00:00.000Z",
  observed: true,
  pluginId: "example-plugin",
  sourceRef: "src-1",
  ...over,
});
const result = (over: Partial<WorkItemLiteProviderResult> = {}): WorkItemLiteProviderResult => ({
  pluginId: "example-plugin",
  status: "active",
  health: "connected",
  rows: [row()],
  ...over,
});

describe("Batch 14 — LINE B: WorkItemLite provider (read-only)", () => {
  it("provider rows become WorkItemLite rows carrying pluginId/sourceRef", () => {
    const rows = projectPluginWorkItems([result()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pluginId: "example-plugin", sourceRef: "src-1", category: "runner" });
  });

  it("skips rows missing pluginId/sourceRef; ignores disabled/error providers", () => {
    const r = result({ rows: [row(), row({ sourceRef: "" }), row({ pluginId: "" })] });
    expect(projectPluginWorkItems([r])).toHaveLength(1);
    expect(projectPluginWorkItems([result({ status: "disabled" })])).toHaveLength(0);
    expect(projectPluginWorkItems([result({ status: "error" })])).toHaveLength(0);
  });

  it("degrades unknown fields to safe defaults (no crash, honest observed)", () => {
    const r = result({ rows: [row({ category: "bogus" as never, observed: undefined as never, title: "" })] });
    const out = projectPluginWorkItems([r])[0]!;
    expect(out.category).toBe("unknown");
    expect(out.observed).toBe(false); // not asserted true → honest false
    expect(out.title).toBe("(untitled)");
  });
});

describe("Batch 14 — LINE C: evidence provider (never auto-trusted)", () => {
  const ev = (over: Partial<PluginEvidence> = {}): PluginEvidence => ({
    pluginId: "example-plugin",
    sourceRef: "ev-1",
    title: "generic evidence",
    trustHint: "limited",
    approvalState: "approved",
    ...over,
  });

  it("approved/published evidence → suggested, observed:false candidate", () => {
    const cands = projectPluginEvidenceCandidates([ev(), ev({ sourceRef: "ev-2", approvalState: "published" })]);
    expect(cands).toHaveLength(2);
    expect(cands[0]).toMatchObject({ status: "suggested", observed: false, pluginId: "example-plugin" });
  });

  it("draft/undefined evidence is not a candidate", () => {
    expect(projectPluginEvidenceCandidates([ev({ approvalState: "draft" })])).toHaveLength(0);
    expect(projectPluginEvidenceCandidates([ev({ approvalState: undefined })])).toHaveLength(0);
  });

  it("trust never escalates to trusted/active (untrusted clamps to limited)", () => {
    const cands = projectPluginEvidenceCandidates([
      ev({ trustHint: "untrusted" }),
      ev({ sourceRef: "ev-3", trustHint: "suggested" }),
    ]);
    expect(cands[0]!.trust).toBe("limited");
    expect(cands[1]!.trust).toBe("suggested");
    const blob = JSON.stringify(cands).toLowerCase();
    expect(blob.includes("trusted")).toBe(false);
    expect(blob.includes('"active"')).toBe(false);
  });

  it("skips invalid evidence (missing ref/title)", () => {
    expect(projectPluginEvidenceCandidates([ev({ sourceRef: "" }), ev({ title: "" })])).toHaveLength(0);
  });
});
