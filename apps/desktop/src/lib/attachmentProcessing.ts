import type { ConversationAttachment } from "@ai-orchestrator/protocol";

export type AttachmentProcessingFile = {
  name: string;
  size: number;
  type: string;
};

export type AttachmentProcessingPlan = {
  kind: ConversationAttachment["kind"];
  name: string;
  processingMode: "vision_candidate" | "document_candidate" | "metadata_only";
  reason?: string;
  size: number;
  status: "accepted" | "rejected";
  storage: ConversationAttachment["storage"];
};

export type AttachmentProcessingSummary = {
  acceptedCount: number;
  label: string;
  rejectedCount: number;
};

export type NextDraftRejectedAttachmentPlanInput = {
  acceptedAttachmentCount: number;
  currentRejectedPlans: AttachmentProcessingPlan[];
  incomingRejectedPlans: AttachmentProcessingPlan[];
  maxRejectedPlanCount: number;
};

export type MessageAttachmentProcessingSource = ConversationAttachment & {
  processingMode?: AttachmentProcessingPlan["processingMode"];
  processingReason?: string;
  processingStatus?: AttachmentProcessingPlan["status"];
};

export type ReprocessedAttachmentProcessingResult<T extends MessageAttachmentProcessingSource> = {
  attachments: Array<T & {
    processingMode: AttachmentProcessingPlan["processingMode"];
    processingReason?: string;
    processingStatus: "accepted";
  }>;
  processingPlans: AttachmentProcessingPlan[];
  rejectedPlans: AttachmentProcessingPlan[];
};

export function createAttachmentProcessingPlan({
  currentAttachmentCount,
  files,
  maxAttachmentCount,
  maxBytes = 10 * 1024 * 1024,
  modelModalities,
}: {
  currentAttachmentCount: number;
  files: AttachmentProcessingFile[];
  maxAttachmentCount: number;
  maxBytes?: number;
  modelModalities: string[];
}): AttachmentProcessingPlan[] {
  let acceptedCount = 0;
  return files.map((file) => {
    const kind = classifyAttachmentKind(file);
    const processingMode = processingModeFor(kind, modelModalities);
    const wouldExceedCount = currentAttachmentCount + acceptedCount >= maxAttachmentCount;
    const tooLarge = file.size > maxBytes;
    const unsupportedFileType = !supportsAttachmentFileType(file, kind);
    const unsupported = !supportsKind(kind, modelModalities);

    if (tooLarge) {
      return rejected(file, kind, processingMode, "파일 크기 제한 초과");
    }
    if (wouldExceedCount) {
      return rejected(file, kind, processingMode, "첨부 개수 제한 초과");
    }
    if (unsupportedFileType) {
      return rejected(file, kind, processingMode, "지원하지 않는 첨부 파일 형식");
    }
    if (unsupported) {
      return rejected(file, kind, processingMode, "선택 모델이 이 첨부 종류를 지원하지 않음");
    }

    acceptedCount += 1;
    return {
      kind,
      name: file.name,
      processingMode,
      size: file.size,
      status: "accepted",
      storage: "metadata_only",
    };
  });
}

export function summarizeAttachmentProcessingPlans(plans: AttachmentProcessingPlan[]): AttachmentProcessingSummary {
  const accepted = plans.filter((plan) => plan.status === "accepted");
  const rejectedCount = plans.length - accepted.length;
  const visionCount = accepted.filter((plan) => plan.processingMode === "vision_candidate").length;
  const documentCount = accepted.filter((plan) => plan.processingMode === "document_candidate").length;
  const metadataCount = accepted.filter((plan) => plan.processingMode === "metadata_only").length;
  const parts = [
    `첨부 ${accepted.length}개 준비`,
    visionCount > 0 ? `이미지 확인 후보 ${visionCount}` : undefined,
    documentCount > 0 ? `문서 후보 ${documentCount}` : undefined,
    metadataCount > 0 ? `파일 정보 후보 ${metadataCount}` : undefined,
    rejectedCount > 0 ? `거부 ${rejectedCount}` : undefined,
  ].filter(Boolean);

  return {
    acceptedCount: accepted.length,
    label: parts.join(" · "),
    rejectedCount,
  };
}

export function createAttachmentProcessingPlansForMessage({
  attachments,
  rejectedPlans = [],
}: {
  attachments: MessageAttachmentProcessingSource[];
  rejectedPlans?: AttachmentProcessingPlan[];
}): AttachmentProcessingPlan[] {
  const acceptedPlans = attachments.map((attachment) => ({
    kind: attachment.kind,
    name: attachment.name,
    processingMode: attachment.processingMode ?? "metadata_only",
    reason: attachment.processingReason,
    size: attachment.size,
    status: attachment.processingStatus ?? "accepted",
    storage: attachment.storage,
  }));
  if (acceptedPlans.length === 0) {
    return [];
  }
  return [
    ...acceptedPlans,
    ...rejectedPlans.filter((plan) => plan.status === "rejected"),
  ];
}

export function createNextDraftRejectedAttachmentPlans({
  acceptedAttachmentCount,
  currentRejectedPlans,
  incomingRejectedPlans,
  maxRejectedPlanCount,
}: NextDraftRejectedAttachmentPlanInput): AttachmentProcessingPlan[] {
  if (acceptedAttachmentCount === 0) return [];
  return [
    ...currentRejectedPlans.filter((plan) => plan.status === "rejected"),
    ...incomingRejectedPlans.filter((plan) => plan.status === "rejected"),
  ].slice(-maxRejectedPlanCount);
}

export function reprocessMessageAttachmentsForModel<T extends MessageAttachmentProcessingSource>({
  attachments,
  maxAttachmentCount,
  maxBytes = 10 * 1024 * 1024,
  modelModalities,
}: {
  attachments: T[];
  maxAttachmentCount: number;
  maxBytes?: number;
  modelModalities: string[];
}): ReprocessedAttachmentProcessingResult<T> {
  let acceptedCount = 0;
  const processingPlans = attachments.map((attachment) => {
    const processingMode = processingModeFor(attachment.kind, modelModalities);
    const wouldExceedCount = acceptedCount >= maxAttachmentCount;
    const tooLarge = attachment.size > maxBytes;
    const unsupportedFileType = !supportsAttachmentFileType({
      name: attachment.name,
      size: attachment.size,
      type: attachment.mimeType,
    }, attachment.kind);
    const unsupported = !supportsKind(attachment.kind, modelModalities);

    if (tooLarge) {
      return rejectedFromAttachment(attachment, processingMode, "파일 크기 제한 초과");
    }
    if (wouldExceedCount) {
      return rejectedFromAttachment(attachment, processingMode, "첨부 개수 제한 초과");
    }
    if (unsupportedFileType) {
      return rejectedFromAttachment(attachment, processingMode, "지원하지 않는 첨부 파일 형식");
    }
    if (unsupported) {
      return rejectedFromAttachment(attachment, processingMode, "선택 모델이 이 첨부 종류를 지원하지 않음");
    }

    acceptedCount += 1;
    return {
      kind: attachment.kind,
      name: attachment.name,
      processingMode,
      size: attachment.size,
      status: "accepted" as const,
      storage: attachment.storage,
    };
  });
  const acceptedAttachments = processingPlans.flatMap((plan, index) => {
    if (plan.status !== "accepted") return [];
    const attachment = attachments[index];
    if (!attachment) return [];
    return [
      {
        ...attachment,
        processingMode: plan.processingMode,
        processingStatus: "accepted" as const,
        ...(plan.reason ? { processingReason: plan.reason } : {}),
      },
    ];
  });

  return {
    attachments: acceptedAttachments,
    processingPlans,
    rejectedPlans: processingPlans.filter((plan) => plan.status === "rejected"),
  };
}

function classifyAttachmentKind(file: AttachmentProcessingFile): ConversationAttachment["kind"] {
  return file.type.startsWith("image/") ? "image" : "document";
}

function supportsAttachmentFileType(
  file: AttachmentProcessingFile,
  kind: ConversationAttachment["kind"],
): boolean {
  if (kind === "image") {
    return file.type.startsWith("image/");
  }

  const mimeType = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/pdf" || mimeType === "application/json") return true;
  if (mimeType.includes("word") || mimeType.includes("officedocument")) return true;

  return [
    ".css",
    ".csv",
    ".go",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".md",
    ".pdf",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
  ].some((extension) => name.endsWith(extension));
}

function supportsKind(kind: ConversationAttachment["kind"], modelModalities: string[]): boolean {
  if (kind === "document") {
    return modelModalities.includes("text") || modelModalities.includes("document");
  }
  return modelModalities.includes(kind);
}

function processingModeFor(
  kind: ConversationAttachment["kind"],
  modelModalities: string[],
): AttachmentProcessingPlan["processingMode"] {
  if (kind === "image" && modelModalities.includes("image")) return "vision_candidate";
  if (kind === "document" && (modelModalities.includes("document") || modelModalities.includes("text"))) return "document_candidate";
  return "metadata_only";
}

function rejected(
  file: AttachmentProcessingFile,
  kind: ConversationAttachment["kind"],
  processingMode: AttachmentProcessingPlan["processingMode"],
  reason: string,
): AttachmentProcessingPlan {
  return {
    kind,
    name: file.name,
    processingMode,
    reason,
    size: file.size,
    status: "rejected",
    storage: "metadata_only",
  };
}

function rejectedFromAttachment(
  attachment: MessageAttachmentProcessingSource,
  processingMode: AttachmentProcessingPlan["processingMode"],
  reason: string,
): AttachmentProcessingPlan {
  return {
    kind: attachment.kind,
    name: attachment.name,
    processingMode,
    reason,
    size: attachment.size,
    status: "rejected",
    storage: attachment.storage,
  };
}
