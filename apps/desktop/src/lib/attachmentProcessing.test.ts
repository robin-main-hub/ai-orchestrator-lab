import { describe, expect, it } from "vitest";
import { createAttachmentProcessingPlan } from "./attachmentProcessing";

describe("attachmentProcessing", () => {
  it("지원 모델에는 이미지/문서 첨부 처리 계획을 만든다", () => {
    const plans = createAttachmentProcessingPlan({
      currentAttachmentCount: 1,
      files: [
        { name: "screen.png", size: 120_000, type: "image/png" },
        { name: "brief.pdf", size: 240_000, type: "application/pdf" },
      ],
      maxAttachmentCount: 5,
      modelModalities: ["text", "image", "document"],
    });

    expect(plans.map((plan) => plan.status)).toEqual(["accepted", "accepted"]);
    expect(plans[0]).toMatchObject({
      kind: "image",
      storage: "metadata_only",
      processingMode: "vision_candidate",
    });
    expect(plans[1]).toMatchObject({
      kind: "document",
      processingMode: "document_candidate",
    });
  });

  it("모델 능력/개수/크기 제한을 거부 사유로 남긴다", () => {
    const plans = createAttachmentProcessingPlan({
      currentAttachmentCount: 4,
      files: [
        { name: "one.png", size: 10, type: "image/png" },
        { name: "two.pdf", size: 20, type: "application/pdf" },
        { name: "huge.mov", size: 20 * 1024 * 1024, type: "video/quicktime" },
      ],
      maxAttachmentCount: 5,
      maxBytes: 5 * 1024 * 1024,
      modelModalities: ["text", "image"],
    });

    expect(plans.map((plan) => plan.status)).toEqual(["accepted", "rejected", "rejected"]);
    expect(plans[1]).toMatchObject({ reason: "첨부 개수 제한 초과" });
    expect(plans[2]).toMatchObject({ reason: "파일 크기 제한 초과" });
  });
});
