import { describe, expect, it } from "vitest";
import type { ConversationAttachment } from "@ai-orchestrator/protocol";
import {
  MAX_IMAGE_BYTES,
  MAX_TEXT_CHARS,
  extractMessageAttachments,
  isTextLikeAttachment,
  readAttachmentContent,
  toProviderAttachments,
  type AttachmentSourceFile,
} from "./attachmentContent";

function baseAttachment(overrides: Partial<ConversationAttachment> = {}): ConversationAttachment {
  return {
    id: "att_1",
    name: "file.png",
    kind: "image",
    mimeType: "image/png",
    size: 10,
    storage: "metadata_only",
    ...overrides,
  };
}

function fakeFile(input: Partial<AttachmentSourceFile> & { bytes?: number[]; content?: string }): AttachmentSourceFile {
  const bytes = new Uint8Array(input.bytes ?? []);
  return {
    name: input.name ?? "file.png",
    type: input.type ?? "image/png",
    size: input.size ?? bytes.length,
    text: input.text ?? (async () => input.content ?? ""),
    arrayBuffer: input.arrayBuffer ?? (async () => bytes.buffer),
  };
}

describe("readAttachmentContent", () => {
  it("encodes small images as base64 data URLs", async () => {
    const file = fakeFile({ bytes: [137, 80, 78, 71] });
    const result = await readAttachmentContent(file, baseAttachment());
    expect(result.dataUrl).toBe("data:image/png;base64,iVBORw==");
    expect(result.storage).toBe("local_cache");
  });

  it("marks oversized images truncated without reading bytes", async () => {
    const file = fakeFile({
      size: MAX_IMAGE_BYTES + 1,
      arrayBuffer: async () => {
        throw new Error("must not read oversized file");
      },
    });
    const result = await readAttachmentContent(file, baseAttachment());
    expect(result.dataUrl).toBeUndefined();
    expect(result.truncated).toBe(true);
  });

  it("inlines text-like documents and caps the length", async () => {
    const long = "a".repeat(MAX_TEXT_CHARS + 5);
    const file = fakeFile({ name: "notes.md", type: "text/markdown", content: long });
    const result = await readAttachmentContent(
      file,
      baseAttachment({ name: "notes.md", kind: "document", mimeType: "text/markdown" }),
    );
    expect(result.textContent).toHaveLength(MAX_TEXT_CHARS);
    expect(result.truncated).toBe(true);
  });

  it("keeps binary documents metadata-only and survives read failures", async () => {
    const pdf = fakeFile({ name: "doc.pdf", type: "application/pdf" });
    const original = baseAttachment({ name: "doc.pdf", kind: "document", mimeType: "application/pdf" });
    expect(await readAttachmentContent(pdf, original)).toBe(original);

    const failing = fakeFile({
      name: "broken.txt",
      type: "text/plain",
      text: async () => {
        throw new Error("io error");
      },
    });
    const textAttachment = baseAttachment({ name: "broken.txt", kind: "document", mimeType: "text/plain" });
    expect(await readAttachmentContent(failing, textAttachment)).toBe(textAttachment);
  });
});

describe("isTextLikeAttachment", () => {
  it("accepts text mime types and known code/text extensions", () => {
    expect(isTextLikeAttachment("a.csv", "text/csv")).toBe(true);
    expect(isTextLikeAttachment("config.json", "application/json")).toBe(true);
    expect(isTextLikeAttachment("main.ts", "application/octet-stream")).toBe(true);
    expect(isTextLikeAttachment("photo.jpg", "image/jpeg")).toBe(false);
  });
});

describe("toProviderAttachments", () => {
  it("keeps only attachments that carry content, capped at 6", () => {
    const withData = baseAttachment({ dataUrl: "data:image/png;base64,AA==" });
    const metadataOnly = baseAttachment({ id: "att_2" });
    const result = toProviderAttachments([withData, metadataOnly]);
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ name: "file.png", kind: "image", dataUrl: "data:image/png;base64,AA==" });

    const many = Array.from({ length: 8 }, (_, index) =>
      baseAttachment({ id: `att_${index}`, dataUrl: "data:image/png;base64,AA==" }),
    );
    expect(toProviderAttachments(many)).toHaveLength(6);
  });

  it("returns undefined when nothing carries content", () => {
    expect(toProviderAttachments([baseAttachment()])).toBeUndefined();
    expect(toProviderAttachments([])).toBeUndefined();
    expect(toProviderAttachments(undefined)).toBeUndefined();
  });
});

describe("extractMessageAttachments", () => {
  it("parses metadata.attachments defensively", () => {
    const valid = baseAttachment();
    expect(extractMessageAttachments({ attachments: [valid, null, "junk", { name: 1 }] })).toEqual([valid]);
    expect(extractMessageAttachments({})).toEqual([]);
    expect(extractMessageAttachments(undefined)).toEqual([]);
  });
});
