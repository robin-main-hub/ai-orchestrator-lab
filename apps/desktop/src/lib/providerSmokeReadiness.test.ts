import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import {
  createProviderRoundtripResultSummary,
  createProviderRoundtripHarness,
  createProviderSmokeReadiness,
} from "./providerSmokeReadiness";

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

describe("provider smoke readiness", () => {
  it("marks MiMo OpenAI route as a runnable connection verification", () => {
    expect(createProviderSmokeReadiness(provider({}))).toEqual({
      commandLabel: "pnpm provider:smoke:ai -- --run-mimo",
      modeLabel: "연결 검증 가능",
      routeLabel: "MiMo OpenAI",
      tone: "success",
    });
  });

  it("marks MiMo Anthropic route as a compatibility probe", () => {
    expect(
      createProviderSmokeReadiness(
        provider({
          id: "provider_mimo_token_anthropic",
          kind: "anthropic",
          tags: ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "anthropic-compatible"],
        }),
      ),
    ).toEqual({
      commandLabel: "pnpm provider:smoke:ai",
      modeLabel: "호환성 검증",
      routeLabel: "MiMo Anthropic",
      tone: "warning",
    });
  });

  it("marks DeepSeek as a live provider smoke candidate", () => {
    expect(
      createProviderSmokeReadiness(
        provider({
          id: "provider_deepseek_dgx",
          name: "DeepSeek DGX-02 Key",
          tags: ["dgx-secret-ref", "server-proxy", "deepseek"],
          secretRef: {
            id: "secret_dgx02_deepseek",
            label: "DGX-02 DeepSeek API key",
            scope: "profile",
            redactedPreview: "dgx-02:DEEPSEEK_API_KEY",
            transient: false,
          },
        }),
      ),
    ).toEqual({
      commandLabel: "pnpm provider:smoke:deepseek",
      modeLabel: "라이브 호출 점검",
      routeLabel: "DeepSeek",
      tone: "success",
    });
  });

  it("does not invent smoke commands for unrelated providers", () => {
    expect(
      createProviderSmokeReadiness(
        provider({
          id: "provider_openai_compat",
          tags: ["openai"],
        }),
      ),
    ).toBeUndefined();
  });

  it("creates a safe roundtrip harness for MiMo without exposing endpoint or secret values", () => {
    const harness = createProviderRoundtripHarness(
      provider({
        secretRef: {
          id: "secret_dgx02_mimo_token_plan",
          label: "DGX-02 MiMo Token Plan API key",
          scope: "profile",
          redactedPreview: "dgx-02:MIMO_API_KEY",
          transient: false,
        },
      }),
    );

    expect(harness).toEqual({
      commandLabel: "pnpm provider:smoke:ai -- --run-mimo",
      modeLabel: "연결 검증 준비",
      routeLabel: "MiMo OpenAI",
      networkPolicyLabel: "명시 실행 시 네트워크 호출",
      secretPolicyLabel: "서버 비밀값 참조 필요",
      logPolicyLabel: "응답 미리보기만 기록",
      tone: "success",
    });
    expect(JSON.stringify(harness)).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(JSON.stringify(harness)).not.toContain("MIMO_API_KEY=");
  });

  it("keeps DeepSeek live calls opt-in and dry-run first", () => {
    expect(
      createProviderRoundtripHarness(
        provider({
          id: "provider_deepseek_dgx",
          name: "DeepSeek DGX-02 Key",
          tags: ["dgx-secret-ref", "server-proxy", "deepseek"],
          secretRef: {
            id: "secret_dgx02_deepseek",
            label: "DGX-02 DeepSeek API key",
            scope: "profile",
            redactedPreview: "dgx-02:DEEPSEEK_API_KEY",
            transient: false,
          },
        }),
      ),
    ).toEqual({
      commandLabel: "pnpm provider:smoke:deepseek -- --dry-run",
      modeLabel: "라이브 호출 준비",
      routeLabel: "DeepSeek",
      networkPolicyLabel: "기본 모의 실행 · 실제 호출은 명시 실행",
      secretPolicyLabel: "서버 비밀값 참조 필요",
      logPolicyLabel: "응답 미리보기만 기록",
      tone: "warning",
    });
  });

  it("roundtrip harness labels avoid raw SecretRef, dry-run, live, probe jargon", () => {
    const harnesses = [
      createProviderRoundtripHarness(
        provider({
          secretRef: {
            id: "secret_dgx02_mimo_token_plan",
            label: "DGX-02 MiMo Token Plan API key",
            scope: "profile",
            redactedPreview: "dgx-02:MIMO_API_KEY",
            transient: false,
          },
        }),
      ),
      createProviderRoundtripHarness(
        provider({
          id: "provider_mimo_token_anthropic",
          kind: "anthropic",
          tags: ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "anthropic-compatible"],
        }),
      ),
      createProviderRoundtripHarness(
        provider({
          id: "provider_deepseek_dgx",
          name: "DeepSeek DGX-02 Key",
          tags: ["dgx-secret-ref", "server-proxy", "deepseek"],
          secretRef: {
            id: "secret_dgx02_deepseek",
            label: "DGX-02 DeepSeek API key",
            scope: "profile",
            redactedPreview: "dgx-02:DEEPSEEK_API_KEY",
            transient: false,
          },
        }),
      ),
    ].filter(Boolean);

    const visiblePolicyCopy = harnesses
      .flatMap((harness) => [
        harness?.modeLabel,
        harness?.networkPolicyLabel,
        harness?.secretPolicyLabel,
        harness?.logPolicyLabel,
      ])
      .join("\n");

    expect(visiblePolicyCopy).not.toContain("SecretRef");
    expect(visiblePolicyCopy).not.toContain("dry-run");
    expect(visiblePolicyCopy).not.toContain("live");
    expect(visiblePolicyCopy).not.toContain("probe");
  });

  it("summarizes provider roundtrip results without raw response bodies", () => {
    expect(
      createProviderRoundtripResultSummary({
        status: "ok",
        latencyMs: 812,
        providerLabel: "MiMo OpenAI",
      }),
    ).toEqual({
      label: "연결 확인됨",
      detail: "MiMo OpenAI · 812ms",
      tone: "success",
    });

    expect(
      createProviderRoundtripResultSummary({
        status: "auth_required",
        providerLabel: "DeepSeek",
        rawMessage: "Authorization: Bearer sk-secret1234567890",
      }),
    ).toEqual({
      label: "권한 필요",
      detail: "DeepSeek · 비밀값 확인 필요",
      tone: "warning",
    });
  });
});
