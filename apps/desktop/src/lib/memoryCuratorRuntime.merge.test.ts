import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import {
  mergeMemoryRecordsWithCuratorLedger,
  writeMemoryCuratorCandidate,
} from "./memoryCuratorRuntime";
import { createMemoryCuratorCandidate } from "./memoryCuratorApproval";
import type { JsonStorageLike } from "./persistentJsonState";

// Characterization tests (no behavior change) for mergeMemoryRecordsWithCuratorLedger,
// the previously-unasserted export of memoryCuratorRuntime.ts. The existing
// memoryCuratorRuntime.test.ts drives getMemoryCuratorRecordsForScope (which this
// function composes) but never the merge itself.
//
// merge is the read-path overlay that splices curator-ledger records onto the
// live retrieval set for a scope. Its load-bearing contract:
//   - it SUPPLEMENTS, never overrides: a ledger record is added only when its id
//     is not already in the live `records` (live wins on id collision — no dupes),
//   - ledger-only records are PREPENDED, then the live records in original order,
//   - it surfaces only what getMemoryCuratorRecordsForScope would: scope-matched,
//     non-rejected, non-tombstoned, non-quarantined entries — so a forgotten or
//     quarantined record can NOT resurface through the overlay,
//   - an empty/foreign ledger returns the live records unchanged.

const createdAt = "2026-06-06T00:00:00.000Z";
const updatedAt = "2026-06-06T00:01:00.000Z";
const SCOPE = "agent_orchestrator::session_main::provider_mimo";

class MemoryStorage implements JsonStorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function record(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "title">): MemoryRecord {
  const { id, title, ...rest } = overrides;
  return {
    id,
    layer: "project_memory",
    scope: "project",
    kind: "decision",
    title,
    content: `${title} content`,
    sourceChannel: "desktop",
    trustLevel: "trusted",
    projectId: "project_ai_orchestrator_lab",
    activationState: "suggested",
    createdAt,
    pinned: false,
    ...rest,
  };
}

function seedLedger(storage: JsonStorageLike, rec: MemoryRecord, scopeKey = SCOPE): void {
  writeMemoryCuratorCandidate({
    candidate: createMemoryCuratorCandidate({ agentId: "agent_orchestrator", createdAt, reason: "test seed", record: rec }),
    scopeKey,
    storage,
    updatedAt,
  });
}

describe("mergeMemoryRecordsWithCuratorLedger", () => {
  it("prepends a ledger-only record onto the live set, live records unchanged", () => {
    const storage = new MemoryStorage();
    seedLedger(storage, record({ id: "ledger_only", title: "원장 전용 기억" }));

    const live = [record({ id: "live_1", title: "라이브 1" }), record({ id: "live_2", title: "라이브 2" })];
    const merged = mergeMemoryRecordsWithCuratorLedger(live, SCOPE, storage);

    expect(merged.map((r) => r.id)).toEqual(["ledger_only", "live_1", "live_2"]);
    // the live records pass through untouched (same references, same order)
    expect(merged.slice(1)).toEqual(live);
  });

  it("supplements without overriding: a ledger record whose id is already live is dropped (no dupes)", () => {
    const storage = new MemoryStorage();
    // ledger holds an older copy of live_1 plus a genuinely new record
    seedLedger(storage, record({ id: "live_1", title: "원장의 옛 live_1" }));
    seedLedger(storage, record({ id: "ledger_only", title: "원장 전용" }));

    const live = [record({ id: "live_1", title: "현재 live_1" })];
    const merged = mergeMemoryRecordsWithCuratorLedger(live, SCOPE, storage);

    // live_1 appears exactly once, and it is the LIVE copy (not the ledger's)
    expect(merged.filter((r) => r.id === "live_1")).toHaveLength(1);
    expect(merged.find((r) => r.id === "live_1")!.title).toBe("현재 live_1");
    expect(merged.map((r) => r.id)).toEqual(["ledger_only", "live_1"]);
  });

  it("never resurfaces a tombstoned or quarantined ledger record through the overlay", () => {
    const storage = new MemoryStorage();
    seedLedger(storage, record({ id: "forgotten", title: "삭제됨", tombstonedAt: updatedAt }));
    seedLedger(storage, record({ id: "quarantined", title: "격리됨", activationState: "quarantined" }));
    seedLedger(storage, record({ id: "visible", title: "표시됨" }));

    const merged = mergeMemoryRecordsWithCuratorLedger([], SCOPE, storage);
    expect(merged.map((r) => r.id)).toEqual(["visible"]);
  });

  it("ignores ledger records seeded under a different scope", () => {
    const storage = new MemoryStorage();
    seedLedger(storage, record({ id: "other_scope", title: "다른 방" }), "agent_architect::session_main::provider_mimo");

    const live = [record({ id: "live_1", title: "라이브 1" })];
    expect(mergeMemoryRecordsWithCuratorLedger(live, SCOPE, storage).map((r) => r.id)).toEqual(["live_1"]);
  });

  it("returns the live records unchanged when the ledger is empty", () => {
    const storage = new MemoryStorage();
    const live = [record({ id: "live_1", title: "라이브 1" }), record({ id: "live_2", title: "라이브 2" })];
    expect(mergeMemoryRecordsWithCuratorLedger(live, SCOPE, storage)).toEqual(live);
  });
});
