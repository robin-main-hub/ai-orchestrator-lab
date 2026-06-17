import type { WorkItemLite } from "../workItemLite";
import { EVENT_CATEGORIES, type EventCategory } from "../eventClassification";
import type { PluginProviderStatus, PluginSourceHealth } from "./pluginManifest";

/**
 * Batch 14 LINE B — generic WorkItemLite provider contract. A plugin may supply
 * READ-ONLY WorkItem-lite rows to the Assistant Inbox. No WorkItem creation, no
 * EventStorage append, no DB/server write, no action controls. Every row must
 * carry pluginId + sourceRef; unknown/missing fields degrade to "unknown"
 * rather than crash. Pure: no side effect / Date.now / I/O. Generic only.
 */
export type PluginWorkItemLiteRow = WorkItemLite & {
  pluginId: string;
  sourceRef: string;
};

export type WorkItemLiteProviderResult = {
  pluginId: string;
  status: PluginProviderStatus;
  health: PluginSourceHealth;
  generatedAt?: string;
  rows: ReadonlyArray<PluginWorkItemLiteRow>;
};

const CATS: ReadonlyArray<string> = ["all", ...EVENT_CATEGORIES, "unknown"];

function hasRef(row: { pluginId?: unknown; sourceRef?: unknown }): boolean {
  return (
    typeof row.pluginId === "string" &&
    row.pluginId.trim().length > 0 &&
    typeof row.sourceRef === "string" &&
    row.sourceRef.trim().length > 0
  );
}

/** Coerce a possibly-loose provider row into a safe WorkItemLite row. */
function normalize(row: PluginWorkItemLiteRow): PluginWorkItemLiteRow {
  const category = CATS.includes(row.category) ? row.category : ("unknown" as EventCategory);
  return {
    id: typeof row.id === "string" && row.id.length > 0 ? row.id : `${row.pluginId}:${row.sourceRef}`,
    title: typeof row.title === "string" && row.title.length > 0 ? row.title : "(untitled)",
    category,
    status: typeof row.status === "string" && row.status.length > 0 ? row.status : "unknown",
    source: typeof row.source === "string" && row.source.length > 0 ? row.source : `plugin:${row.pluginId}`,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    observed: row.observed === true, // honest: only true when the plugin asserts it
    pluginId: row.pluginId,
    sourceRef: row.sourceRef,
  };
}

/**
 * Project plugin provider results into read-only WorkItemLite rows. Only ACTIVE
 * providers contribute (disabled/error → nothing); rows without pluginId/sourceRef
 * are skipped; fields are normalized. Never fabricates live data.
 */
export function projectPluginWorkItems(
  results: ReadonlyArray<WorkItemLiteProviderResult> = [],
): PluginWorkItemLiteRow[] {
  return results
    .filter((r) => r.status === "active")
    .flatMap((r) => r.rows.filter(hasRef).map(normalize));
}
