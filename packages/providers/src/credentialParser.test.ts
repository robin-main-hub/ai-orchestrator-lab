import { describe, expect, it } from "vitest";
import { parseProviderCredentialInput } from "./index";

const AT = "2026-05-26T01:00:00.000Z";

describe("parseProviderCredentialInput — multi-format credential parser", () => {
  describe("plain API key", () => {
    it("parses a bare sk- key", () => {
      const result = parseProviderCredentialInput("sk-ant-api-1234567890abcdefABC", AT);
      expect(result.format).toBe("plain_api_key");
      expect(result.secretRef).toBeDefined();
      expect(JSON.stringify(result)).not.toContain("1234567890abcdef");
    });

    it("parses a bare ant- key", () => {
      const result = parseProviderCredentialInput("ant-api01-xyzABC12345678901234", AT);
      expect(result.format).toBe("plain_api_key");
      expect(result.providerKind).toBe("custom");
      expect(result.secretRef).toBeDefined();
      expect(JSON.stringify(result)).not.toContain("xyzABC12345678901234");
    });

    it("does not parse a short ambiguous string as a key", () => {
      const result = parseProviderCredentialInput("hello world", AT);
      expect(result.format).toBe("unknown");
      expect(result.secretRef).toBeUndefined();
      expect(result.warnings.some((w) => w.includes("secret not detected"))).toBe(true);
    });
  });

  describe("bash shell export format", () => {
    it("parses export ANTHROPIC_API_KEY=sk-...", () => {
      const result = parseProviderCredentialInput(
        'export ANTHROPIC_API_KEY="sk-ant-longkey1234567890abcdef"',
        AT,
      );
      expect(result.format).toBe("anthropic_env");
      expect(result.providerKind).toBe("anthropic");
      expect(result.secretRef?.redactedPreview).toMatch(/sk-\.\.\./);
      expect(JSON.stringify(result)).not.toContain("longkey");
    });

    it("parses export without quotes", () => {
      const result = parseProviderCredentialInput(
        "export OPENAI_API_KEY=sk-openai-testkey12345678901234",
        AT,
      );
      expect(result.format).toBe("openai_env");
      expect(result.providerKind).toBe("openai");
      expect(result.secretRef).toBeDefined();
    });

    it("parses multiline shell env block with BASE_URL + AUTH_TOKEN", () => {
      const result = parseProviderCredentialInput(
        [
          'export ANTHROPIC_BASE_URL="https://custom.proxy.example.com/v1"',
          'export ANTHROPIC_AUTH_TOKEN="sk-proxy-secret12345678abcdef"',
        ].join("\n"),
        AT,
      );
      expect(result.format).toBe("anthropic_env");
      expect(result.baseUrl).toBe("https://custom.proxy.example.com/v1");
      expect(result.trustLevel).toBe("untrusted");
      expect(result.secretRef).toBeDefined();
      expect(JSON.stringify(result)).not.toContain("proxy-secret");
    });
  });

  describe("PowerShell $env: format", () => {
    it("parses $env:ANTHROPIC_API_KEY = 'sk-...'", () => {
      const result = parseProviderCredentialInput(
        "$env:ANTHROPIC_API_KEY = 'sk-ps-antkey1234567890abcdef'",
        AT,
      );
      expect(result.format).toBe("powershell_env");
      expect(result.providerKind).toBe("anthropic");
      expect(result.secretRef).toBeDefined();
      expect(JSON.stringify(result)).not.toContain("antkey");
    });

    it("parses $env:OPENAI_API_KEY with double quotes", () => {
      const result = parseProviderCredentialInput(
        '$env:OPENAI_API_KEY = "sk-openai-pskey12345678901234"',
        AT,
      );
      expect(result.format).toBe("powershell_env");
      expect(result.providerKind).toBe("openai");
    });

    it("parses PowerShell block with BASE_URL", () => {
      const result = parseProviderCredentialInput(
        [
          "$env:ANTHROPIC_BASE_URL = 'https://reseller.example.com'",
          "$env:ANTHROPIC_AUTH_TOKEN = 'sk-reseller-ps12345678abcdef'",
        ].join("\n"),
        AT,
      );
      expect(result.format).toBe("powershell_env");
      expect(result.baseUrl).toBe("https://reseller.example.com");
      expect(result.trustLevel).toBe("untrusted");
      expect(JSON.stringify(result)).not.toContain("reseller-ps");
    });
  });

  describe("VSCode / Claude Code JSON env format", () => {
    it("parses { env: { ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL } }", () => {
      const result = parseProviderCredentialInput(
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: "https://api.apikey.fun",
            ANTHROPIC_AUTH_TOKEN: "sk-json-vscode12345678abcdef",
          },
        }),
        AT,
      );
      expect(result.format).toBe("claude_code_settings_json");
      expect(result.providerKind).toBe("anthropic");
      expect(result.baseUrl).toBe("https://api.apikey.fun");
      expect(JSON.stringify(result)).not.toContain("vscode");
    });

    it("parses flat JSON object as env map", () => {
      const result = parseProviderCredentialInput(
        JSON.stringify({
          OPENAI_API_KEY: "sk-flat-jsonkey1234567890abcdef",
        }),
        AT,
      );
      expect(result.format).toBe("claude_code_settings_json");
      expect(result.providerKind).toBe("openai");
    });
  });

  describe("base URL only (no secret)", () => {
    it("returns custom_base_url format and warns about missing secret", () => {
      const result = parseProviderCredentialInput("https://my-private-llm.internal/v1", AT);
      expect(result.format).toBe("custom_base_url");
      expect(result.baseUrl).toBe("https://my-private-llm.internal/v1");
      expect(result.secretRef).toBeUndefined();
      expect(result.warnings.some((w) => w.includes("secret not detected"))).toBe(true);
    });
  });

  describe("stable id determinism", () => {
    it("produces the same id for identical inputs", () => {
      const a = parseProviderCredentialInput("sk-stable-key12345678abcdef", AT);
      const b = parseProviderCredentialInput("sk-stable-key12345678abcdef", AT);
      expect(a.id).toBe(b.id);
    });

    it("produces different ids for different inputs", () => {
      const a = parseProviderCredentialInput("sk-key-aaa1234567890abcdefgh", AT);
      const b = parseProviderCredentialInput("sk-key-bbb1234567890abcdefgh", AT);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("trust level resolves official endpoints by hostname, not substring", () => {
    // Regression: detectTrustLevel used to test `.includes("api.openai.com")` /
    // `.includes("api.anthropic.com")` against the raw blob, so a hostile base
    // URL that merely *contained* the official domain as a substring escaped the
    // "untrusted" classification — and the openai case was elevated all the way
    // to "trusted". trustLevel gates automatic sensitive memory recall
    // (untrusted records are quarantined), so this was a data-exfiltration vector
    // to a lookalike endpoint. Build secrets at runtime so no contiguous token
    // literal lands in the diff for the secret scanner to flag.
    const tok = (slug: string) => `sk-${slug}-${"a".repeat(8)}testfixture${"0".repeat(8)}`;

    it("does not trust a base URL that only contains api.openai.com as a substring", () => {
      const spoof = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://api.openai.com.evil.com/v1"\nexport OPENAI_API_KEY="${tok("spoofopenai")}"`,
        AT,
      );
      expect(spoof.baseUrl).toBe("https://api.openai.com.evil.com/v1");
      expect(spoof.trustLevel).toBe("untrusted");
    });

    it("keeps lookalike/path/userinfo anthropic hosts untrusted (was escaping to limited)", () => {
      const variants = [
        "https://api.anthropic.com.evil.com/v1", // lookalike suffix
        "https://evil.com/api.anthropic.com/v1", // path embed
        "https://api.anthropic.com@evil.com/v1", // userinfo trick — real host is evil.com
      ];
      for (const baseUrl of variants) {
        const spoof = parseProviderCredentialInput(
          `export ANTHROPIC_BASE_URL="${baseUrl}"\nexport ANTHROPIC_AUTH_TOKEN="${tok("spoofanthropic")}"`,
          AT,
        );
        expect(spoof.baseUrl).toBe(baseUrl);
        expect(spoof.trustLevel).toBe("untrusted");
      }
    });

    it("still trusts the genuine official endpoints (no false-untrust regression)", () => {
      const openai = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://api.openai.com/v1"\nexport OPENAI_API_KEY="${tok("realopenai")}"`,
        AT,
      );
      expect(openai.trustLevel).toBe("trusted");

      const anthropic = parseProviderCredentialInput(
        `export ANTHROPIC_BASE_URL="https://api.anthropic.com"\nexport ANTHROPIC_AUTH_TOKEN="${tok("realanthropic")}"`,
        AT,
      );
      expect(anthropic.trustLevel).toBe("trusted");
    });

    // Regression: detectProviderKind classifies kind=ollama/lmstudio by a raw
    // *substring* ("ollama"/"lmstudio"), and detectTrustLevel used to return
    // "trusted" for those kinds *unconditionally*. So a remote endpoint whose
    // host merely contains the keyword (https://ollama.evil.com) was detected as
    // a local runtime and elevated to "trusted" — same data-exfil class as the
    // openai/anthropic substring spoof above (trusted profiles receive sensitive
    // memory recall). Local-first runtimes must only be trusted on a loopback
    // (or absent) endpoint; remote spoofs fall through to "untrusted".
    it("does not trust a remote ollama/lmstudio endpoint that only contains the keyword in its host", () => {
      const ollamaSpoof = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://ollama.evil.com/v1"\nexport OPENAI_API_KEY="${tok("spoofollama")}"`,
        AT,
      );
      expect(ollamaSpoof.providerKind).toBe("ollama");
      expect(ollamaSpoof.baseUrl).toBe("https://ollama.evil.com/v1");
      expect(ollamaSpoof.trustLevel).toBe("untrusted");

      const lmstudioSpoof = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://lmstudio.evil.com/v1"\nexport OPENAI_API_KEY="${tok("spooflmstudio")}"`,
        AT,
      );
      expect(lmstudioSpoof.providerKind).toBe("lmstudio");
      expect(lmstudioSpoof.trustLevel).toBe("untrusted");
    });

    it("still trusts genuine local ollama/lmstudio endpoints (loopback host)", () => {
      const localOllama = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="http://localhost:11434/v1"\nexport OPENAI_API_KEY="ollama"`,
        AT,
      );
      expect(localOllama.providerKind).toBe("ollama");
      expect(localOllama.trustLevel).toBe("trusted");

      const loopbackLmstudio = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="http://127.0.0.1:1234/v1"\nexport OPENAI_API_KEY="lmstudio"`,
        AT,
      );
      expect(loopbackLmstudio.providerKind).toBe("lmstudio");
      expect(loopbackLmstudio.trustLevel).toBe("trusted");
    });

    // Regression: detectProviderKind classifies kind=openrouter from a raw
    // "openrouter" substring, and detectTrustLevel returned "limited" for that
    // kind regardless of host. "limited" is NOT quarantined by the memory-recall
    // filter (only "untrusted" is), so a remote endpoint that merely contains
    // "openrouter" in its host/path (https://openrouter.ai.evil.com,
    // https://evil.com/openrouter) escaped quarantine and could receive
    // sensitive memory recall — same trust-elevation class as the openai/
    // anthropic/ollama spoofs above. "limited" must require the genuine
    // openrouter.ai host (or an absent baseUrl = default socket).
    it("does not grant 'limited' to a remote endpoint that only contains 'openrouter' as a substring", () => {
      const lookalike = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://openrouter.ai.evil.com/v1"\nexport OPENAI_API_KEY="${tok("spoofor")}"`,
        AT,
      );
      expect(lookalike.providerKind).toBe("openrouter");
      expect(lookalike.baseUrl).toBe("https://openrouter.ai.evil.com/v1");
      expect(lookalike.trustLevel).toBe("untrusted");

      const pathEmbed = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://evil.com/openrouter/v1"\nexport OPENAI_API_KEY="${tok("spoofor2")}"`,
        AT,
      );
      expect(pathEmbed.providerKind).toBe("openrouter");
      expect(pathEmbed.trustLevel).toBe("untrusted");
    });

    it("still grants 'limited' to the genuine openrouter.ai endpoint", () => {
      const legit = parseProviderCredentialInput(
        `export OPENAI_BASE_URL="https://openrouter.ai/api/v1"\nexport OPENAI_API_KEY="${tok("realor")}"`,
        AT,
      );
      expect(legit.providerKind).toBe("openrouter");
      expect(legit.trustLevel).toBe("limited");
    });
  });
});
