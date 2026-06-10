import { isLorebook, type Lorebook } from "@ai-orchestrator/agents";

/**
 * Build-time bundle of the repo's lorebooks (lorebooks/*.json) for the
 * renderer, mirroring personaBundleSource. Invalid files are dropped (the
 * lorebook feature is optional — a broken book must never break a run).
 * Thin Vite glue; the engine itself lives in @ai-orchestrator/agents.
 */
const rawBundle = import.meta.glob("../../../../lorebooks/*.json", {
  import: "default",
  eager: true,
}) as Record<string, unknown>;

export const bundledLorebooks: Lorebook[] = Object.values(rawBundle).filter(isLorebook);

export const bundledLorebookTenants: string[] = [
  ...new Set(bundledLorebooks.map((book) => book.tenantId)),
].sort();
