import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { evaluateServerProviderCompletionPermission } from "./index";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "provider_completion_request_single_owner_policy",
    sessionId: "session_single_owner_policy",
    providerProfileId: "provider_claude_code_single_owner",
    modelId: "claude-cli-session",
    messages: [{ role: "user", content: "check this" }],
    source: "desktop",
    routePreference: "server_proxy",
    approvalState: "approved",
    requestContext: {
      userId: "owner-robin",
      routeType: "personal",
      humanInitiated: true,
    },
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

function withClaudeSingleOwnerEnv<T>(fn: () => T): T {
  const previousEnable = process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
  const previousOwner = process.env.CLAUDE_CODE_OWNER_USER_ID;
  process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER = "true";
  process.env.CLAUDE_CODE_OWNER_USER_ID = "owner-robin";
  try {
    return fn();
  } finally {
    if (previousEnable === undefined) delete process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
    else process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER = previousEnable;
    if (previousOwner === undefined) delete process.env.CLAUDE_CODE_OWNER_USER_ID;
    else process.env.CLAUDE_CODE_OWNER_USER_ID = previousOwner;
  }
}

describe("Claude Code single-owner provider policy", () => {
  it("allows the configured owner", () => {
    const permission = withClaudeSingleOwnerEnv(() => evaluateServerProviderCompletionPermission(baseRequest()));

    expect(permission.decision).toBe("allow");
  });

  it("blocks non-owner requests", () => {
    const permission = withClaudeSingleOwnerEnv(() =>
      evaluateServerProviderCompletionPermission(
        baseRequest({ requestContext: { userId: "other-user", routeType: "personal" } }),
      ),
    );

    expect(permission.decision).toBe("deny");
    expect(permission.reason).toContain("configured owner");
  });

  it("blocks shared routes even for the owner", () => {
    const permission = withClaudeSingleOwnerEnv(() =>
      evaluateServerProviderCompletionPermission(
        baseRequest({ requestContext: { userId: "owner-robin", routeType: "slack_bot" } }),
      ),
    );

    expect(permission.decision).toBe("deny");
    expect(permission.reason).toContain("slack_bot");
  });

  it("allows trusted remote devices for the configured owner", () => {
    const permission = withClaudeSingleOwnerEnv(() =>
      evaluateServerProviderCompletionPermission(
        baseRequest({
          requestContext: {
            userId: "owner-robin",
            routeType: "trusted_remote_device",
            trustedDeviceId: "tailscale-laptop",
            humanInitiated: true,
          },
        }),
      ),
    );

    expect(permission.decision).toBe("allow");
  });

  it("stays disabled until explicitly enabled", () => {
    const previousEnable = process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
    const previousOwner = process.env.CLAUDE_CODE_OWNER_USER_ID;
    delete process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
    process.env.CLAUDE_CODE_OWNER_USER_ID = "owner-robin";
    try {
      const permission = evaluateServerProviderCompletionPermission(baseRequest());
      expect(permission.decision).toBe("deny");
      expect(permission.reason).toContain("disabled");
    } finally {
      if (previousEnable === undefined) delete process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
      else process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER = previousEnable;
      if (previousOwner === undefined) delete process.env.CLAUDE_CODE_OWNER_USER_ID;
      else process.env.CLAUDE_CODE_OWNER_USER_ID = previousOwner;
    }
  });
});
