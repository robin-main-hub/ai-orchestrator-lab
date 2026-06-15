import { describe, it, expect } from "vitest";
import { MementoMcpAdapter } from "./mementoAdapter.js";
import { withTrustEnforcement } from "./trustEnforcedAdapter.js";
import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

/**
 * Trust-enforcement pass-through for MementoMcpAdapter under each cache
 * policy. Mirrors the trustEnforced × LocalHeuristic suite — once
 * Memento conformed to the protocol shapes (PR #171) and the
 * activateMemories cross-store bug was fixed (PR #175), trust wrapping
 * should be a transparent no-op when ctx is permitted.
 */
describe("withTrustEnforcement(MementoMcpAdapter local_cache) — contract pass-through", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = withTrustEnforcement(new MementoMcpAdapter({ policy: "local_cache" }));
      const ctx = makeContractCtx({ permissionDecision: "allow" });
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});

describe("withTrustEnforcement(MementoMcpAdapter dgx_central) — contract pass-through", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = withTrustEnforcement(new MementoMcpAdapter({ policy: "dgx_central" }));
      const ctx = makeContractCtx({ permissionDecision: "allow" });
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});

describe("withTrustEnforcement(MementoMcpAdapter session_only) — contract pass-through", () => {
  for (const testCase of STANDARD_CONTRACT_CASES) {
    it(testCase.label, async () => {
      const adapter = withTrustEnforcement(new MementoMcpAdapter({ policy: "session_only" }));
      const ctx = makeContractCtx({ permissionDecision: "allow" });
      await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
    });
  }
});
