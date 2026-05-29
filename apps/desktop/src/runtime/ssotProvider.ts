import type { SsotProviderKind, SsotSnapshot } from "@ai-orchestrator/protocol";

export type SsotProviderConfig = {
  projectId: string;
  providerKind: SsotProviderKind;
  sourceUrl?: string;
};

export class SsotProviderAdapter {
  constructor(private readonly config: SsotProviderConfig) {}

  async createSnapshot(itemCount: number, now = new Date().toISOString()): Promise<SsotSnapshot> {
    const rawData = `${this.config.projectId}:${this.config.providerKind}:${itemCount}:${now}`;
    const hash = stableId(rawData);

    return {
      id: `ssot_snapshot_${hash}`,
      projectId: this.config.projectId,
      providerKind: this.config.providerKind,
      sourceUrl: this.config.sourceUrl,
      contentHash: `sha256_${hash}`,
      revision: `rev_${hash.slice(0, 8)}`,
      observedAt: now,
      itemCount,
    };
  }
}

function stableId(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
