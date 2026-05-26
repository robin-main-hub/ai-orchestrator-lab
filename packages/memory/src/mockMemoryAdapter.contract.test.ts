import { describe, it, expect } from "vitest";
  import { MockMemoryAdapter } from "./mockMemoryAdapter.js";
  import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

  describe("MockMemoryAdapter — contract", () => {
    for (const testCase of STANDARD_CONTRACT_CASES) {
      it(testCase.label, async () => {
        const adapter = new MockMemoryAdapter();
      const ctx = makeContractCtx();
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
});
}
});
