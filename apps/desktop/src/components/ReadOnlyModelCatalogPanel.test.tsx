import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadOnlyModelCatalogPanel } from "./ReadOnlyModelCatalogPanel";
import type { ProviderRoutingConsoleItem } from "../lib/providerRoutingConsole";
import type { ModelCatalog } from "../types";

/**
 * The system.models surface must be a read-only catalog: it renders the
 * already-sanitized routing projection + discovered models, never a mutation
 * control, never a credential field, never a fabricated row.
 */
function item(over: Partial<ProviderRoutingConsoleItem> = {}): ProviderRoutingConsoleItem {
  return {
    assignedAgentCount: 1,
    defaultModelLabel: "alpha-large",
    discoveryLabel: "모델 발견 완료",
    discoveryTone: "success",
    displayName: "Alpha Provider",
    enabledLabel: "사용 가능",
    enabledTone: "success",
    modelCount: 2,
    providerId: "provider_alpha",
    readinessLabel: "자동 점검",
    readinessTone: "success",
    routeLabel: "직접 경로",
    secretPolicyLabel: "서버 비밀값 참조 사용",
    trustLabel: "신뢰",
    trustTone: "success",
    ...over,
  };
}

const catalog: ModelCatalog = {
  provider_alpha: [
    { id: "m1", name: "alpha-large", providerProfileId: "provider_alpha", contextWindow: 200_000, supportsStreaming: true, supportsTools: true, tags: [] },
    { id: "m2", name: "alpha-mini", providerProfileId: "provider_alpha", supportsStreaming: true, supportsTools: false, tags: [] },
  ],
};

describe("ReadOnlyModelCatalogPanel", () => {
  it("renders providers and their models read-only from props", () => {
    const html = renderToStaticMarkup(<ReadOnlyModelCatalogPanel items={[item()]} modelCatalog={catalog} />);
    expect(html).toContain("Alpha Provider");
    expect(html).toContain("신뢰"); // trust label
    expect(html).toContain("alpha-large"); // model name from catalog
    expect(html).toContain("alpha-mini");
    expect(html).toContain("200K ctx"); // context window
    // missing credential / readiness is shown as status text only
    expect(html).toContain("서버 비밀값 참조 사용");
  });

  it("has no mutation controls (read-only: no buttons, no credential inputs)", () => {
    const html = renderToStaticMarkup(<ReadOnlyModelCatalogPanel items={[item()]} modelCatalog={catalog} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
  });

  it("renders an honest empty state when there are no providers", () => {
    const html = renderToStaticMarkup(<ReadOnlyModelCatalogPanel items={[]} modelCatalog={{}} />);
    expect(html).toContain("등록된 공급자가 없습니다");
  });

  it("renders an honest per-provider empty state when a provider has no models", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyModelCatalogPanel items={[item({ providerId: "provider_empty", modelCount: 0 })]} modelCatalog={{}} />,
    );
    expect(html).toContain("발견된 모델 없음");
  });
});
