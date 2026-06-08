import {
  legacyProviderSessionSecretsStorageKey,
  providerDefaultCredentialsStorageKey,
} from "./appConstants";

type CredentialStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const mimoTokenPlanProviderIds = [
  "provider_mimo_token_openai",
  "provider_mimo_token_anthropic",
] as const;

function normalizeProviderDefaultCredentials(
  credentials: Record<string, string> | undefined,
): Record<string, string> {
  if (!credentials) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(credentials).flatMap(([providerId, value]) => {
      const credential = value.trim();
      return credential ? [[providerId, credential]] : [];
    }),
  );
}

export function parseProviderDefaultCredentials(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([providerId, value]) => {
        if (typeof value !== "string") {
          return [];
        }
        const credential = value.trim();
        return credential ? [[providerId, credential]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function createMimoTokenPlanDefaultCredentials(
  rawCredential: string | null | undefined,
): Record<string, string> {
  const credential = rawCredential?.trim();
  if (!credential) {
    return {};
  }

  return Object.fromEntries(
    mimoTokenPlanProviderIds.map((providerId) => [providerId, credential]),
  );
}

export function readProviderDefaultCredentials({
  fallbackCredentials,
  legacySessionStorage,
  persistentStorage,
}: {
  fallbackCredentials?: Record<string, string>;
  legacySessionStorage?: CredentialStorage;
  persistentStorage?: CredentialStorage;
}): Record<string, string> {
  if (!persistentStorage) {
    return {};
  }

  const fallback = normalizeProviderDefaultCredentials(fallbackCredentials);
  const persisted = parseProviderDefaultCredentials(
    persistentStorage.getItem(providerDefaultCredentialsStorageKey),
  );
  if (Object.keys(persisted).length > 0) {
    const merged = {
      ...fallback,
      ...persisted,
    };
    if (Object.keys(merged).length > Object.keys(persisted).length) {
      writeProviderDefaultCredentials(persistentStorage, merged);
    }
    return merged;
  }

  const legacy = parseProviderDefaultCredentials(
    legacySessionStorage?.getItem(legacyProviderSessionSecretsStorageKey) ?? null,
  );
  if (Object.keys(legacy).length > 0) {
    const merged = {
      ...fallback,
      ...legacy,
    };
    writeProviderDefaultCredentials(persistentStorage, merged);
    legacySessionStorage?.removeItem(legacyProviderSessionSecretsStorageKey);
    return merged;
  }

  if (Object.keys(fallback).length > 0) {
    writeProviderDefaultCredentials(persistentStorage, fallback);
  }
  return fallback;
}

export function writeProviderDefaultCredentials(
  storage: CredentialStorage | undefined,
  credentials: Record<string, string>,
) {
  if (!storage) {
    return;
  }

  const normalized = normalizeProviderDefaultCredentials(credentials);

  if (Object.keys(normalized).length === 0) {
    try {
      storage.removeItem(providerDefaultCredentialsStorageKey);
    } catch {
      // Storage quota or privacy-mode failures must not block provider fallback.
    }
    return;
  }

  try {
    storage.setItem(providerDefaultCredentialsStorageKey, JSON.stringify(normalized));
  } catch {
    // Keep the in-memory credentials returned by readProviderDefaultCredentials.
    // A full localStorage should degrade persistence, not break chat startup.
  }
}
