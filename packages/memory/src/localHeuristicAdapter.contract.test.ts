import { describe, it, expect } from "vitest";
import { LocalHeuristicAdapter } from "./localHeuristicAdapter.js";
import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

describe("LocalHeuristicAdapter — contract", () => {
    for (const testCase of STANDARD_CONTRACT_CASES) {
          it(testCase.label, async () => {
                  const adapter = new LocalHeuristicAdapter();
                  const ctx = makeContractCtx();
                  await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
          });
    }
});
