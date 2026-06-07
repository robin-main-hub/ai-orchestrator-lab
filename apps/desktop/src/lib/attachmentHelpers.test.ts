import { describe, expect, it } from "vitest";
import type { ModelDescriptor } from "@ai-orchestrator/protocol";
import {
  attachmentAcceptForModel,
  attachmentCapabilityLabel,
  modelSupportsAnyAttachment,
  modelSupportsAttachmentKind,
} from "./helpers";

function createModel(inputModalities: ModelDescriptor["inputModalities"]): ModelDescriptor {
  return {
    id: "model_text_only",
    name: "Text Model",
    providerProfileId: "provider_test",
    supportsStreaming: true,
    supportsTools: true,
    inputModalities,
    tags: [],
  };
}

describe("attachment helper policy", () => {
  it("treats text-capable models as document metadata candidates", () => {
    const model = createModel(["text"]);

    expect(modelSupportsAttachmentKind(model, "document")).toBe(true);
    expect(modelSupportsAnyAttachment(model)).toBe(true);
    expect(attachmentAcceptForModel(model)).toContain(".md");
    expect(attachmentCapabilityLabel(model)).toContain("문서");
  });

  it("keeps image support separate from document support", () => {
    const model = createModel(["image"]);

    expect(modelSupportsAttachmentKind(model, "image")).toBe(true);
    expect(modelSupportsAttachmentKind(model, "document")).toBe(false);
    expect(attachmentAcceptForModel(model)).toBe("image/*");
  });
});
