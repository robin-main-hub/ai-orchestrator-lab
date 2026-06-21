import { describe, expect, it } from "vitest";
import type { MemoryAPI } from "@ai-orchestrator/protocol";
import { MemoryApiAdapter, type MemoryAdapter, type MemoryAdapterContext } from "./adapter.js";

// MemoryApiAdapter is the thin bridge that exposes a protocol MemoryAPI as a
// MemoryAdapter. It was never pinned (its sibling adapters all have contract
// tests, but this raw passthrough class did not). Three authority facts: (1)
// FAITHFUL 1:1 DELEGATION — every adapter method forwards to the SAME-named
// MemoryAPI method, passing the primary argument straight through and returning
// the API's promise verbatim (same reference), adding no logic of its own. (2)
// CONTEXT-AGNOSTIC PASSTHROUGH — the adapter signatures accept a
// MemoryAdapterContext but DROP it: the wrapped MemoryAPI never receives ctx, so
// this layer enforces NO trust/permission itself (that is precisely why
// withTrustEnforcement exists to wrap it). (3) IDENTITY + KIND DEFAULT —
// profileId is the constructor id verbatim and kind defaults to
// "local_heuristic" when omitted, otherwise the supplied kind. All expected
// values come from a recording stub MemoryAPI (no network, no real backend).

type Call = { method: string; arg: unknown };

function recordingApi() {
  const calls: Call[] = [];
  // distinct sentinel return values so passthrough can be asserted by reference
  const ret = {
    recall: [{ sentinel: "recall" }],
    remember: { sentinel: "remember" },
    memoryContext: { sentinel: "memoryContext" },
    stats: { sentinel: "stats" },
    createRelations: [{ sentinel: "createRelations" }],
    activateMemories: undefined,
    pin: undefined,
    forget: undefined,
    reflect: { sentinel: "reflect" },
  };
  const api = {
    recall: async (q: unknown) => (calls.push({ method: "recall", arg: q }), ret.recall),
    remember: async (i: unknown) => (calls.push({ method: "remember", arg: i }), ret.remember),
    memoryContext: async (q: unknown) => (calls.push({ method: "memoryContext", arg: q }), ret.memoryContext),
    stats: async () => (calls.push({ method: "stats", arg: undefined }), ret.stats),
    createRelations: async (ids: unknown) => (calls.push({ method: "createRelations", arg: ids }), ret.createRelations),
    activateMemories: async (ids: unknown) => (calls.push({ method: "activateMemories", arg: ids }), ret.activateMemories),
    pin: async (id: unknown) => (calls.push({ method: "pin", arg: id }), ret.pin),
    forget: async (id: unknown) => (calls.push({ method: "forget", arg: id }), ret.forget),
    reflect: async (s: unknown) => (calls.push({ method: "reflect", arg: s }), ret.reflect),
  } as unknown as MemoryAPI;
  return { api, calls, ret };
}

const CTX = { permissionDecision: "allow", callerTrustLevel: "trusted" } as MemoryAdapterContext;

describe("MemoryApiAdapter — faithful 1:1 delegation, context-agnostic", () => {
  it("forwards each method to the same-named MemoryAPI method, returning its result verbatim", async () => {
    const { api, calls, ret } = recordingApi();
    // consumed via the MemoryAdapter interface (2-arg signatures); the concrete
    // class drops ctx at runtime, which is exactly what we assert below.
    const a: MemoryAdapter = new MemoryApiAdapter("profile-x", api);

    expect(await a.recall({ q: 1 } as never, CTX)).toBe(ret.recall);
    expect(await a.remember({ i: 1 } as never, CTX)).toBe(ret.remember);
    expect(await a.memoryContext({ q: 2 } as never, CTX)).toBe(ret.memoryContext);
    expect(await a.stats(CTX)).toBe(ret.stats);
    expect(await a.createRelations(["a", "b"], CTX)).toBe(ret.createRelations);
    await a.activateMemories(["c"], CTX);
    await a.pin("p1", CTX);
    await a.forget("f1", CTX);
    expect(await a.reflect!("sess", CTX)).toBe(ret.reflect);

    // every adapter method hit exactly its same-named API method, in order, with the primary arg
    expect(calls).toEqual([
      { method: "recall", arg: { q: 1 } },
      { method: "remember", arg: { i: 1 } },
      { method: "memoryContext", arg: { q: 2 } },
      { method: "stats", arg: undefined },
      { method: "createRelations", arg: ["a", "b"] },
      { method: "activateMemories", arg: ["c"] },
      { method: "pin", arg: "p1" },
      { method: "forget", arg: "f1" },
      { method: "reflect", arg: "sess" },
    ]);
  });

  it("drops the MemoryAdapterContext — the wrapped API never receives it (no trust/permission layer here)", async () => {
    let sawExtraArg = false;
    const api = {
      recall: async (...args: unknown[]) => {
        sawExtraArg = args.length > 1; // adapter must pass ONLY the query, not ctx
        return [];
      },
    } as unknown as MemoryAPI;
    const a: MemoryAdapter = new MemoryApiAdapter("p", api);
    await a.recall({ q: 1 } as never, CTX);
    expect(sawExtraArg).toBe(false);
  });
});

describe("MemoryApiAdapter — identity + kind default", () => {
  it("exposes the constructor profileId verbatim and defaults kind to local_heuristic", () => {
    const { api } = recordingApi();
    const a = new MemoryApiAdapter("profile-42", api);
    expect(a.profileId).toBe("profile-42");
    expect(a.kind).toBe("local_heuristic"); // default when kind omitted
  });

  it("uses a supplied kind when given", () => {
    const { api } = recordingApi();
    expect(new MemoryApiAdapter("p", api, "dgx_simplemem").kind).toBe("dgx_simplemem");
    expect(new MemoryApiAdapter("p", api, "mock").kind).toBe("mock");
  });
});
