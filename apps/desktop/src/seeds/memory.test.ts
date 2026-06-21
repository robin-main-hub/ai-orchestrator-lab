import { describe, expect, it } from "vitest";
import { memoryRecordSchema, sourceTrustSchema } from "@ai-orchestrator/protocol";
import { initialMemoryRecords } from "./memory";

// initialMemoryRecords is the long-term memory the desktop OS boots with — the
// seeded MemoryRecords the stage6 inspector / stage27 memory API / stage7 backup all
// read at startup. Those runtime suites consume createSeedMemoryRecords() as a
// behavior FIXTURE (pinning, trust enforcement, backup projection) but never
// runtime-validate the seed against memoryRecordSchema, so a seeded record could
// typecheck and still be a malformed memory (the refinements the inferred type cannot
// express — the sourceChannel/trustLevel vocabularies, the importance [0,1] bound,
// the required pinned flag — are enforced only at parse time). The FRESH authority
// angle here is BOOT MEMORY CONFORMANCE + TRUST PROVENANCE: the memory the OS starts
// from is a set of valid records each carrying an explicit, honest provenance.
// (1) NON-EMPTY MEMORY — at least one record is seeded. (2) EVERY RECORD PARSES — each
// entry round-trips through memoryRecordSchema (a runtime check strictly stronger than
// the type the behavior suites rely on). (3) IDS ARE UNIQUE — no two seeded records
// share an id, so no seeded memory silently shadows another. (4) PROVENANCE IS EXPLICIT
// AND HONEST — every record names a valid sourceTrust trustLevel, and any record whose
// sourceChannel is "external_legacy" is NOT "trusted": external-origin boot memory can
// never enter the store as fully trusted, it must arrive limited/untrusted.

describe("memory seeds — boot memory conforms to the protocol schema", () => {
  it("seeds a non-empty long-term memory", () => {
    expect(initialMemoryRecords.length).toBeGreaterThan(0);
  });

  it("every seeded memory record parses against memoryRecordSchema", () => {
    for (const record of initialMemoryRecords) {
      expect(memoryRecordSchema.safeParse(record).success).toBe(true);
    }
  });

  it("keeps every seeded record id unique — no seeded memory shadows another", () => {
    const ids = initialMemoryRecords.map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("memory seeds — provenance is explicit and honest", () => {
  it("every seeded record names a valid sourceTrust trustLevel", () => {
    for (const record of initialMemoryRecords) {
      expect(sourceTrustSchema.safeParse(record.trustLevel).success).toBe(true);
    }
  });

  it("external-origin boot memory never enters fully trusted", () => {
    for (const record of initialMemoryRecords) {
      if (record.sourceChannel === "external_legacy") {
        expect(record.trustLevel).not.toBe("trusted");
      }
    }
  });
});
