import { describe, it, expect } from "vitest";
import { LocalHeuristicAdapter } from "./localHeuristicAdapter.js";
import { withTrustEnforcement } from "./trustEnforcedAdapter.js";
import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

/**
 * `withTrustEnforcement` was only contract-tested against MockMemoryAdapter.
 * Real adapters should also satisfy the standard contract when wrapped
 * in trust enforcement (with a permitted ctx). Catches regressions where
 * trust wrapping accidentally drops a method or mutates ctx in a way
 * that breaks the underlying adapter.
 */
describe("withTrustEnforcement(LocalHeuristicAdapter) — contract pass-through", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = withTrustEnforcement(new LocalHeuristicAdapter());
      const ctx = makeContractCtx({ permissionDecision: "allow" });
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});
