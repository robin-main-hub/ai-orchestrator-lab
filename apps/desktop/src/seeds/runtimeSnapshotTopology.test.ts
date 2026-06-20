import { describe, expect, it } from "vitest";
import { runtimeSnapshot } from "./runtime";

// Characterization tests (no behavior change, pure, no I/O) for the seeded runtime
// snapshot's sync topology. runtimeSnapshot is 0-ref across the test tree, yet its
// syncTopology is the seed that encodes the OS's current authority model — the same
// DGX-02-data-authoritative-with-client-cache truth the A0 authority audit pinned.
// These invariants are load-bearing precisely because an authority flip must be a
// deliberate, overseer-gated change: pinning the seed here makes any silent flip in
// the authority node / conflict policy break a test instead of slipping through.
// We assert (a) the topology is internally self-consistent (exactly one authority
// client, linked to authorityNodeId and to a primary runtime node) and (b) the
// current authority-truth literals, as an explicit tripwire — NOT an endorsement.

const { syncTopology, runtimeNodes } = runtimeSnapshot;

describe("seeded runtime snapshot — sync authority topology", () => {
  it("names exactly one authority client, and it is the declared authorityNodeId (no split-brain)", () => {
    const authorities = syncTopology.clients.filter((client) => client.syncRole === "authority");
    expect(authorities).toHaveLength(1);
    const authority = authorities[0]!;
    expect(authority.id).toBe(syncTopology.authorityNodeId);
    expect(authority.label).toBe(syncTopology.authorityLabel);
  });

  it("backs the authority node with a primary runtime node of the same id", () => {
    const node = runtimeNodes.find((runtimeNode) => runtimeNode.id === syncTopology.authorityNodeId);
    expect(node).toBeDefined();
    expect(node!.isPrimary).toBe(true);
  });

  it("keeps client ids unique and gives every cache client a local sqlite cache + outbox", () => {
    const ids = syncTopology.clients.map((client) => client.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cacheClient of syncTopology.clients.filter((client) => client.syncRole === "cache_client")) {
      expect(cacheClient.localStore).toBe("sqlite");
      expect(cacheClient.outboxMode).toBe("offline_cache_outbox");
    }
  });

  it("pins the current DGX-data-authority truth as a flip tripwire (overseer-gated to change)", () => {
    expect(syncTopology.eventStoreMode).toBe("dgx02_authoritative_with_client_cache");
    expect(syncTopology.conflictPolicy).toBe("dgx02_authority_wins");
    expect(syncTopology.offlineWritePolicy).toBe("append_local_outbox_when_offline");
  });
});
