import { describe, it, expect } from "vitest";
import { MementoMcpAdapter } from "./mementoAdapter.js";
import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

/**
 * Run the shared MemoryAdapter contract suite against MementoMcpAdapter
 * under each cache policy. After PR #171 aligned Memento's return shapes
 * with the protocol types, every standard case must pass in all three
 * policies without leakage between adapter instances.
 */
describe("MementoMcpAdapter (local_cache) — contract", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = new MementoMcpAdapter({ policy: "local_cache" });
      const ctx = makeContractCtx();
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});

describe("MementoMcpAdapter (dgx_central) — contract", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = new MementoMcpAdapter({ policy: "dgx_central" });
      const ctx = makeContractCtx();
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});

describe("MementoMcpAdapter (session_only) — contract", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = new MementoMcpAdapter({ policy: "session_only" });
      const ctx = makeContractCtx();
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});
