import { describe, expect, it } from "vitest";
import {
  createAttachmentProcessingPlan,
  summarizeAttachmentProcessingPlans,
} from "./attachmentProcessing";

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

  it("모델이 text 모달리티만 지원해도 document 종류의 첨부를 허용한다", () => {
    const plans = createAttachmentProcessingPlan({
      currentAttachmentCount: 0,
      files: [
        { name: "code.ts", size: 10_000, type: "text/typescript" },
      ],
      maxAttachmentCount: 5,
      modelModalities: ["text"],
    });

    expect(plans.map((plan) => plan.status)).toEqual(["accepted"]);
    expect(plans[0]).toMatchObject({
      kind: "document",
      processingMode: "document_candidate",
    });
  });

  it("혼합 파일 선택 결과를 순서대로 보존하며 부분 거부 사유를 남긴다", () => {
    const plans = createAttachmentProcessingPlan({
      currentAttachmentCount: 0,
      files: [
        { name: "notes.md", size: 1_000, type: "text/markdown" },
        { name: "screen.png", size: 1_000, type: "image/png" },
        { name: "large.pdf", size: 11 * 1024 * 1024, type: "application/pdf" },
      ],
      maxAttachmentCount: 5,
      modelModalities: ["text"],
    });

    expect(plans.map((plan) => `${plan.name}:${plan.status}`)).toEqual([
      "notes.md:accepted",
      "screen.png:rejected",
      "large.pdf:rejected",
    ]);
    expect(plans[1]).toMatchObject({ reason: "선택 모델이 이 첨부 종류를 지원하지 않음" });
    expect(plans[2]).toMatchObject({ reason: "파일 크기 제한 초과" });
  });

  it("공개 영수증에 쓸 수 있도록 첨부 처리 계획을 압축 요약한다", () => {
    const plans = createAttachmentProcessingPlan({
      currentAttachmentCount: 0,
      files: [
        { name: "screen.png", size: 1_000, type: "image/png" },
        { name: "notes.md", size: 1_000, type: "text/markdown" },
        { name: "huge.pdf", size: 20 * 1024 * 1024, type: "application/pdf" },
      ],
      maxAttachmentCount: 5,
      maxBytes: 5 * 1024 * 1024,
      modelModalities: ["text", "image"],
    });

    expect(summarizeAttachmentProcessingPlans(plans)).toEqual({
      acceptedCount: 2,
      label: "첨부 2개 준비 · 이미지 vision 후보 1 · 문서 후보 1 · 거부 1",
      rejectedCount: 1,
    });
  });
});
