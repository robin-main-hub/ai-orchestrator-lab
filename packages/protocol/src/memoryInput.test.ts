import { describe, expect, it } from "vitest";
import {
  memoryActivationStateSchema,
  memoryInputSchema,
  memoryKindSchema,
  memoryLayerSchema,
  memoryRelationKindSchema,
  memoryScopeSchema,
  memorySyncRequestSchema,
} from "./index.js";

// The memory INGESTION shapes (memoryInput = what a client may submit to be
// remembered; memorySyncRequest = the idempotent batch envelope) plus the memory
// taxonomy enums were never pinned — the full memoryRecord is, but its component
// vocabularies and the trimmed ingestion shapes are not. The FRESH authority
// angle here is INGESTION-AUTHORITY BOUNDARY: a client can describe a memory but
// cannot grant it privilege. (1) CLASSIFICATION VOCABS — layer (the five memory
// tiers), scope (global/project/session), kind (eight), relationKind (five), and
// activationState (inactive/suggested/active/quarantined — note "quarantined" is
// a server-assigned safety state). (2) INGESTION CANNOT SELF-PRIVILEGE — the
// memoryInput shape deliberately OMITS id / activationState / pinned / createdAt:
// it requires only layer/title/content/sourceChannel/trustLevel (scope, kind,
// projectId, sessionId, tags optional). Being a plain z.object, a client that
// tries to smuggle id / pinned / activationState gets those keys STRIPPED — the
// ingestion schema structurally cannot carry self-assigned identity, pinning, or
// (crucially) self-activation past the quarantine gate. (3) IDEMPOTENT BATCH
// ENVELOPE — memorySyncRequest requires an idempotencyKey (a replayed sync can't
// double-write) and embeds inputs by-value, so a batch transitively rejects a
// malformed input. Enum members read back via `.options`.

const input = {
  layer: "user_memory",
  title: "prefers terse replies",
  content: "no trailing summaries",
  sourceChannel: "desktop",
  trustLevel: "trusted",
};

const syncRequest = {
  id: "sync-1",
  clientId: "client-1",
  sessionId: "s-1",
  inputs: [input],
  idempotencyKey: "idem-1",
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("memory taxonomy — closed classification vocabularies", () => {
  it("layer admits exactly the five memory tiers in order", () => {
    expect(memoryLayerSchema.options).toEqual([
      "fragment",
      "episode",
      "reflection",
      "project_memory",
      "user_memory",
    ]);
  });

  it("scope / kind / relationKind admit exactly their declared vocabularies", () => {
    expect(memoryScopeSchema.options).toEqual(["global", "project", "session"]);
    expect(memoryKindSchema.options).toEqual([
      "preference",
      "architecture",
      "pattern",
      "decision",
      "context",
      "workflow",
      "relationship",
      "learning",
    ]);
    expect(memoryRelationKindSchema.options).toEqual([
      "related",
      "supports",
      "contradicts",
      "supersedes",
      "depends_on",
    ]);
  });

  it("activationState includes the server-assigned 'quarantined' safety state", () => {
    expect(memoryActivationStateSchema.options).toEqual([
      "inactive",
      "suggested",
      "active",
      "quarantined",
    ]);
    expect(memoryActivationStateSchema.safeParse("trusted").success).toBe(false);
  });
});

describe("memoryInput — ingestion cannot self-privilege", () => {
  it("accepts a minimal input (only layer/title/content/sourceChannel/trustLevel required)", () => {
    expect(memoryInputSchema.safeParse(input).success).toBe(true);
  });

  it("requires the core fields — a missing content fails", () => {
    const { content: _omit, ...without } = input;
    expect(memoryInputSchema.safeParse(without).success).toBe(false);
  });

  it("strips id / pinned / activationState — a client cannot self-assign identity, pinning, or activation", () => {
    const parsed = memoryInputSchema.parse({
      ...input,
      id: "forged-id",
      pinned: true,
      activationState: "active",
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    expect("id" in parsed).toBe(false);
    expect("pinned" in parsed).toBe(false);
    expect("activationState" in parsed).toBe(false);
    expect("createdAt" in parsed).toBe(false);
  });

  it("validates the embedded layer/sourceChannel/trust vocabularies", () => {
    expect(memoryInputSchema.safeParse({ ...input, layer: "bogus" }).success).toBe(false);
    expect(memoryInputSchema.safeParse({ ...input, sourceChannel: "smtp" }).success).toBe(false);
    expect(memoryInputSchema.safeParse({ ...input, trustLevel: "root" }).success).toBe(false);
  });
});

describe("memorySyncRequest — idempotent batch envelope", () => {
  it("accepts a well-formed sync request", () => {
    expect(memorySyncRequestSchema.safeParse(syncRequest).success).toBe(true);
  });

  it("requires the idempotencyKey so a replayed sync cannot double-write", () => {
    const { idempotencyKey: _omit, ...without } = syncRequest;
    expect(memorySyncRequestSchema.safeParse(without).success).toBe(false);
  });

  it("transitively rejects a batch carrying a malformed input (by-value embed)", () => {
    expect(
      memorySyncRequestSchema.safeParse({ ...syncRequest, inputs: [{ ...input, layer: "bogus" }] }).success,
    ).toBe(false);
  });
});
