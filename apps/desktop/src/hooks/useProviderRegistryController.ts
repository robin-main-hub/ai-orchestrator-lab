import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProviderProfile,
  createProviderProfileFromCredentialInput,
  createProviderRuntimeReadiness,
  createSecretVaultSnapshot,
  discoverModelsForProfile,
  maskSecret,
} from "@ai-orchestrator/providers";
import type {
  EventEnvelope,
  ModelDiscoverySnapshot,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import type {
  ModelCatalog,
  ProviderRegistrationMode,
  WorkbenchAgent,
} from "../types";
import { providerProfilesStorageKey } from "../lib/appConstants";
import { slugifyProviderName } from "../lib/helpers";
import {
  createMimoTokenPlanDefaultCredentials,
  readProviderDefaultCredentials,
  writeProviderDefaultCredentials,
} from "../lib/providerDefaultCredentials";
import {
  createInitialProviderProfiles,
  createModelDiscoveryFromRegistryEntry,
  mergeProviderProfilesFromRegistry,
  seededModelCatalog,
} from "../seeds/providers";
import { isDgxRoutedProvider } from "../runtime/stage12DgxProvider";
import {
  fetchDgxProviderModelDiscovery,
  fetchDgxProviderRegistry,
} from "../runtime/stage13DgxServer";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type ProviderRegistryControllerInput = {
  activeProviderProfileId?: string;
  agents: WorkbenchAgent[];
  appendEvent: AppendWorkbenchEvent;
  runtimeUpdatedAt: string;
  selectedAgent?: WorkbenchAgent;
};

/**
 * Readiness sentinel for the Mimo server-proxy provider.
 * The client sends this non-secret value; the proxy overwrites it with the
 * real MIMO_TP_API_KEY from server-side env. The real key never reaches
 * the browser bundle.
 */
export const MIMO_MOCK_DEFAULT_TOKEN = "mimo-ready";

export function createAuthBinding(provider?: ProviderProfile): WorkbenchAgent["authBinding"] {
  if (!provider) {
    return {
      mode: "provider_profile",
      label: "인증 정보 대기",
    };
  }

  return {
    mode: provider.tags.includes("oauth") ? "oauth" : "provider_profile",
    label: provider.tags.includes("oauth") ? "OAuth/API 프로필" : "API 비밀키 참조",
    providerProfileId: provider.id,
    secretRefId: provider.secretRef?.id,
    oauthRef: provider.tags.includes("oauth") ? "oauth_pending" : undefined,
  };
}

export function useProviderRegistryController({
  activeProviderProfileId,
  agents,
  appendEvent,
  runtimeUpdatedAt,
  selectedAgent,
}: ProviderRegistryControllerInput) {
  const [providerRegistrationOpen, setProviderRegistrationOpen] = useState(false);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>(createInitialProviderProfiles);
  const [defaultCredentialsByProviderId, setDefaultCredentialsByProviderId] = useState<Record<string, string>>(() =>
    typeof window === "undefined"
      ? {}
      : readProviderDefaultCredentials({
          fallbackCredentials: createMimoTokenPlanDefaultCredentials(
            MIMO_MOCK_DEFAULT_TOKEN,
          ),
          legacySessionStorage: window.sessionStorage,
          persistentStorage: window.localStorage,
        }),
  );
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>(seededModelCatalog);
  const [modelDiscoveryByProviderId, setModelDiscoveryByProviderId] = useState<Record<string, ModelDiscoverySnapshot>>(
    {},
  );

  const activeProvider = useMemo(
    () => providerProfiles.find((profile) => profile.id === activeProviderProfileId),
    [activeProviderProfileId, providerProfiles],
  );

  const usedProviderIds = useMemo(
    () =>
      new Set(
        agents
          .map((agent) => agent.providerProfileId)
          .filter((providerId): providerId is string => Boolean(providerId)),
      ),
    [agents],
  );

  const selectedProvider = useMemo(
    () => {
      const mimoDefaultProvider = providerProfiles.find((profile) => profile.id === "provider_mimo_token_openai");
      return (
        providerProfiles.find((profile) => profile.id === selectedAgent?.providerProfileId) ??
        activeProvider ??
        mimoDefaultProvider ??
        providerProfiles[0]
      );
    },
    [activeProvider, providerProfiles, selectedAgent],
  );

  const selectedModel = useMemo(() => {
    const providerModels = selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [];
    return (
      providerModels.find((model) => model.id === selectedAgent?.modelId) ??
      providerModels.find((model) => model.id === selectedProvider?.defaultModel) ??
      providerModels[0]
    );
  }, [modelCatalog, selectedAgent, selectedProvider]);

  const defaultCredentialProviderIds = useMemo(
    () => new Set(Object.keys(defaultCredentialsByProviderId)),
    [defaultCredentialsByProviderId],
  );

  const secretVaultSnapshot = useMemo(
    () => createSecretVaultSnapshot(providerProfiles, runtimeUpdatedAt),
    [providerProfiles, runtimeUpdatedAt],
  );

  const providerReadiness = useMemo(
    () =>
      createProviderRuntimeReadiness({
        profile: selectedProvider,
        models: selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [],
        vault: secretVaultSnapshot,
        selectedModelId: selectedAgent?.modelId ?? selectedProvider?.defaultModel,
        createdAt: runtimeUpdatedAt,
      }),
    [modelCatalog, runtimeUpdatedAt, secretVaultSnapshot, selectedAgent, selectedProvider],
  );

  const mergeProviderModelDiscovery = useCallback((discovery: ModelDiscoverySnapshot) => {
    setModelCatalog((catalog) => ({
      ...catalog,
      [discovery.providerProfileId]: discovery.models,
    }));
    setModelDiscoveryByProviderId((discoveries) => ({
      ...discoveries,
      [discovery.providerProfileId]: discovery,
    }));
  }, []);

  const getProviderModelDiscoveryFallback = useCallback(
    (providerId: string, createdAt?: string) => {
      const provider = providerProfiles.find((profile) => profile.id === providerId);
      return provider ? discoverModelsForProfile(provider, createdAt) : undefined;
    },
    [providerProfiles],
  );

  const registerProviderProfile = useCallback(
    (nextProvider: ProviderProfile, registrationMode: ProviderRegistrationMode) => {
      const discovery = discoverModelsForProfile(nextProvider);
      setProviderProfiles((profiles) => [...profiles, nextProvider]);
      mergeProviderModelDiscovery(discovery);
      appendEvent("provider.profile.imported", {
        providerProfileId: nextProvider.id,
        kind: nextProvider.kind,
        trustLevel: nextProvider.trustLevel,
        secretRef: nextProvider.secretRef?.redactedPreview ?? "pending",
        registrationMode,
        modelCount: discovery.models.length,
      });
      appendEvent("provider.models.discovered", {
        providerProfileId: nextProvider.id,
        status: discovery.status,
        modelCount: discovery.models.length,
        source: discovery.source,
        redactionApplied: discovery.redactionApplied,
      });
      setProviderRegistrationOpen(false);
    },
    [appendEvent, mergeProviderModelDiscovery],
  );

  const handleRegisterProvider = useCallback(
    (mode: ProviderRegistrationMode) => {
      const nextIndex = providerProfiles.length + 1;

      if (mode === "api_key") {
        const rawInput = window.prompt(
          "API key / env / Claude Code JSON 붙여넣기",
          'export ANTHROPIC_BASE_URL="https://api.apikey.fun"\nexport ANTHROPIC_AUTH_TOKEN=""',
        );

        if (rawInput === null) {
          return;
        }

        const nextProvider =
          rawInput.trim().length > 0
            ? createProviderProfileFromCredentialInput({
                id: `provider_custom_${crypto.randomUUID()}`,
                rawInput,
              }).profile
            : createProviderProfile({
                id: `provider_custom_${crypto.randomUUID()}`,
                name: `Custom Provider ${nextIndex}`,
                kind: "custom",
                baseUrl: "https://api.example.local/v1",
                defaultModel: `custom-model-${nextIndex}`,
                tags: ["custom"],
                trustLevel: "limited",
              });
        registerProviderProfile(nextProvider, "api_key");
        return;
      }

      if (mode === "cli") {
        const rawName = window.prompt("CLI 이름 또는 세션 이름", `Codex CLI ${nextIndex}`);

        if (rawName === null) {
          return;
        }

        const name = rawName.trim() || `Codex CLI ${nextIndex}`;
        const slug = slugifyProviderName(name, `cli-${nextIndex}`);
        registerProviderProfile(
          createProviderProfile({
            id: `provider_cli_${crypto.randomUUID()}`,
            name,
            kind: "custom",
            defaultModel: `${slug}-session`,
            tags: ["cli", "local"],
            trustLevel: "trusted",
          }),
          "cli",
        );
        return;
      }

      const rawName = window.prompt("OAuth 세션 이름", `Codex OAuth ${nextIndex}`);

      if (rawName === null) {
        return;
      }

      const name = rawName.trim() || `Codex OAuth ${nextIndex}`;
      const slug = slugifyProviderName(name, `oauth-${nextIndex}`);
      registerProviderProfile(
        createProviderProfile({
          id: `provider_oauth_${crypto.randomUUID()}`,
          name,
          kind: "custom",
          defaultModel: `${slug}-session`,
          tags: ["oauth", "session"],
          trustLevel: "trusted",
        }),
        "oauth",
      );
    },
    [providerProfiles.length, registerProviderProfile],
  );

  const handleAddProvider = useCallback(() => {
    handleRegisterProvider("api_key");
  }, [handleRegisterProvider]);

  const handleBindProviderDefaultCredential = useCallback(
    (providerId: string) => {
      const provider = providerProfiles.find((profile) => profile.id === providerId);
      if (!provider) {
        return;
      }

      const rawSecret = window.prompt(
        `${provider.name} 기본 API 키 붙여넣기`,
        "",
      );
      if (rawSecret === null) {
        return;
      }

      const trimmedSecret = rawSecret.trim();
      if (!trimmedSecret) {
        setDefaultCredentialsByProviderId((current) => {
          const { [providerId]: _removed, ...rest } = current;
          writeProviderDefaultCredentials(window.localStorage, rest);
          return rest;
        });
        appendEvent("provider.default_credential.cleared", {
          providerProfileId: provider.id,
          rawSecretPersisted: true,
        });
        return;
      }

      setDefaultCredentialsByProviderId((current) => {
        const next = {
          ...current,
          [providerId]: trimmedSecret,
        };
        writeProviderDefaultCredentials(window.localStorage, next);
        return next;
      });
      appendEvent("provider.default_credential.bound", {
        providerProfileId: provider.id,
        secretRefId: provider.secretRef?.id,
        redactedPreview: maskSecret(trimmedSecret),
        rawSecretPersisted: true,
      });
    },
    [appendEvent, providerProfiles],
  );

  const resolveProviderDefaultCredential = useCallback(
    (provider: ProviderProfile) => defaultCredentialsByProviderId[provider.id],
    [defaultCredentialsByProviderId],
  );

  const handleDiscoverProviderModels = useCallback(
    async (providerId: string) => {
      const provider = providerProfiles.find((profile) => profile.id === providerId);
      if (!provider) {
        return;
      }

      const localDiscovery = discoverModelsForProfile(provider);
      let discovery = localDiscovery;
      let route: "dgx_provider_proxy" | "local_adapter" = "local_adapter";
      if (isDgxRoutedProvider(provider)) {
        try {
          discovery = await fetchDgxProviderModelDiscovery({ provider });
          route = "dgx_provider_proxy";
        } catch (error) {
          discovery = {
            ...localDiscovery,
            warnings: [
              ...localDiscovery.warnings,
              `DGX-02 provider model discovery failed; using local adapter metadata: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ],
          };
          appendEvent("provider.models.discovery_failed", {
            providerProfileId: provider.id,
            route: "dgx_provider_proxy",
            error: error instanceof Error ? error.message : String(error),
            fallback: "local_adapter",
          });
        }
      }
      mergeProviderModelDiscovery(discovery);
      setProviderProfiles((profiles) =>
        profiles.map((profile) =>
          profile.id === provider.id
            ? {
                ...profile,
                defaultModel: discovery.selectedModelId ?? profile.defaultModel,
                modelDiscoveryEndpoint: profile.modelDiscoveryEndpoint ?? provider.modelDiscoveryEndpoint,
              }
            : profile,
        ),
      );
      appendEvent("provider.models.discovered", {
        providerProfileId: provider.id,
        status: discovery.status,
        modelCount: discovery.models.length,
        source: discovery.source,
        route,
        redactionApplied: discovery.redactionApplied,
        warnings: discovery.warnings,
      });
    },
    [appendEvent, mergeProviderModelDiscovery, providerProfiles],
  );

  const refreshDgxProviderRegistry = useCallback(
    async (trigger: string, options: { quiet?: boolean } = {}) => {
      try {
        const registry = await fetchDgxProviderRegistry();
        setProviderProfiles((profiles) => mergeProviderProfilesFromRegistry(profiles, registry));
        setModelCatalog((catalog) => ({
          ...catalog,
          ...Object.fromEntries(
            registry.entries.map((entry) => [
              entry.providerProfileId,
              createModelDiscoveryFromRegistryEntry(entry).models,
            ]),
          ),
        }));
        setModelDiscoveryByProviderId((discoveries) => ({
          ...discoveries,
          ...Object.fromEntries(
            registry.entries.map((entry) => [
              entry.providerProfileId,
              createModelDiscoveryFromRegistryEntry(entry),
            ]),
          ),
        }));
        appendEvent(options.quiet ? "provider.registry.refreshed" : "provider.registry.loaded", {
          registryId: registry.id,
          authorityNodeId: registry.authorityNodeId,
          trigger,
          summary: registry.summary,
          entries: registry.entries.map((entry) => ({
            providerProfileId: entry.providerProfileId,
            name: entry.name,
            authMode: entry.authMode,
            secretAvailability: entry.secretAvailability,
            secretRefPreview: entry.secretRefPreview,
            defaultModelIds: entry.defaultModelIds,
            rawSecretPersisted: false,
          })),
        });
        return registry;
      } catch (error) {
        appendEvent("provider.registry.failed", {
          authorityNodeId: "dgx-02",
          trigger,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    },
    [appendEvent],
  );

  const handleCheckProviderVault = useCallback(async () => {
    appendEvent("secret.vault.checked", {
      snapshotId: secretVaultSnapshot.id,
      available: secretVaultSnapshot.summary.available,
      missing: secretVaultSnapshot.summary.missing,
      transient: secretVaultSnapshot.summary.transient,
      rawSecretPersisted: secretVaultSnapshot.rawSecretPersisted,
    });
    appendEvent("provider.runtime.readiness.checked", {
      readinessId: providerReadiness.id,
      providerProfileId: providerReadiness.providerProfileId,
      status: providerReadiness.status,
      executionMode: providerReadiness.executionMode,
      canRunCompletion: providerReadiness.canRunCompletion,
      canUseAutomaticMemory: providerReadiness.canUseAutomaticMemory,
      reason: providerReadiness.reason,
    });

    await refreshDgxProviderRegistry("manual_provider_vault");
  }, [appendEvent, providerReadiness, refreshDgxProviderRegistry, secretVaultSnapshot]);

  const handleRemoveProvider = useCallback(
    (providerId: string) => {
      const isInUse = agents.some((agent) => agent.providerProfileId === providerId);
      if (providerProfiles.length <= 1 || isInUse) {
        return;
      }

      setProviderProfiles((profiles) => profiles.filter((profile) => profile.id !== providerId));
      setModelCatalog((catalog) => {
        const { [providerId]: _removedModels, ...remainingCatalog } = catalog;
        return remainingCatalog;
      });
      setModelDiscoveryByProviderId((discoveries) => {
        const { [providerId]: _removedDiscovery, ...remainingDiscoveries } = discoveries;
        return remainingDiscoveries;
      });
      appendEvent("provider.profile.removed", {
        providerProfileId: providerId,
        inUse: false,
        rawSecretPersisted: false,
      });
    },
    [agents, appendEvent, providerProfiles.length],
  );

  const handleRenameProvider = useCallback(
    (providerId: string) => {
      const provider = providerProfiles.find((profile) => profile.id === providerId);
      const nextName = window.prompt("Provider 이름", provider?.name ?? "");
      if (!nextName?.trim()) {
        return;
      }

      setProviderProfiles((profiles) =>
        profiles.map((profile) => (profile.id === providerId ? { ...profile, name: nextName.trim() } : profile)),
      );
      appendEvent("provider.profile.renamed", {
        providerProfileId: providerId,
        previousName: provider?.name,
        nextName: nextName.trim(),
        rawSecretPersisted: false,
      });
    },
    [appendEvent, providerProfiles],
  );

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(providerProfilesStorageKey, JSON.stringify(providerProfiles));
      }
    } catch {
      // Provider entries are also represented as Event Storage records; localStorage is only a client cache.
    }
  }, [providerProfiles]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let lastProviderRegistryRefreshAt = 0;
    const refreshWithThrottle = (trigger: string) => {
      const currentTime = Date.now();
      if (currentTime - lastProviderRegistryRefreshAt < 10_000) {
        return;
      }

      lastProviderRegistryRefreshAt = currentTime;
      void refreshDgxProviderRegistry(trigger, { quiet: true });
    };
    const handleWindowFocus = () => refreshWithThrottle("window_focus");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshWithThrottle("visibility_visible");
      }
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshWithThrottle("interval");
      }
    }, 120_000);

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshDgxProviderRegistry]);

  return {
    activeProvider,
    handleAddProvider,
    handleBindProviderDefaultCredential,
    handleCheckProviderVault,
    handleDiscoverProviderModels,
    handleRegisterProvider,
    handleRemoveProvider,
    handleRenameProvider,
    getProviderModelDiscoveryFallback,
    mergeProviderModelDiscovery,
    modelCatalog,
    modelDiscoveryByProviderId,
    providerProfiles,
    providerReadiness,
    providerRegistrationOpen,
    refreshDgxProviderRegistry,
    resolveProviderDefaultCredential,
    secretVaultSnapshot,
    selectedModel,
    selectedProvider,
    defaultCredentialProviderIds,
    setProviderRegistrationOpen,
    usedProviderIds,
  };
}
