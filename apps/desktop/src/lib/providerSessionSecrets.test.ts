import { describe, expect, it, vi } from "vitest";
import { providerSessionSecretsStorageKey } from "./appConstants";
import {
  parseProviderSessionSecrets,
  readProviderSessionSecrets,
  writeProviderSessionSecrets,
} from "./providerSessionSecrets";

describe("provider session secrets", () => {
  it("깨진 JSON과 빈 secret은 무시한다", () => {
    expect(parseProviderSessionSecrets("{")).toEqual({});
    expect(parseProviderSessionSecrets(JSON.stringify({ provider_a: "   ", provider_b: " key-b " }))).toEqual({
      provider_b: "key-b",
    });
  });

  it("sessionStorage에서 provider별 세션 키를 복원한다", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ provider_mimo_token_openai: "session-key" })),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    expect(readProviderSessionSecrets(storage)).toEqual({
      provider_mimo_token_openai: "session-key",
    });
    expect(storage.getItem).toHaveBeenCalledWith(providerSessionSecretsStorageKey);
  });

  it("키 원문을 Git 저장소가 아닌 sessionStorage에만 쓴다", () => {
    const storage = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    writeProviderSessionSecrets(storage, {
      provider_mimo_token_openai: " session-key ",
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      providerSessionSecretsStorageKey,
      JSON.stringify({ provider_mimo_token_openai: "session-key" }),
    );
  });

  it("모든 세션 키가 비면 저장값을 제거한다", () => {
    const storage = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    writeProviderSessionSecrets(storage, {});

    expect(storage.removeItem).toHaveBeenCalledWith(providerSessionSecretsStorageKey);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
