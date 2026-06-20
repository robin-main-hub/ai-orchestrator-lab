import { describe, expect, it } from "vitest";
import { secretRefSchema } from "@ai-orchestrator/protocol";
import { now } from "./appConstants";
import { createDgxVaultSecretRef } from "./helpers";

// Characterization tests (no behavior change) for the previously-untested
// createDgxVaultSecretRef factory in helpers.ts. It folds three caller-supplied
// strings (id / label / redactedPreview) into a protocol SecretRef. The
// load-bearing invariant is the SHAPE the factory hard-codes around them: a vault
// secret is always the most durable kind — scope "workspace" (never "session" or
// "profile") and transient=false — so it survives session teardown rather than
// being swept like an ephemeral secret. createdAt is pinned to the appConstants
// `now` clock. We also re-parse the result through the protocol secretRefSchema
// (read-only) so the factory's output stays a valid SecretRef without this test
// asserting anything about the schema itself.
describe("createDgxVaultSecretRef", () => {
  it("passes id/label/redactedPreview straight through", () => {
    const ref = createDgxVaultSecretRef("dgx_token", "DGX 토큰", "sk-…last4");
    expect(ref.id).toBe("dgx_token");
    expect(ref.label).toBe("DGX 토큰");
    expect(ref.redactedPreview).toBe("sk-…last4");
  });

  it("is always a durable workspace-scoped, non-transient secret", () => {
    const ref = createDgxVaultSecretRef("a", "b", "c");
    // a vault secret must outlive a session — never session/profile, never transient
    expect(ref.scope).toBe("workspace");
    expect(ref.transient).toBe(false);
  });

  it("stamps createdAt from the shared `now` clock and sets no expiry", () => {
    const ref = createDgxVaultSecretRef("a", "b", "c");
    expect(ref.createdAt).toBe(now);
    expect(ref.expiresAt).toBeUndefined();
  });

  it("produces a value the protocol secretRefSchema accepts", () => {
    const ref = createDgxVaultSecretRef("id", "label", "preview");
    // read-only validation against the protocol contract (no schema change)
    expect(secretRefSchema.parse(ref)).toEqual(ref);
  });
});
