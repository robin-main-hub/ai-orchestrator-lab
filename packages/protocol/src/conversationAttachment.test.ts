import { describe, expect, it } from "vitest";
import {
  conversationAttachmentKindSchema,
  conversationAttachmentSchema,
  conversationAttachmentStorageSchema,
} from "./index.js";

// conversationAttachmentSchema is the generic-OS shape for a file a user pastes
// or attaches into a conversation; it lands in the append-only event log, so its
// payload bounds are a real DoS guard, not cosmetics. Beyond the usual closed
// vocabularies, the FRESH authority here is BOUNDED PAYLOAD: (1) CLOSED KIND /
// STORAGE — kind ∈ {image,document}, storage ∈ {metadata_only, local_cache,
// dgx_object_storage}; unknown rejected. (2) NON-NEGATIVE SIZE — size:0 ok, a
// negative byte count is impossible and rejected. (3) EVENT-LOG DOS CAPS — the
// inline textContent is capped at 200_000 chars and the base64 dataUrl at
// 8_000_000, so a pasted log or a huge image can never blow the event log; the
// cap is enforced exactly at the boundary. (4) OPTIONAL PAYLOAD + NO-SMUGGLE —
// the six core fields are required, the three inline-payload fields
// (textContent/dataUrl/truncated) are optional (a metadata_only attachment
// carries none), and being a plain z.object unknown keys are stripped. Enum
// members are read back via `.options` (no magic literals).

const base = {
  id: "att-1",
  name: "log.txt",
  kind: "document",
  mimeType: "text/plain",
  size: 1024,
  storage: "local_cache",
  textContent: "hello",
  truncated: false,
};

describe("conversationAttachment — closed kind/storage vocabularies", () => {
  it("kind admits exactly {image, document}; storage exactly the three tiers", () => {
    expect(conversationAttachmentKindSchema.options).toEqual(["image", "document"]);
    expect(conversationAttachmentStorageSchema.options).toEqual([
      "metadata_only",
      "local_cache",
      "dgx_object_storage",
    ]);
  });

  it("rejects an unknown kind or storage tier", () => {
    expect(conversationAttachmentSchema.safeParse({ ...base, kind: "video" }).success).toBe(false);
    expect(conversationAttachmentSchema.safeParse({ ...base, storage: "s3" }).success).toBe(false);
  });
});

describe("conversationAttachment — bounded payload (event-log DoS guard)", () => {
  it("requires a non-negative size", () => {
    expect(conversationAttachmentSchema.safeParse({ ...base, size: 0 }).success).toBe(true);
    expect(conversationAttachmentSchema.safeParse({ ...base, size: -1 }).success).toBe(false);
  });

  it("caps inline textContent at exactly 200_000 chars", () => {
    expect(conversationAttachmentSchema.safeParse({ ...base, textContent: "x".repeat(200_000) }).success).toBe(true);
    expect(conversationAttachmentSchema.safeParse({ ...base, textContent: "x".repeat(200_001) }).success).toBe(false);
  });

  it("caps the base64 dataUrl so a huge image cannot blow the log", () => {
    const over = { ...base, kind: "image", mimeType: "image/png", dataUrl: "a".repeat(8_000_001) };
    expect(conversationAttachmentSchema.safeParse(over).success).toBe(false);
  });
});

describe("conversationAttachment — optional payload + no-smuggle", () => {
  it("accepts a metadata_only attachment with none of the inline-payload fields", () => {
    const minimal = { id: "a2", name: "pic.png", kind: "image", mimeType: "image/png", size: 0, storage: "metadata_only" };
    expect(conversationAttachmentSchema.safeParse(minimal).success).toBe(true);
  });

  it("requires the core fields — a missing mimeType fails", () => {
    const { mimeType: _omit, ...without } = base;
    expect(conversationAttachmentSchema.safeParse(without).success).toBe(false);
  });

  it("strips unknown keys — extra fields cannot ride along in the event log", () => {
    const parsed = conversationAttachmentSchema.parse({ ...base, evilFlag: true, rawBytes: "..." });
    expect("evilFlag" in parsed).toBe(false);
    expect("rawBytes" in parsed).toBe(false);
  });
});
