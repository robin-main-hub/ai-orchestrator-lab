import { describe, expect, it } from "vitest";
import { providerCompletionRequestSchema } from "./index.js";

// providerCompletionRequestSchema is the EGRESS ENVELOPE — the record that leaves the
// OS for a provider endpoint, carrying the routing target, the message payload, and
// any multimodal riders. index.test.ts parses it once on the happy path and reads back
// requestContext fields, but the BOUNDS and the routing-identity invariants are
// unpinned. The FRESH authority angle here is EGRESS-REQUEST BOUNDS + ROUTING-TARGET
// IDENTITY: a request leaving for a provider always names a concrete routing target
// and stays within hard payload bounds, so nothing can be smuggled out unbounded or
// target-less. (1) THE ROUTING TARGET IS NAMED AND NON-EMPTY — id / sessionId /
// providerProfileId / modelId are each z.string().min(1).max(256): an egress request
// can never go out with an empty providerProfileId or modelId (no anonymous routing
// target), nor an unbounded identifier. (2) THE MESSAGE PAYLOAD IS BOUNDED NON-EMPTY —
// messages is .min(1).max(200): there is always at least one turn to send, and the
// turn count is capped (no zero-message call, no unbounded transcript dump). (3)
// ATTACHMENTS ARE COUNT-CAPPED — at most 6 multimodal riders. (4) THE OUTPUT CEILING
// IS A CAPPED POSITIVE INT — maxOutputTokens, when present, is a positive int ≤ 32_000:
// a caller can raise the adapter default but cannot request unbounded generation, nor
// a zero/negative ceiling. (5) PLAIN-OBJECT STRIP — an unknown key is stripped.

const message = { role: "user", content: "review this" } as const;
const attachment = { name: "note.txt", kind: "document", mimeType: "text/plain" } as const;

const request = {
  id: "req_1",
  sessionId: "session_1",
  providerProfileId: "provider_1",
  modelId: "model_1",
  messages: [message],
  source: "desktop",
  routePreference: "server_proxy",
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("providerCompletionRequest — routing-target identity", () => {
  it("accepts a well-formed egress request", () => {
    expect(providerCompletionRequestSchema.safeParse(request).success).toBe(true);
  });

  it("names a non-empty routing target — empty providerProfileId or modelId is rejected", () => {
    expect(providerCompletionRequestSchema.safeParse({ ...request, providerProfileId: "" }).success).toBe(false);
    expect(providerCompletionRequestSchema.safeParse({ ...request, modelId: "" }).success).toBe(false);
  });
});

describe("providerCompletionRequest — payload bounds", () => {
  it("bounds the message payload: non-empty and capped at 200 turns", () => {
    expect(providerCompletionRequestSchema.safeParse({ ...request, messages: [] }).success).toBe(false);
    expect(providerCompletionRequestSchema.safeParse({ ...request, messages: Array(200).fill(message) }).success).toBe(true);
    expect(providerCompletionRequestSchema.safeParse({ ...request, messages: Array(201).fill(message) }).success).toBe(false);
  });

  it("caps multimodal riders at 6 attachments", () => {
    expect(providerCompletionRequestSchema.safeParse({ ...request, attachments: Array(6).fill(attachment) }).success).toBe(true);
    expect(providerCompletionRequestSchema.safeParse({ ...request, attachments: Array(7).fill(attachment) }).success).toBe(false);
  });

  it("caps the output ceiling to a positive int <= 32_000", () => {
    expect(providerCompletionRequestSchema.safeParse({ ...request, maxOutputTokens: 0 }).success).toBe(false);
    expect(providerCompletionRequestSchema.safeParse({ ...request, maxOutputTokens: -1 }).success).toBe(false);
    expect(providerCompletionRequestSchema.safeParse({ ...request, maxOutputTokens: 1.5 }).success).toBe(false);
    expect(providerCompletionRequestSchema.safeParse({ ...request, maxOutputTokens: 32_000 }).success).toBe(true);
    expect(providerCompletionRequestSchema.safeParse({ ...request, maxOutputTokens: 32_001 }).success).toBe(false);
  });
});

describe("providerCompletionRequest — plain-object strip", () => {
  it("strips an unknown key rather than carrying it", () => {
    const parsed = providerCompletionRequestSchema.parse({ ...request, forgedAuthority: "elevated" });
    expect("forgedAuthority" in parsed).toBe(false);
  });
});
