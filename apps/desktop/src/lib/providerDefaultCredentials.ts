import {
  legacyProviderSessionSecretsStorageKey,
  providerDefaultCredentialsStorageKey,
} from "./appConstants";

type CredentialStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

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

export function readProviderDefaultCredentials({
  legacySessionStorage,
  persistentStorage,
}: {
  legacySessionStorage?: CredentialStorage;
  persistentStorage?: CredentialStorage;
}): Record<string, string> {
  if (!persistentStorage) {
    return {};
  }

  const persisted = parseProviderDefaultCredentials(
    persistentStorage.getItem(providerDefaultCredentialsStorageKey),
  );
  if (Object.keys(persisted).length > 0) {
    return persisted;
  }

  const legacy = parseProviderDefaultCredentials(
    legacySessionStorage?.getItem(legacyProviderSessionSecretsStorageKey) ?? null,
  );
  if (Object.keys(legacy).length === 0) {
    return {};
  }

  writeProviderDefaultCredentials(persistentStorage, legacy);
  legacySessionStorage?.removeItem(legacyProviderSessionSecretsStorageKey);
  return legacy;
}

export function writeProviderDefaultCredentials(
  storage: CredentialStorage | undefined,
  credentials: Record<string, string>,
) {
  if (!storage) {
    return;
  }

  const normalized = Object.fromEntries(
    Object.entries(credentials).flatMap(([providerId, value]) => {
      const credential = value.trim();
      return credential ? [[providerId, credential]] : [];
    }),
  );

  if (Object.keys(normalized).length === 0) {
    storage.removeItem(providerDefaultCredentialsStorageKey);
    return;
  }

  storage.setItem(providerDefaultCredentialsStorageKey, JSON.stringify(normalized));
}
