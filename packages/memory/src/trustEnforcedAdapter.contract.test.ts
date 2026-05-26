import { describe, it, expect } from "vitest";
import { MockMemoryAdapter } from "./mockMemoryAdapter.js";
import { withTrustEnforcement } from "./trustEnforcedAdapter.js";
import { STANDARD_CONTRACT_CASES, makeContractCtx } from "./contractTestFixtures.js";

// Pass-through: withTrustEnforcement must not break any standard contract
describe("withTrustEnforcement(MockMemoryAdapter) — contract pass-through", () => {
    for (const testCase of STANDARD_CONTRACT_CASES) {
          it(testCase.label, async () => {
                  const adapter = withTrustEnforcement(new MockMemoryAdapter());
                  const ctx = makeContractCtx({ permissionDecision: "allow" });
                  await expect(testCase.run(adapter, ctx)).resolves.toBeUndefined();
          });
    }
});

// Trust-specific: verify enforcement layer rejects blocked operations
describe("withTrustEnforcement — trust enforcement", () => {
    it("blocks recall when permissionDecision is not allow", async () => {
          const adapter = withTrustEnforcement(new MockMemoryAdapter());
          const ctx = makeContractCtx({ permissionDecision: "approval_required" });
          await expect(adapter.recall({ query: "anything" }, ctx)).rejects.toMatchObject({
                  category: "permission_denied",
          });
    });

           it("blocks remember when permissionDecision is not allow", async () => {
                 const adapter = withTrustEnforcement(new MockMemoryAdapter());
                 const ctx = makeContractCtx({ permissionDecision: "deny" });
                 await expect(
                         adapter.remember(
                           { title: "t", content: "c", layer: "episode", sourceChannel: "agent", trustLevel: "trusted" },
                                   ctx,
                                 ),
                       ).rejects.toMatchObject({ category: "permission_denied" });
           });

           it("blocks untrusted callers from recalling", async () => {
                 const adapter = withTrustEnforcement(new MockMemoryAdapter());
                 const ctx = makeContractCtx({ permissionDecision: "allow", callerTrustLevel: "untrusted" });
                 await expect(adapter.recall({ query: "anything" }, ctx)).rejects.toMatchObject({
                         category: "trust_violation",
                 });
           });

           it("blocks untrusted memory writes", async () => {
                 const adapter = withTrustEnforcement(new MockMemoryAdapter());
                 const ctx = makeContractCtx({ permissionDecision: "allow" });
                 await expect(
                         adapter.remember(
                           { title: "t", content: "c", layer: "episode", sourceChannel: "agent", trustLevel: "untrusted" },
                                   ctx,
                                 ),
                       ).rejects.toMatchObject({ category: "trust_violation" });
           });
});
