import type { ProviderProfile } from "@ai-orchestrator/protocol";

export function selectQuickSwitchProviders({
  defaultCredentialProviderIds,
  providers,
  selectedProviderId,
}: {
  defaultCredentialProviderIds: Set<string>;
  providers: ProviderProfile[];
  selectedProviderId?: string;
}) {
  return providers.filter((provider) => {
    if (!provider.enabled) return false;
    if (provider.id === "provider_mock_local" || provider.tags.includes("mock")) return false;
    if (provider.id === selectedProviderId) return true;
    if (defaultCredentialProviderIds.has(provider.id)) return true;
    if (provider.tags.includes("oauth")) return true;
    if (provider.secretRef && !provider.secretRef.transient) return true;
    return false;
  });
}
