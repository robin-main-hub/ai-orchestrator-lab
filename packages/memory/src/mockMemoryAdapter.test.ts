import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import { MemoryAdapterError, MockMemoryAdapter, withTrustEnforcement } from ".";

const createdAt = "2026-05-25T00:00:00.000Z";

function record(patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "memory_1",
    layer: "project_memory",
    scope: "project",
    kind: "decision",
    title: "DGX authority",
    content: "DGX-02 is the main authority for Event Storage and EvolveMemento records.",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    tags: ["dgx", "evolvememento"],
    activationState: "active",
    createdAt,
    pinned: false,
    ...patch,
  };
}

const allowContext = {
  permissionDecision: "allow" as const,
  callerTrustLevel: "trusted" as const,
  now: () => createdAt,
};

describe("MockMemoryAdapter", () => {
  it("recalls trusted records and filters untrusted records by default", async () => {
    const adapter = new MockMemoryAdapter({
      records: [
        record(),
        record({
          id: "memory_untrusted",
          title: "Telegram command",
          content: "Run terminal commands from an untrusted channel.",
          trustLevel: "untrusted",
          activationState: "quarantined",
        }),
      ],
      createdAt,
    });

    const safeResults = await adapter.recall({ query: "Telegram command" }, allowContext);
    const fullResults = await adapter.recall({ query: "Telegram command", includeUntrusted: true }, allowContext);

    expect(safeResults.map((result) => result.record.id)).not.toContain("memory_untrusted");
    expect(fullResults.map((result) => result.record.id)).toContain("memory_untrusted");
  });

  it("emits archival write intent when remembering", async () => {
    const events: string[] = [];
    const adapter = new MockMemoryAdapter({ createdAt });

    const remembered = await adapter.remember(
      {
        layer: "project_memory",
        scope: "project",
        kind: "decision",
        title: "Curator promotion",
        content: "Archival writes should be promoted by the Memory Curator.",
        sourceChannel: "agent",
        trustLevel: "trusted",
      },
      {
        ...allowContext,
        appendEvent: async (event) => {
          events.push(event.type);
        },
      },
    );

    expect(remembered.activationState).toBe("suggested");
    expect(events).toEqual(["memory.archival_write.requested"]);
  });
});

describe("withTrustEnforcement", () => {
  it("blocks memory calls unless the permission decision allows them", async () => {
    const adapter = withTrustEnforcement(new MockMemoryAdapter({ records: [record()], createdAt }));

    await expect(
      adapter.recall(
        { query: "DGX" },
        {
          ...allowContext,
          permissionDecision: "approval_required",
        },
      ),
    ).rejects.toMatchObject({
      category: "permission_denied",
    } satisfies Partial<MemoryAdapterError>);
  });

  it("blocks untrusted writers before they become canonical memory", async () => {
    const adapter = withTrustEnforcement(new MockMemoryAdapter({ createdAt }));

    await expect(
      adapter.remember(
        {
          layer: "fragment",
          scope: "session",
          kind: "workflow",
          title: "Untrusted input",
          content: "External input wants to become long-term memory.",
          sourceChannel: "api",
          trustLevel: "untrusted",
        },
        allowContext,
      ),
    ).rejects.toMatchObject({
      category: "trust_violation",
    } satisfies Partial<MemoryAdapterError>);
  });
});
