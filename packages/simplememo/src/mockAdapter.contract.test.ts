import { describe, it, expect } from "vitest";
  import { MockAdapter } from "./mockAdapter.js";
  import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

  describe("MockAdapter — contract", () => {
    for (const testCase of STANDARD_CONTRACT_CASES) {
      it(testCase.label, async () => {
        const adapter = new MockAdapter();
      const ctx = makeContractCtx();
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
});
}
});
