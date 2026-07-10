import { describe, expect, it } from "vitest";
import {
  createAttachmentProcessingPlan,
  createAttachmentProcessingPlansForMessage,
  createNextDraftRejectedAttachmentPlans,
  reprocessMessageAttachmentsForModel,
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

  it("비문서 바이너리 파일은 text 모델의 document 후보로 위장하지 않는다", () => {
    const plans = createAttachmentProcessingPlan({
      currentAttachmentCount: 0,
      files: [
        { name: "clip.mov", size: 1_000, type: "video/quicktime" },
      ],
      maxAttachmentCount: 5,
      modelModalities: ["text"],
    });

    expect(plans).toMatchObject([
      {
        kind: "document",
        name: "clip.mov",
        reason: "지원하지 않는 첨부 파일 형식",
        status: "rejected",
      },
    ]);
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

  it("공개 브리핑에 쓸 수 있도록 첨부 처리 계획을 압축 요약한다", () => {
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
      label: "첨부 2개 준비 · 이미지 확인 후보 1 · 문서 후보 1 · 거부 1",
      rejectedCount: 1,
    });
  });

  it("메시지 전송용 처리 계획에는 accepted 첨부와 이전에 거부된 계획을 함께 보존한다", () => {
    const plans = createAttachmentProcessingPlansForMessage({
      attachments: [
        {
          id: "attachment_screen",
          kind: "image",
          mimeType: "image/png",
          name: "screen.png",
          processingMode: "vision_candidate",
          processingStatus: "accepted",
          size: 1_000,
          storage: "metadata_only",
        },
      ],
      rejectedPlans: [
        {
          kind: "document",
          name: "secret.pdf",
          processingMode: "metadata_only",
          reason: "파일 크기 제한 초과",
          size: 20_000_000,
          status: "rejected",
          storage: "metadata_only",
        },
      ],
    });

    expect(plans.map((plan) => `${plan.name}:${plan.status}:${plan.reason ?? "ok"}`)).toEqual([
      "screen.png:accepted:ok",
      "secret.pdf:rejected:파일 크기 제한 초과",
    ]);
  });

  it("accepted 첨부가 없는 메시지에는 이전 거부 계획을 이월하지 않는다", () => {
    const plans = createAttachmentProcessingPlansForMessage({
      attachments: [],
      rejectedPlans: [
        {
          kind: "image",
          name: "unsupported.png",
          processingMode: "metadata_only",
          reason: "선택 모델이 이 첨부 종류를 지원하지 않음",
          size: 10_000,
          status: "rejected",
          storage: "metadata_only",
        },
      ],
    });

    expect(plans).toEqual([]);
  });

  it("accepted 첨부가 없는 새 선택은 이전 rejected 초안을 비운다", () => {
    const previousRejected = {
      kind: "image" as const,
      name: "old.png",
      processingMode: "metadata_only" as const,
      reason: "선택 모델이 이 첨부 종류를 지원하지 않음",
      size: 1_000,
      status: "rejected" as const,
      storage: "metadata_only" as const,
    };
    const nextRejected = {
      ...previousRejected,
      name: "next.png",
    };

    expect(
      createNextDraftRejectedAttachmentPlans({
        acceptedAttachmentCount: 0,
        currentRejectedPlans: [previousRejected],
        incomingRejectedPlans: [nextRejected],
        maxRejectedPlanCount: 5,
      }),
    ).toEqual([]);
    expect(
      createNextDraftRejectedAttachmentPlans({
        acceptedAttachmentCount: 1,
        currentRejectedPlans: [previousRejected],
        incomingRejectedPlans: [nextRejected],
        maxRejectedPlanCount: 5,
      }),
    ).toEqual([previousRejected, nextRejected]);
  });

  it("모델 변경 시 기존 draft 첨부를 새 모델 능력으로 다시 판정한다", () => {
    const result = reprocessMessageAttachmentsForModel({
      attachments: [
        {
          id: "attachment_screen",
          kind: "image",
          mimeType: "image/png",
          name: "screen.png",
          processingMode: "vision_candidate",
          processingStatus: "accepted",
          size: 1_000,
          storage: "metadata_only",
        },
        {
          id: "attachment_notes",
          kind: "document",
          mimeType: "text/markdown",
          name: "notes.md",
          processingMode: "metadata_only",
          processingStatus: "accepted",
          size: 2_000,
          storage: "metadata_only",
        },
      ],
      maxAttachmentCount: 5,
      modelModalities: ["text"],
    });

    expect(result.attachments.map((attachment) => `${attachment.id}:${attachment.processingMode}`)).toEqual([
      "attachment_notes:document_candidate",
    ]);
    expect(result.rejectedPlans).toMatchObject([
      {
        kind: "image",
        name: "screen.png",
        reason: "선택 모델이 이 첨부 종류를 지원하지 않음",
        status: "rejected",
      },
    ]);
    expect(result.processingPlans.map((plan) => `${plan.name}:${plan.status}`)).toEqual([
      "screen.png:rejected",
      "notes.md:accepted",
    ]);
  });
});
