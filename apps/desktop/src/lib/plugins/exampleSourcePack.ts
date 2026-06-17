import type { PluginManifest } from "./pluginManifest";
import {
  projectPluginWorkItems,
  type PluginWorkItemLiteRow,
  type WorkItemLiteProviderResult,
} from "./pluginWorkItemSource";
import {
  projectPluginEvidenceCandidates,
  type PluginEvidence,
  type PluginEvidenceCandidate,
} from "./pluginEvidenceSource";

/**
 * Batch 23 LINE G — a generic example SOURCE PACK. Demonstrates how a bundled
 * source pack (declarative manifest + provider results + evidence) feeds the OS
 * Source Dock WITHOUT the OS depending on any domain. Static fixtures only:
 * no execution, no remote loading, no source sync. Generic names only.
 */
export type SourcePack = {
  manifest: PluginManifest;
  sources: ReadonlyArray<WorkItemLiteProviderResult>;
  evidence: ReadonlyArray<PluginEvidence>;
};

export const EXAMPLE_SOURCE_PACK: SourcePack = {
  manifest: {
    id: "example-pack",
    name: "Example Source Pack",
    version: "0.1.0",
    capabilities: ["inbox_source_provider", "workitem_lite_provider", "evidence_provider"],
    sourceKind: "static",
    enabled: true,
  },
  sources: [
    {
      pluginId: "example-pack",
      status: "active",
      health: "connected",
      generatedAt: "2026-06-18T10:00:00.000Z",
      rows: [
        {
          id: "example-pack:wi-1",
          title: "packed work item alpha",
          category: "project",
          status: "observed",
          source: "example-pack",
          createdAt: "2026-06-18T09:40:00.000Z",
          observed: true,
          pluginId: "example-pack",
          sourceRef: "source-001",
        },
        {
          id: "example-pack:wi-2",
          title: "entity-001 packed check",
          category: "runner",
          status: "pending",
          source: "example-pack",
          createdAt: "2026-06-18T09:20:00.000Z",
          observed: false,
          pluginId: "example-pack",
          sourceRef: "source-002",
        },
      ],
    },
  ],
  evidence: [
    {
      pluginId: "example-pack",
      sourceRef: "ev-1",
      title: "generic packed evidence",
      summary: "observed clean in the example pack",
      observedAt: "2026-06-18T09:00:00.000Z",
      trustHint: "limited",
      approvalState: "approved",
    },
  ],
};

export type SourcePackProjection = {
  manifest: PluginManifest;
  capabilities: ReadonlyArray<string>;
  sourceCount: number;
  rows: PluginWorkItemLiteRow[];
  evidence: PluginEvidenceCandidate[];
};

/**
 * Project a source pack into its read-only display parts: the manifest, capability
 * list, active provider rows, and evidence candidates. Pure (delegates to the pure
 * provider projections); no execution, no I/O, no Date.now.
 */
export function projectSourcePack(pack: SourcePack): SourcePackProjection {
  return {
    manifest: pack.manifest,
    capabilities: pack.manifest.capabilities,
    sourceCount: pack.sources.length,
    rows: projectPluginWorkItems(pack.sources),
    evidence: projectPluginEvidenceCandidates(pack.evidence),
  };
}
