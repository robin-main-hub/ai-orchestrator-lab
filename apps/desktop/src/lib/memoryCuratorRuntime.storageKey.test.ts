import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import {
  memoryCuratorLedgerStorageKey,
  readMemoryCuratorLedger,
  writeMemoryCuratorCandidate,
} from "./memoryCuratorRuntime";
import { createMemoryCuratorCandidate } from "./memoryCuratorApproval";
import type { JsonStorageLike } from "./persistentJsonState";

// Characterization tests (no behavior change) for the one previously-unasserted export
// of memoryCuratorRuntime.ts: the `memoryCuratorLedgerStorageKey` persistence contract.
// The big sibling suite (memoryCuratorRuntime.test.ts) round-trips candidates through
// writeMemoryCuratorCandidate + readMemoryCuratorLedger against an in-memory storage,
// but it NEVER pins the literal key, and — more importantly — never proves the write
// path and the read path agree on the SAME key. That agreement is load-bearing: the
// key is versioned (`...v1`) and is the on-disk handle for every persisted curator
// decision, so a silent rename on either side (or a write/read mismatch) would orphan
// all approved/forgotten memories across a restart while every existing test stayed
// green (each uses one storage object, so a self-consistent wrong key still round-trips).
// We pin: the exact versioned key, that writes target exactly that key (and only it),
// and that reads are strictly scoped to that key (a value parked under any other key is
// invisible) — the value re-used here is captured from a real write, so nothing is
// hand-serialized.

class RecordingStorage implements JsonStorageLike {
  private readonly values = new Map<string, string>();
  readonly writeKeys: string[] = [];
  readonly readKeys: string[] = [];

  getItem(key: string) {
    this.readKeys.push(key);
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.writeKeys.push(key);
    this.values.set(key, value);
  }

  dump(key: string): string {
    const v = this.values.get(key);
    if (v === undefined) throw new Error(`no value stored under ${key}`);
    return v;
  }
}

const updatedAt = "2026-06-06T00:01:00.000Z";

function createRecord(): MemoryRecord {
  return {
    id: "memory_curator_key_probe",
    layer: "project_memory",
    scope: "project",
    kind: "decision",
    title: "key probe",
    content: "key probe content",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    projectId: "project_ai_orchestrator_lab",
    activationState: "suggested",
    createdAt: "2026-06-06T00:00:00.000Z",
    pinned: false,
  };
}

function createCandidate() {
  return createMemoryCuratorCandidate({
    agentId: "agent_orchestrator",
    createdAt: updatedAt,
    reason: "key probe",
    record: createRecord(),
  });
}

describe("memoryCuratorLedgerStorageKey — persistence key contract", () => {
  it("is the exact versioned ledger key", () => {
    expect(memoryCuratorLedgerStorageKey).toBe("ai-orchestrator.memory-curator-ledger.v1");
    // versioned suffix is intentional — a bump must be a deliberate migration, not a typo
    expect(memoryCuratorLedgerStorageKey).toMatch(/\.v\d+$/);
  });

  it("writeMemoryCuratorCandidate persists under exactly that key and no other", () => {
    const storage = new RecordingStorage();
    writeMemoryCuratorCandidate({
      candidate: createCandidate(),
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage,
      updatedAt,
    });
    // the only thing written is the curator ledger, under the canonical key
    expect(storage.writeKeys).toEqual([memoryCuratorLedgerStorageKey]);
  });

  it("read and write agree on the key, and reads are strictly key-scoped", () => {
    // capture a real serialized ledger from the write path (no hand-built JSON)
    const writer = new RecordingStorage();
    writeMemoryCuratorCandidate({
      candidate: createCandidate(),
      scopeKey: "agent_orchestrator::session_main::provider_mimo",
      storage: writer,
      updatedAt,
    });
    const writtenKey = writer.writeKeys[0]!;
    const writtenValue = writer.dump(writtenKey);
    expect(writtenKey).toBe(memoryCuratorLedgerStorageKey);

    // same key → the read path recovers the entry, and it read from that same key
    const sameKey = new RecordingStorage();
    sameKey.setItem(writtenKey, writtenValue);
    expect(readMemoryCuratorLedger(sameKey)).toHaveLength(1);
    expect(sameKey.readKeys).toContain(memoryCuratorLedgerStorageKey);

    // identical value parked under a different key is invisible — reads are key-scoped,
    // so a write/read key mismatch would silently lose every persisted decision
    const otherKey = new RecordingStorage();
    otherKey.setItem(`${writtenKey}.shadow`, writtenValue);
    expect(readMemoryCuratorLedger(otherKey)).toEqual([]);
  });
});
