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
});
