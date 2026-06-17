import type { WorkItemLiteProviderResult } from "./pluginWorkItemSource";
import type { PluginEvidence } from "./pluginEvidenceSource";

/**
 * Batch 14 LINE D — GENERIC example plugin source results, used by the PREVIEW
 * seat (clearly example/fixture, never live) and by tests. No domain concepts,
 * no domain names — example-plugin / external-source / source-00x / entity-001.
 * Static data only: no execution, no import, no network.
 */
export const EXAMPLE_PLUGIN_SOURCES: ReadonlyArray<WorkItemLiteProviderResult> = [
  {
    pluginId: "example-plugin",
    status: "active",
    health: "connected",
    generatedAt: "2026-06-17T10:00:00.000Z",
    rows: [
      {
        id: "example-plugin:wi-1",
        title: "external work item alpha",
        category: "project",
        status: "observed",
        source: "example-source",
        createdAt: "2026-06-17T09:30:00.000Z",
        observed: true,
        pluginId: "example-plugin",
        sourceRef: "source-001",
      },
      {
        id: "example-plugin:wi-2",
        title: "entity-001 readiness check",
        category: "runner",
        status: "pending",
        source: "example-source",
        createdAt: "2026-06-17T08:30:00.000Z",
        observed: false,
        pluginId: "example-plugin",
        sourceRef: "source-002",
      },
    ],
  },
  {
    pluginId: "external-source",
    status: "active",
    health: "stale",
    generatedAt: "2026-06-16T10:00:00.000Z",
    rows: [
      {
        id: "external-source:wi-1",
        title: "external memo entity-002",
        category: "memory",
        status: "observed",
        source: "external-source",
        createdAt: "2026-06-16T09:00:00.000Z",
        observed: false,
        pluginId: "external-source",
        sourceRef: "source-010",
      },
    ],
  },
  {
    pluginId: "disabled-plugin",
    status: "disabled",
    health: "disabled",
    rows: [
      {
        id: "disabled-plugin:wi-1",
        title: "should not appear",
        category: "system",
        status: "observed",
        source: "disabled-plugin",
        createdAt: "2026-06-17T00:00:00.000Z",
        observed: false,
        pluginId: "disabled-plugin",
        sourceRef: "source-099",
      },
    ],
  },
];

export const EXAMPLE_PLUGIN_EVIDENCE: ReadonlyArray<PluginEvidence> = [
  {
    pluginId: "example-plugin",
    sourceRef: "ev-1",
    // Title is RENDERED text — keep it free of action words ("approve"/"enable")
    // so the read-only surface stays honest; the approvalState below is data only.
    title: "generic verified evidence",
    summary: "observed clean on example-source",
    observedAt: "2026-06-17T09:00:00.000Z",
    trustHint: "limited",
    approvalState: "approved",
  },
  {
    pluginId: "example-plugin",
    sourceRef: "ev-2",
    title: "draft evidence (not promoted)",
    trustHint: "untrusted",
    approvalState: "draft",
  },
];

/**
 * Batch 15 LINE C — PREVIEW-only demo deck. Generic example scenarios that let
 * the operator flip the Source Dock between external-source health states purely
 * in PREVIEW. Static fixtures only — no execution, no import, no network — and
 * NEVER routed into the LIVE seat (the container gates this on mode === preview).
 */
export type SourceScenarioKey = "mixed" | "healthy" | "stale" | "error" | "disabled";

export const SOURCE_SCENARIO_KEYS: ReadonlyArray<SourceScenarioKey> = [
  "mixed",
  "healthy",
  "stale",
  "error",
  "disabled",
];

const HEALTHY_SOURCES: ReadonlyArray<WorkItemLiteProviderResult> = [
  {
    pluginId: "example-plugin",
    status: "active",
    health: "connected",
    generatedAt: "2026-06-18T10:00:00.000Z",
    rows: [
      {
        id: "example-plugin:wi-1",
        title: "external work item alpha",
        category: "project",
        status: "observed",
        source: "example-source",
        createdAt: "2026-06-18T09:30:00.000Z",
        observed: true,
        pluginId: "example-plugin",
        sourceRef: "source-001",
      },
      {
        id: "example-plugin:wi-2",
        title: "external work item beta",
        category: "runner",
        status: "observed",
        source: "example-source",
        createdAt: "2026-06-18T09:10:00.000Z",
        observed: true,
        pluginId: "example-plugin",
        sourceRef: "source-002",
      },
    ],
  },
  {
    pluginId: "source-001",
    status: "active",
    health: "connected",
    generatedAt: "2026-06-18T10:00:00.000Z",
    rows: [
      {
        id: "source-001:wi-1",
        title: "entity-001 readiness check",
        category: "system",
        status: "observed",
        source: "source-001",
        createdAt: "2026-06-18T09:00:00.000Z",
        observed: true,
        pluginId: "source-001",
        sourceRef: "source-005",
      },
    ],
  },
];

const STALE_SOURCES: ReadonlyArray<WorkItemLiteProviderResult> = [
  {
    pluginId: "external-source",
    status: "active",
    health: "stale",
    generatedAt: "2026-06-16T10:00:00.000Z",
    rows: [
      {
        id: "external-source:wi-1",
        title: "external memo entity-002",
        category: "memory",
        status: "observed",
        source: "external-source",
        createdAt: "2026-06-16T09:00:00.000Z",
        observed: false,
        pluginId: "external-source",
        sourceRef: "source-010",
      },
    ],
  },
];

const ERROR_SOURCES: ReadonlyArray<WorkItemLiteProviderResult> = [
  {
    pluginId: "external-source",
    status: "error",
    health: "error",
    generatedAt: "2026-06-18T10:00:00.000Z",
    // status !== active → rows are not projected; demos the error tone + honest "no rows".
    rows: [
      {
        id: "external-source:wi-err",
        title: "unreachable external row",
        category: "system",
        status: "unknown",
        source: "external-source",
        createdAt: "2026-06-18T09:00:00.000Z",
        observed: false,
        pluginId: "external-source",
        sourceRef: "source-020",
      },
    ],
  },
];

const DISABLED_SOURCES: ReadonlyArray<WorkItemLiteProviderResult> = [
  {
    pluginId: "disabled-plugin",
    status: "disabled",
    health: "disabled",
    rows: [
      {
        id: "disabled-plugin:wi-1",
        title: "should not appear",
        category: "system",
        status: "observed",
        source: "disabled-plugin",
        createdAt: "2026-06-18T00:00:00.000Z",
        observed: false,
        pluginId: "disabled-plugin",
        sourceRef: "source-099",
      },
    ],
  },
];

export const EXAMPLE_SOURCE_SCENARIOS: Record<
  SourceScenarioKey,
  { sources: ReadonlyArray<WorkItemLiteProviderResult>; evidence: ReadonlyArray<PluginEvidence> }
> = {
  // mixed = the Batch 14 fixture (connected + stale + disabled) — keep intact.
  mixed: { sources: EXAMPLE_PLUGIN_SOURCES, evidence: EXAMPLE_PLUGIN_EVIDENCE },
  healthy: { sources: HEALTHY_SOURCES, evidence: [EXAMPLE_PLUGIN_EVIDENCE[0]!] },
  stale: { sources: STALE_SOURCES, evidence: [] },
  error: { sources: ERROR_SOURCES, evidence: [] },
  disabled: { sources: DISABLED_SOURCES, evidence: [] },
};
