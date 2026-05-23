import type {
  ModelDescriptor,
  ProviderKind,
  ProviderProfile,
  SecretRef,
} from "@ai-orchestrator/protocol";

export type ProviderChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ProviderCompletionRequest = {
  modelId: string;
  messages: ProviderChatMessage[];
  temperature?: number;
};

export type ProviderCompletionResult = {
  content: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type ProviderAdapter = {
  profile: ProviderProfile;
  discoverModels(): Promise<ModelDescriptor[]>;
  complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult>;
};

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "*".repeat(trimmed.length);
  }

  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

export function createSessionSecretRef(rawSecret: string, label = "세션 임시 키"): SecretRef {
  return {
    id: `secret_${crypto.randomUUID()}`,
    label,
    scope: "session",
    redactedPreview: maskSecret(rawSecret),
    transient: true,
    createdAt: new Date().toISOString(),
  };
}

export function createProviderProfile(params: {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  rawSecret?: string;
  defaultModel?: string;
  tags?: string[];
  trustLevel?: ProviderProfile["trustLevel"];
}): ProviderProfile {
  return {
    id: params.id,
    name: params.name,
    kind: params.kind,
    baseUrl: params.baseUrl,
    secretRef: params.rawSecret ? createSessionSecretRef(params.rawSecret) : undefined,
    defaultModel: params.defaultModel,
    enabled: true,
    tags: params.tags ?? [],
    trustLevel: params.trustLevel ?? "limited",
  };
}

export class MockProviderAdapter implements ProviderAdapter {
  readonly profile: ProviderProfile;

  constructor(profile?: Partial<ProviderProfile>) {
    this.profile = {
      id: "provider_mock_local",
      name: "Mock Local Provider",
      kind: "custom",
      enabled: true,
      tags: ["mock", "local"],
      trustLevel: "trusted",
      defaultModel: "mock-orchestrator",
      ...profile,
    };
  }

  async discoverModels(): Promise<ModelDescriptor[]> {
    return [
      {
        id: "mock-orchestrator",
        name: "Mock Orchestrator",
        providerProfileId: this.profile.id,
        contextWindow: 128_000,
        supportsStreaming: true,
        supportsTools: false,
        tags: ["conversation", "debate"],
      },
      {
        id: "mock-reviewer",
        name: "Mock Reviewer",
        providerProfileId: this.profile.id,
        contextWindow: 64_000,
        supportsStreaming: false,
        supportsTools: false,
        tags: ["review", "verification"],
      },
    ];
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult> {
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user");

    return {
      content: `mock:${lastUserMessage?.content ?? "empty"}`,
      modelId: request.modelId,
      usage: {
        inputTokens: request.messages.reduce((sum, message) => sum + message.content.length, 0),
        outputTokens: 16,
      },
    };
  }
}
