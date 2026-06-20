import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { MIMO_MOCK_DEFAULT_TOKEN, createAuthBinding } from "./useProviderRegistryController";

// Characterization tests for createAuthBinding (no behavior change). It is a
// pure exported helper from the provider-registry controller — no React, no
// network — that maps a ProviderProfile to a WorkbenchAgent authBinding via a
// three-way branch: absent provider → a "waiting" placeholder; provider tagged
// "oauth" → oauth mode with an "oauth_pending" ref; otherwise → provider_profile
// mode referencing the secret. We pin each branch plus the secretRef passthrough
// (secretRefId is the provider's secretRef.id, undefined when absent). Pure.

function provider(over: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: "p1",
    tags: [],
    secretRef: { id: "secret-1" },
    ...over,
  } as unknown as ProviderProfile;
}

describe("createAuthBinding", () => {
  it("returns a waiting placeholder when no provider is given", () => {
    expect(createAuthBinding(undefined)).toEqual({
      mode: "provider_profile",
      label: "인증 정보 대기",
    });
  });

  it("binds a non-oauth provider to provider_profile mode referencing its secret", () => {
    expect(createAuthBinding(provider({ id: "px", secretRef: { id: "s9" } as never }))).toEqual({
      mode: "provider_profile",
      label: "API 비밀키 참조",
      providerProfileId: "px",
      secretRefId: "s9",
      oauthRef: undefined,
    });
  });

  it("binds an oauth-tagged provider to oauth mode with an oauth_pending ref", () => {
    expect(createAuthBinding(provider({ id: "po", tags: ["oauth"] as never }))).toEqual({
      mode: "oauth",
      label: "OAuth/API 프로필",
      providerProfileId: "po",
      secretRefId: "secret-1",
      oauthRef: "oauth_pending",
    });
  });

  it("passes secretRefId through as undefined when the provider has no secretRef", () => {
    expect(createAuthBinding(provider({ id: "pn", secretRef: undefined }))).toEqual({
      mode: "provider_profile",
      label: "API 비밀키 참조",
      providerProfileId: "pn",
      secretRefId: undefined,
      oauthRef: undefined,
    });
  });
});

describe("MIMO_MOCK_DEFAULT_TOKEN", () => {
  it("pins the mock token injected when no mimo env credential is configured", () => {
    expect(MIMO_MOCK_DEFAULT_TOKEN).toBe("mimo-mock-token");
  });
});
