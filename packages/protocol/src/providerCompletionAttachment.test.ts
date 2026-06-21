import { describe, expect, it } from "vitest";
import { providerCompletionAttachmentSchema } from "./index.js";

// providerCompletionAttachmentSchema is the EGRESS (wire) attachment handed to a
// completion adapter — as opposed to the durable conversationAttachmentSchema
// (already pinned), which is the stored record. It was never pinned. The FRESH
// authority angle here is EGRESS PROJECTION: the wire shape is a deliberately
// TIGHTENED, BOOKKEEPING-STRIPPED projection of the durable attachment. (1)
// IDENTITY FIELDS ARE REQUIRED, NON-EMPTY, AND BOUNDED — `name` (min 1, max 512)
// and `mimeType` (min 1, max 256) are required strings with BOTH a non-empty lower
// bound and a length cap: a wire attachment can be neither nameless/empty nor
// oversized (the durable record's name is a plain z.string with no such bounds —
// the boundary is tighter on egress). (2) KIND IS THE SAME CLOSED {image,document}
// VOCAB by value; an unknown kind is rejected. (3) PAYLOAD CAPS ARE RETAINED —
// dataUrl (≤ 8_000_000) and textContent (≤ 200_000) are optional but keep their
// DoS caps. (4) DURABLE BOOKKEEPING IS DROPPED — the egress shape has no id / size
// / storage / truncated fields, and being a plain z.object it STRIPS any smuggled
// such key: the wire carries only what the provider needs, never the store's
// internal bookkeeping.

const attachment = {
  name: "spec.pdf",
  kind: "document",
  mimeType: "application/pdf",
};

describe("providerCompletionAttachment — required, non-empty, bounded identity fields", () => {
  it("accepts a minimal egress attachment (name/kind/mimeType only)", () => {
    expect(providerCompletionAttachmentSchema.safeParse(attachment).success).toBe(true);
  });

  it("name is required, rejects empty, and is length-capped at 512", () => {
    const { name: _omit, ...without } = attachment;
    expect(providerCompletionAttachmentSchema.safeParse(without).success).toBe(false);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, name: "" }).success).toBe(false);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, name: "x".repeat(512) }).success).toBe(true);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, name: "x".repeat(513) }).success).toBe(false);
  });

  it("mimeType is required, rejects empty, and is length-capped at 256", () => {
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, mimeType: "" }).success).toBe(false);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, mimeType: "x".repeat(256) }).success).toBe(true);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, mimeType: "x".repeat(257) }).success).toBe(false);
  });

  it("kind is the closed {image, document} vocab", () => {
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, kind: "image" }).success).toBe(true);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, kind: "video" }).success).toBe(false);
  });
});

describe("providerCompletionAttachment — payload caps retained", () => {
  it("textContent keeps its 200_000-char DoS cap", () => {
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, textContent: "x".repeat(200_000) }).success).toBe(true);
    expect(providerCompletionAttachmentSchema.safeParse({ ...attachment, textContent: "x".repeat(200_001) }).success).toBe(false);
  });
});

describe("providerCompletionAttachment — durable bookkeeping is dropped on the wire", () => {
  it("strips smuggled durable-only fields (id / size / storage / truncated)", () => {
    const parsed = providerCompletionAttachmentSchema.parse({
      ...attachment,
      id: "att-1",
      size: 1234,
      storage: "local_cache",
      truncated: true,
    });
    for (const key of ["id", "size", "storage", "truncated"]) {
      expect(key in parsed).toBe(false);
    }
  });
});
