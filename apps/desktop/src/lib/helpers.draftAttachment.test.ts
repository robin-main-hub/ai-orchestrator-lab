import { describe, expect, it } from "vitest";
import type { ModelDescriptor } from "@ai-orchestrator/protocol";
import {
  classifyDraftAttachment,
  createDraftAttachment,
  getModelInputModalities,
} from "./helpers";

// Characterization tests (no behavior change) for the draft-attachment +
// model-modality slice of helpers.ts the existing helpers.test.ts /
// helpersAgentIdentity.test.ts leave directly uncovered. The downstream
// consumers (modelSupportsAttachmentKind / attachmentAcceptForModel /
// attachmentCapabilityLabel) are already pinned, but these three building
// blocks are not asserted head-on:
//   - classifyDraftAttachment: pure File.type prefix → "image" | "document".
//   - createDraftAttachment: builds a DraftAttachment (metadata_only, no bytes);
//     only the crypto.randomUUID id is non-deterministic, asserted structurally.
//   - getModelInputModalities: pure `inputModalities?.length ? … : ["text"]`
//     default fallback (the seam every model-capability helper reads).

describe("classifyDraftAttachment", () => {
  it("maps an image/* mime type to the image kind", () => {
    expect(classifyDraftAttachment(new File([], "photo.png", { type: "image/png" }))).toBe("image");
  });

  it("maps any non-image (or missing) mime type to the document kind", () => {
    expect(classifyDraftAttachment(new File([], "notes.pdf", { type: "application/pdf" }))).toBe("document");
    expect(classifyDraftAttachment(new File([], "blob.bin", { type: "" }))).toBe("document");
  });
});

describe("createDraftAttachment", () => {
  it("derives a metadata-only attachment from the file, with an attachment_-prefixed id", () => {
    const file = new File([], "diagram.png", { type: "image/png" });
    const draft = createDraftAttachment(file);
    expect(draft).toMatchObject({
      name: "diagram.png",
      kind: "image",
      mimeType: "image/png",
      size: file.size,
      storage: "metadata_only",
    });
    expect(draft.id.startsWith("attachment_")).toBe(true);
  });

  it("falls back to application/octet-stream when the file has no mime type", () => {
    const draft = createDraftAttachment(new File([], "raw", { type: "" }));
    expect(draft.mimeType).toBe("application/octet-stream");
    expect(draft.kind).toBe("document");
  });
});

describe("getModelInputModalities", () => {
  it("defaults to text-only when the model is absent or declares no modalities", () => {
    expect(getModelInputModalities(undefined)).toEqual(["text"]);
    expect(getModelInputModalities({ inputModalities: [] } as unknown as ModelDescriptor)).toEqual(["text"]);
  });

  it("returns the declared modalities verbatim when present", () => {
    const model = { inputModalities: ["text", "image"] } as unknown as ModelDescriptor;
    expect(getModelInputModalities(model)).toEqual(["text", "image"]);
  });
});
