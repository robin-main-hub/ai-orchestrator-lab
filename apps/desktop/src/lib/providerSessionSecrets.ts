import { providerSessionSecretsStorageKey } from "./appConstants";

type SessionSecretStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function parseProviderSessionSecrets(raw: string | null): Record<string, string> {
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
        const secret = value.trim();
        return secret ? [[providerId, secret]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function readProviderSessionSecrets(storage?: SessionSecretStorage): Record<string, string> {
  if (!storage) {
    return {};
  }

  return parseProviderSessionSecrets(storage.getItem(providerSessionSecretsStorageKey));
}

export function writeProviderSessionSecrets(
  storage: SessionSecretStorage | undefined,
  secrets: Record<string, string>,
) {
  if (!storage) {
    return;
  }

  const normalized = Object.fromEntries(
    Object.entries(secrets).flatMap(([providerId, value]) => {
      const secret = value.trim();
      return secret ? [[providerId, secret]] : [];
    }),
  );

  if (Object.keys(normalized).length === 0) {
    storage.removeItem(providerSessionSecretsStorageKey);
    return;
  }

  storage.setItem(providerSessionSecretsStorageKey, JSON.stringify(normalized));
}
