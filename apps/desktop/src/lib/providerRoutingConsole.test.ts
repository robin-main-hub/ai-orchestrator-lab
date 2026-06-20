import { describe, expect, it } from "vitest";
import type { ModelDiscoverySnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import type { ModelCatalog } from "../types";
import { createProviderRoutingConsoleItems, sanitizeProviderConsoleText } from "./providerRoutingConsole";
import { sanitizePublicText } from "./publicRedaction";

function provider(patch: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: patch.id ?? "provider_mimo_token_openai",
    name: patch.name ?? "MiMo Token Plan OpenAI",
    kind: patch.kind ?? "openai",
    baseUrl: patch.baseUrl ?? "https://token-plan-sgp.xiaomimimo.com/v1",
    defaultModel: patch.defaultModel ?? "mimo-v2.5-pro",
    enabled: patch.enabled ?? true,
    tags: patch.tags ?? ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "openai-compatible"],
    trustLevel: patch.trustLevel ?? "limited",
    secretRef: patch.secretRef,
  };
}

describe("providerRoutingConsole", () => {
  it("summarizes provider routing without exposing base urls or secret refs", () => {
    const profiles = [
      provider({
        secretRef: {
          id: "secret_dgx02_mimo_token_plan",
          label: "DGX-02 MiMo Token Plan API key",
          redactedPreview: "dgx-02:MIMO_API_KEY",
          scope: "profile",
          transient: false,
        },
      }),
      provider({
        id: "provider_apifun_claude",
        name: "APIKey.fun Claude A",
        kind: "anthropic",
        baseUrl: "https://api.apikey.fun",
        defaultModel: "claude-opus-4-8",
        tags: ["dgx-secret-ref", "server-proxy", "apikey.fun", "reseller"],
        trustLevel: "untrusted",
        secretRef: {
          id: "secret_dgx02_apikeyfun_claude_a",
          label: "DGX-02 APIKey.fun Claude A",
          redactedPreview: "dgx-02:ANTHROPIC_API_KEY",
          scope: "profile",
          transient: false,
        },
      }),
    ];
    const modelCatalog: ModelCatalog = {
      provider_mimo_token_openai: [
        {
          id: "mimo-v2.5-pro",
          name: "MiMo V2.5 Pro",
          providerProfileId: "provider_mimo_token_openai",
          contextWindow: 1_000_000,
          supportsStreaming: true,
          supportsTools: true,
          tags: ["mimo"],
        },
      ],
      provider_apifun_claude: [
        {
          id: "claude-opus-4-8",
          name: "Claude Opus 4.8",
          providerProfileId: "provider_apifun_claude",
          contextWindow: 200_000,
          supportsStreaming: true,
          supportsTools: true,
          tags: ["claude"],
        },
      ],
    };
    const discoveryByProviderId: Record<string, ModelDiscoverySnapshot> = {
      provider_mimo_token_openai: {
        id: "discovery_mimo",
        createdAt: "2026-06-05T08:00:00.000Z",
        providerProfileId: "provider_mimo_token_openai",
        models: modelCatalog.provider_mimo_token_openai ?? [],
        redactionApplied: true,
        source: "remote_probe",
        status: "succeeded",
        warnings: [],
      },
    };

    const items = createProviderRoutingConsoleItems({
      agents: [
        { providerProfileId: "provider_mimo_token_openai" },
        { providerProfileId: "provider_mimo_token_openai" },
        { providerProfileId: "provider_apifun_claude" },
      ],
      discoveryByProviderId,
      modelCatalog,
      profiles,
    });
    const serialized = JSON.stringify(items);

    expect(items[0]).toMatchObject({
      assignedAgentCount: 2,
      defaultModelLabel: "MiMo V2.5 Pro",
      discoveryLabel: "모델 발견 완료",
      displayName: "MiMo",
      readinessLabel: "연결 검증 준비",
      secretPolicyLabel: "서버 비밀값 참조 필요",
    });
    expect(items[1]).toMatchObject({
      assignedAgentCount: 1,
      displayName: "APIKey.fun Claude A",
      trustLabel: "비신뢰",
    });
    expect(serialized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serialized).not.toContain("https://api.apikey.fun");
    expect(serialized).not.toContain("MIMO_API_KEY");
    expect(serialized).not.toContain("ANTHROPIC_API_KEY");
  });
});

// Characterization tests (no behavior change) for the previously-unasserted export
// sanitizeProviderConsoleText. The block above drives the full console projection and
// proves secrets don't leak, but never the leaf sanitizer it leans on for every label.
// Its load-bearing contract: it is a STRICT POST-PASS over sanitizePublicText that
// rewrites the bracketed redaction placeholders into bracket/colon-free, console-safe
// underscore tokens (the console renders raw, so "[redacted:url]" style markers would
// look like stray syntax). Specifically:
//   - "[redacted:url]"  -> "redacted_url"
//   - "Bearer [redacted]" -> "Bearer redacted_token"  (handled before the generic case)
//   - "[redacted:path]" -> "redacted_path"
//   - "[redacted]"      -> "redacted_token"  (sk-/tp-/KEY= secrets)
//   - it never re-introduces the original secret, and it leaves already-safe text and
//     the de-bracketed tokens byte-identical (idempotent on its own output),
//   - the ONE placeholder it intentionally does NOT de-bracket is "[redacted:internal]"
//     (chain-of-thought/raw-prompt/tool-input), which survives with brackets intact —
//     a console line can still show that marker verbatim.
describe("sanitizeProviderConsoleText", () => {
  it("passes already-safe text through unchanged", () => {
    expect(sanitizeProviderConsoleText("MiMo V2.5 Pro")).toBe("MiMo V2.5 Pro");
    expect(sanitizeProviderConsoleText("provider_mimo_token_openai")).toBe("provider_mimo_token_openai");
    expect(sanitizeProviderConsoleText("")).toBe("");
  });

  it("rewrites url/path/token placeholders into bracket-free console tokens", () => {
    expect(sanitizeProviderConsoleText("endpoint https://token-plan-sgp.xiaomimimo.com/v1")).toBe(
      "endpoint redacted_url",
    );
    expect(sanitizeProviderConsoleText("key file /Users/robin/secret.txt")).toBe("key file redacted_path");
    expect(sanitizeProviderConsoleText("auth Bearer abc123def456ghi")).toBe("auth Bearer redacted_token");
    expect(sanitizeProviderConsoleText("token sk-abcdef123456")).toBe("token redacted_token");
    expect(sanitizeProviderConsoleText("token tp-abcdef123456")).toBe("token redacted_token");
  });

  it("leaves no bracket/colon redaction syntax for the de-bracketed cases", () => {
    for (const dirty of [
      "see https://evil.example/x",
      "/Users/robin/.ssh/id_rsa",
      "Bearer abc123def456ghi",
      "sk-abcdef123456",
    ]) {
      const out = sanitizeProviderConsoleText(dirty);
      expect(out).not.toMatch(/\[redacted(:url|:path)?\]/);
      // and the raw secret never survives
      expect(out).not.toContain("evil.example");
      expect(out).not.toContain("id_rsa");
      expect(out).not.toContain("abc123def456ghi");
    }
  });

  it("is a strict post-pass over sanitizePublicText (de-brackets only the four markers)", () => {
    const sample = "url https://a.test/x · path /Users/x/y · auth Bearer tok123456789 · key sk-zzzzzzzz12";
    const expected = sanitizePublicText(sample)
      .replaceAll("[redacted:url]", "redacted_url")
      .replaceAll("Bearer [redacted]", "Bearer redacted_token")
      .replaceAll("[redacted:path]", "redacted_path")
      .replaceAll("[redacted]", "redacted_token");
    expect(sanitizeProviderConsoleText(sample)).toBe(expected);
  });

  it("is idempotent on its own already-cleaned output", () => {
    const once = sanitizeProviderConsoleText("https://a.test/x · /Users/x · Bearer tok123456789 · sk-zzzzzzzz12");
    expect(sanitizeProviderConsoleText(once)).toBe(once);
  });

  it("does NOT de-bracket the internal-reasoning marker (it survives verbatim)", () => {
    // sanitizePublicText collapses chain-of-thought/raw-prompt/tool-input to
    // "[redacted:internal]"; the console pass deliberately keeps that one bracketed.
    const out = sanitizeProviderConsoleText("note tool input: rm -rf /tmp");
    expect(out).toContain("[redacted:internal]");
    expect(out).not.toContain("rm -rf");
  });
});
