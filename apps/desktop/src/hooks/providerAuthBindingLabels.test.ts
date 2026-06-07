import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { createAuthBinding } from "./useProviderRegistryController";

const apiProvider: ProviderProfile = {
  baseUrl: "https://api.example.test/v1",
  defaultModel: "model-a",
  enabled: true,
  id: "provider_api",
  kind: "openai",
  name: "API Provider",
  secretRef: {
    label: "API Provider Key",
    id: "secret_api",
    redactedPreview: "sk-...",
    scope: "profile",
    transient: false,
  },
  tags: [],
  trustLevel: "trusted",
};

const oauthProvider: ProviderProfile = {
  ...apiProvider,
  id: "provider_oauth",
  tags: ["oauth"],
};

describe("provider auth binding labels", () => {
  it("uses Korean labels for missing, local, API, and OAuth auth states", () => {
    expect(createAuthBinding()).toMatchObject({
      label: "인증 정보 대기",
      mode: "provider_profile",
    });
    expect(createAuthBinding({ ...apiProvider, id: "provider_mock_local" })).toMatchObject({
      label: "로컬 런타임",
      mode: "local",
    });
    expect(createAuthBinding(apiProvider)).toMatchObject({
      label: "API 비밀키 참조",
      mode: "provider_profile",
    });
    expect(createAuthBinding(oauthProvider)).toMatchObject({
      label: "OAuth/API 프로필",
      mode: "oauth",
    });
  });
});
