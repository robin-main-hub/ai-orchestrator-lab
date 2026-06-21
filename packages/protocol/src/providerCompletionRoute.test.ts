import { describe, expect, it } from "vitest";
import {
  providerCompletionRequestContextSchema,
  providerCompletionRouteSchema,
  providerCompletionRouteTypeSchema,
} from "./index.js";

// The providerCompletion ROUTE family decides how a completion request is sent
// (transport route) and under whose authority it runs (caller class + identity).
// These three schemas were never directly pinned. Four authority facts: (1)
// TRANSPORT ROUTE closed vocab — exactly {server_proxy, direct_provider,
// local_fallback}. (2) CALLER-CLASS closed vocab — exactly the eight declared
// routeTypes, in order (personal … scheduled_batch); an unknown class is
// rejected so a request can never claim an unspecced trust class. (3) SAFE
// DEFAULT — the FRESH angle: routeType carries `.default("personal")`, so a
// request context that OMITS routeType parses to the most-personal (least
// privileged-surface) class rather than to nothing; the default is applied by
// the schema, not assumed by callers. (4) BOUNDED IDENTITY + NO-SMUGGLE —
// userId is required and length-bounded [1,256] (empty rejected), the optional
// trustedDeviceId is bounded the same way, humanInitiated is an optional flag
// (absent stays undefined, never silently true), and unknown keys are stripped.
// Enum members are read back via `.options` (no magic literals).

describe("providerCompletion route family — closed vocabularies", () => {
  it("transport route admits exactly the three send paths", () => {
    expect(providerCompletionRouteSchema.options).toEqual([
      "server_proxy",
      "direct_provider",
      "local_fallback",
    ]);
    expect(providerCompletionRouteSchema.safeParse("p2p").success).toBe(false);
  });

  it("caller-class routeType admits exactly the eight declared classes in order", () => {
    expect(providerCompletionRouteTypeSchema.options).toEqual([
      "personal",
      "trusted_remote_device",
      "shared",
      "slack_bot",
      "company_webapp",
      "multi_user_openclaw",
      "public_api",
      "scheduled_batch",
    ]);
    expect(providerCompletionRouteTypeSchema.safeParse("anonymous").success).toBe(false);
  });
});

describe("providerCompletionRequestContext — safe default + bounded identity", () => {
  it("fills an omitted routeType with the most-personal class (default applied by schema)", () => {
    const parsed = providerCompletionRequestContextSchema.parse({ userId: "u-1" });
    expect(parsed.routeType).toBe("personal");
    expect(parsed.humanInitiated).toBeUndefined(); // optional flag never silently true
    expect(parsed.trustedDeviceId).toBeUndefined();
  });

  it("keeps an explicitly-supplied routeType", () => {
    const parsed = providerCompletionRequestContextSchema.parse({ userId: "u-1", routeType: "public_api" });
    expect(parsed.routeType).toBe("public_api");
  });

  it("requires a non-empty, length-bounded userId", () => {
    expect(providerCompletionRequestContextSchema.safeParse({ userId: "" }).success).toBe(false);
    expect(providerCompletionRequestContextSchema.safeParse({ userId: "x".repeat(257) }).success).toBe(false);
    expect(providerCompletionRequestContextSchema.safeParse({ userId: "x".repeat(256) }).success).toBe(true);
  });

  it("bounds an optional trustedDeviceId the same way and strips unknown keys", () => {
    expect(
      providerCompletionRequestContextSchema.safeParse({ userId: "u", trustedDeviceId: "" }).success,
    ).toBe(false); // present-but-empty rejected
    const parsed = providerCompletionRequestContextSchema.parse({ userId: "u", spoofedRoute: "public_api" });
    expect("spoofedRoute" in parsed).toBe(false); // cannot smuggle an extra field past the context
  });
});
