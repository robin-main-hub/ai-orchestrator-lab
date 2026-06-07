import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderRuntimeReadiness } from "@ai-orchestrator/protocol";
import { ProviderReadinessPreflight } from "./ProviderReadinessPreflight";

function readiness(patch: Partial<ProviderRuntimeReadiness> = {}): ProviderRuntimeReadiness {
  return {
    id: "provider_readiness_mimo",
    providerProfileId: "provider_mimo_token_openai",
    status: "ready",
    executionMode: "remote",
    modelCount: 4,
    selectedModelId: "mimo-v2.5-pro",
    secretAvailability: "available",
    canRunCompletion: true,
    canUseAutomaticMemory: true,
    reason: "ready",
    warnings: [],
    createdAt: "2026-06-06T00:00:00.000Z",
    ...patch,
  };
}

describe("ProviderReadinessPreflight", () => {
  it("준비된 provider는 대화 화면을 어지럽히지 않는다", () => {
    const html = renderToStaticMarkup(
      <ProviderReadinessPreflight
        providerName="MiMo"
        readiness={readiness()}
        selectedModelName="mimo-v2.5-pro"
      />,
    );

    expect(html).toBe("");
  });

  it("credential_required 상태를 보내기 전 확인 배너로 보여준다", () => {
    const html = renderToStaticMarkup(
      <ProviderReadinessPreflight
        providerName="MiMo"
        readiness={readiness({
          status: "credential_required",
          canRunCompletion: false,
          reason: "secretRef 연결이 필요함",
          secretAvailability: "missing",
        })}
        selectedModelName="mimo-v2.5-pro"
      />,
    );

    expect(html).toContain("보내기 전 확인 필요");
    expect(html).toContain("MiMo");
    expect(html).toContain("mimo-v2.5-pro");
    expect(html).toContain("secretRef 연결이 필요함");
    expect(html).toContain("설정 또는 승인 상태를 먼저 확인");
  });

  it("승인 후 재시도 대기 상태를 명확히 표시한다", () => {
    const html = renderToStaticMarkup(
      <ProviderReadinessPreflight
        pendingRetryAgentName="마키마"
        providerName="APIKey.fun Claude A"
        readiness={readiness({
          status: "needs_approval",
          canRunCompletion: false,
          reason: "원격 secret 접근 승인 필요",
          warnings: ["network_access", "secret_access"],
        })}
        selectedModelName="claude-opus-4-8"
      />,
    );

    expect(html).toContain("승인 대기");
    expect(html).toContain("마키마");
    expect(html).toContain("승인되면 이어서 전송");
    expect(html).toContain("network_access");
    expect(html).toContain("secret_access");
  });
});
