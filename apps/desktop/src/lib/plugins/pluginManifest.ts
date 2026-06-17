/**
 * Batch 14 LINE A — generic plugin manifest protocol.
 *
 * The OS-core contract that ANY future domain plugin can depend on — never the
 * reverse. This module is GENERIC ONLY: no domain concepts, no domain names. A
 * manifest is DECLARATIVE — it describes what a plugin can provide;
 * it never imports, executes, loads remotely, or calls a network. Pure: no side
 * effect, no Date.now, no I/O.
 */

export type PluginCapability =
  | "evidence_provider"
  | "workitem_lite_provider"
  | "inbox_source_provider"
  | "memory_candidate_provider"
  | "command_provider"
  | "panel_provider";

export const PLUGIN_CAPABILITIES: ReadonlyArray<PluginCapability> = [
  "evidence_provider",
  "workitem_lite_provider",
  "inbox_source_provider",
  "memory_candidate_provider",
  "command_provider",
  "panel_provider",
];

/** How the plugin's data reaches the OS. "remote" is declared but NOT loaded yet. */
export type PluginSourceKind = "static" | "local" | "remote";
const SOURCE_KINDS: ReadonlyArray<PluginSourceKind> = ["static", "local", "remote"];

/** Display-only health of a plugin source (no execution implied). */
export type PluginSourceHealth = "connected" | "disabled" | "stale" | "error" | "unknown";

/** Resolved provider status (display/projection only). */
export type PluginProviderStatus = "active" | "disabled" | "error";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  capabilities: PluginCapability[];
  sourceKind: PluginSourceKind;
  enabled: boolean;
};

export type PluginManifestValidation =
  | { ok: true; manifest: PluginManifest; errors: [] }
  | { ok: false; errors: string[] };

/**
 * Validate a raw manifest. Structural + deterministic: unknown capabilities are
 * rejected, duplicate capabilities are de-duplicated (stable order), and the
 * required string/boolean fields must be present. No domain-term logic — the OS
 * core stays generic; domain plugins name themselves (e.g. "example-plugin").
 */
export function validatePluginManifest(raw: unknown): PluginManifestValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["manifest is not an object"] };
  const o = raw as Record<string, unknown>;

  const str = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim().length > 0);
  if (!str("id")) errors.push("id required");
  if (!str("name")) errors.push("name required");
  if (!str("version")) errors.push("version required");
  if (typeof o.enabled !== "boolean") errors.push("enabled must be boolean");
  if (typeof o.sourceKind !== "string" || !SOURCE_KINDS.includes(o.sourceKind as PluginSourceKind)) {
    errors.push("sourceKind invalid");
  }
  if (!Array.isArray(o.capabilities) || o.capabilities.length === 0) {
    errors.push("capabilities must be a non-empty array");
  } else {
    const unknown = o.capabilities.filter(
      (c) => !PLUGIN_CAPABILITIES.includes(c as PluginCapability),
    );
    if (unknown.length > 0) errors.push(`unknown capability: ${unknown.join(", ")}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  // de-dupe capabilities deterministically (keep declaration order of first seen)
  const seen = new Set<string>();
  const capabilities = (o.capabilities as PluginCapability[]).filter((c) =>
    seen.has(c) ? false : (seen.add(c), true),
  );

  return {
    ok: true,
    errors: [],
    manifest: {
      id: o.id as string,
      name: o.name as string,
      version: o.version as string,
      capabilities,
      sourceKind: o.sourceKind as PluginSourceKind,
      enabled: o.enabled as boolean,
    },
  };
}

/** A disabled plugin can never provide a live source. View/projection guard. */
export function canProvidePluginLive(manifest: PluginManifest): boolean {
  return manifest.enabled;
}

/** Does the manifest declare the given capability? */
export function pluginHasCapability(manifest: PluginManifest, cap: PluginCapability): boolean {
  return manifest.capabilities.includes(cap);
}
