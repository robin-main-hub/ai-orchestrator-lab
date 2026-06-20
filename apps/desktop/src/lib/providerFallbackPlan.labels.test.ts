import type { ProviderProfile, SecretRef } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  enabledAlternativeProviders,
  providerAuthLabel,
  providerErrorCategoryLabel,
} from "./providerFallbackPlan";

// Characterization tests for the three providerFallbackPlan helpers the existing
// providerFallbackPlan.test.ts leaves uncovered (no behavior change). All are
// pure: the module imports only protocol types + a pure redaction helper, no
// React/DOM/network. We pin the error-category label arms (incl. the `provider`
// default), the providerAuthLabel OAuth/API-key/basic precedence ladder (which
// scans a lowercased blob of secretRef id+label, tags, and authHeader), and
// enabledAlternativeProviders' filter (self/disabled/mock-by-id/mock-by-tag) +
// trust-rank descending sort.

function provider(patch: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: patch.id ?? "provider_primary",
    name: patch.name ?? "Primary",
    kind: patch.kind ?? "openai",
    baseUrl: patch.baseUrl,
    defaultModel: patch.defaultModel ?? "model-primary",
    enabled: patch.enabled ?? true,
    tags: patch.tags ?? ["server-proxy"],
    trustLevel: patch.trustLevel ?? "trusted",
    secretRef: patch.secretRef,
    apiKeyRef: patch.apiKeyRef,
    authHeader: patch.authHeader,
  };
}

function secret(patch: Partial<SecretRef>): SecretRef {
  return {
    id: patch.id ?? "secret_1",
    label: patch.label ?? "Secret",
    scope: patch.scope ?? "profile",
    redactedPreview: patch.redactedPreview ?? "****",
    transient: patch.transient ?? false,
  };
}

describe("providerErrorCategoryLabel", () => {
  it("maps each category, defaulting unknown to the provider label", () => {
    expect(providerErrorCategoryLabel("auth")).toBe("권한");
    expect(providerErrorCategoryLabel("network")).toBe("네트워크");
    expect(providerErrorCategoryLabel("rate_limit")).toBe("사용량 제한");
    expect(providerErrorCategoryLabel("timeout")).toBe("응답 지연");
    expect(providerErrorCategoryLabel("provider")).toBe("공급자");
  });
});

describe("providerAuthLabel", () => {
  it("returns OAuth when any scanned field mentions oauth", () => {
    expect(providerAuthLabel(provider({ tags: ["oauth"] }))).toBe("OAuth");
    expect(providerAuthLabel(provider({ tags: [], authHeader: "Authorization: OAuth abc" }))).toBe("OAuth");
    expect(providerAuthLabel(provider({ tags: [], secretRef: secret({ id: "oauth_token_1" }) }))).toBe("OAuth");
  });

  it("returns API 키 when a key/secret ref is present without oauth", () => {
    expect(providerAuthLabel(provider({ tags: [], apiKeyRef: "key_x" }))).toBe("API 키");
    expect(providerAuthLabel(provider({ tags: [], secretRef: secret({ id: "sk_1", label: "API" }) }))).toBe("API 키");
  });

  it("falls back to 기본 인증 when there is no oauth hint and no key/secret ref", () => {
    expect(providerAuthLabel(provider({ tags: [] }))).toBe("기본 인증");
    expect(providerAuthLabel(provider({ tags: ["server-proxy"] }))).toBe("기본 인증");
  });
});

describe("enabledAlternativeProviders", () => {
  it("excludes the selected, disabled, and mock providers, sorted by trust desc", () => {
    const providers = [
      provider({ id: "provider_selected", trustLevel: "trusted" }),
      provider({ id: "provider_limited", trustLevel: "limited" }),
      provider({ id: "provider_trusted", trustLevel: "trusted" }),
      provider({ id: "provider_disabled", enabled: false, trustLevel: "trusted" }),
      provider({ id: "provider_mock_local", trustLevel: "trusted" }),
      provider({ id: "provider_tagged_mock", tags: ["mock"], trustLevel: "trusted" }),
    ];
    const result = enabledAlternativeProviders(providers, "provider_selected").map((p) => p.id);
    expect(result).toEqual(["provider_trusted", "provider_limited"]);
  });

  it("returns an empty list when only the selected provider qualifies", () => {
    const providers = [provider({ id: "provider_selected" })];
    expect(enabledAlternativeProviders(providers, "provider_selected")).toEqual([]);
  });
});
