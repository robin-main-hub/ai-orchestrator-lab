import { describe, expect, it, vi } from "vitest";
import {
  legacyProviderSessionSecretsStorageKey,
  providerDefaultCredentialsStorageKey,
} from "./appConstants";
import {
  createMimoTokenPlanDefaultCredentials,
  parseProviderDefaultCredentials,
  readProviderDefaultCredentials,
  writeProviderDefaultCredentials,
} from "./providerDefaultCredentials";

describe("provider default credentials", () => {
  it("깨진 JSON과 빈 credential은 무시한다", () => {
    expect(parseProviderDefaultCredentials("{")).toEqual({});
    expect(parseProviderDefaultCredentials(JSON.stringify({ provider_a: "   ", provider_b: " key-b " }))).toEqual({
      provider_b: "key-b",
    });
  });

  it("localStorage에서 provider별 기본 인증값을 복원한다", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ provider_mimo_token_openai: "default-key" })),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    expect(readProviderDefaultCredentials({ persistentStorage: storage })).toEqual({
      provider_mimo_token_openai: "default-key",
    });
    expect(storage.getItem).toHaveBeenCalledWith(providerDefaultCredentialsStorageKey);
  });

  it("MiMo Token Plan 기본 인증값을 두 호환 provider에 함께 매핑한다", () => {
    expect(createMimoTokenPlanDefaultCredentials(" mimo-key ")).toEqual({
      provider_mimo_token_anthropic: "mimo-key",
      provider_mimo_token_openai: "mimo-key",
    });
    expect(createMimoTokenPlanDefaultCredentials("   ")).toEqual({});
  });

  it("환경 기본 인증값은 기존 localStorage 값을 덮어쓰지 않고 빠진 MiMo provider만 채운다", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ provider_mimo_token_openai: "user-key" })),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    expect(
      readProviderDefaultCredentials({
        fallbackCredentials: createMimoTokenPlanDefaultCredentials("env-key"),
        persistentStorage: storage,
      }),
    ).toEqual({
      provider_mimo_token_anthropic: "env-key",
      provider_mimo_token_openai: "user-key",
    });
    expect(storage.setItem).toHaveBeenCalledWith(providerDefaultCredentialsStorageKey, expect.any(String));
    expect(JSON.parse(storage.setItem.mock.calls[0]?.[1] ?? "{}")).toEqual({
      provider_mimo_token_anthropic: "env-key",
      provider_mimo_token_openai: "user-key",
    });
  });

  it("기존 sessionStorage 저장값을 localStorage 기본 인증값으로 마이그레이션한다", () => {
    const persistentStorage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    const legacySessionStorage = {
      getItem: vi.fn(() => JSON.stringify({ provider_mimo_token_openai: " migrated-key " })),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    expect(readProviderDefaultCredentials({ persistentStorage, legacySessionStorage })).toEqual({
      provider_mimo_token_openai: "migrated-key",
    });
    expect(persistentStorage.setItem).toHaveBeenCalledWith(
      providerDefaultCredentialsStorageKey,
      JSON.stringify({ provider_mimo_token_openai: "migrated-key" }),
    );
    expect(legacySessionStorage.removeItem).toHaveBeenCalledWith(legacyProviderSessionSecretsStorageKey);
  });

  it("키 원문을 Git 저장소가 아닌 localStorage 기본값에만 쓴다", () => {
    const storage = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    writeProviderDefaultCredentials(storage, {
      provider_mimo_token_openai: " default-key ",
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      providerDefaultCredentialsStorageKey,
      JSON.stringify({ provider_mimo_token_openai: "default-key" }),
    );
  });

  it("모든 기본 인증값이 비면 저장값을 제거한다", () => {
    const storage = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    writeProviderDefaultCredentials(storage, {});

    expect(storage.removeItem).toHaveBeenCalledWith(providerDefaultCredentialsStorageKey);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("localStorage quota가 가득 차도 앱 시작을 막지 않는다", () => {
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("quota", "QuotaExceededError");
      }),
    };

    expect(() =>
      readProviderDefaultCredentials({
        fallbackCredentials: createMimoTokenPlanDefaultCredentials("env-key"),
        persistentStorage: storage,
      }),
    ).not.toThrow();
    expect(
      readProviderDefaultCredentials({
        fallbackCredentials: createMimoTokenPlanDefaultCredentials("env-key"),
        persistentStorage: storage,
      }),
    ).toEqual({
      provider_mimo_token_anthropic: "env-key",
      provider_mimo_token_openai: "env-key",
    });
  });
});
