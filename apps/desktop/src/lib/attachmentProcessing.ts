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
    const unsupported = !supportsKind(kind, modelModalities);

    if (tooLarge) {
      return rejected(file, kind, processingMode, "파일 크기 제한 초과");
    }
    if (wouldExceedCount) {
      return rejected(file, kind, processingMode, "첨부 개수 제한 초과");
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

function classifyAttachmentKind(file: AttachmentProcessingFile): ConversationAttachment["kind"] {
  return file.type.startsWith("image/") ? "image" : "document";
}

function supportsKind(kind: ConversationAttachment["kind"], modelModalities: string[]): boolean {
  return modelModalities.includes(kind);
}

function processingModeFor(
  kind: ConversationAttachment["kind"],
  modelModalities: string[],
): AttachmentProcessingPlan["processingMode"] {
  if (kind === "image" && modelModalities.includes("image")) return "vision_candidate";
  if (kind === "document" && modelModalities.includes("document")) return "document_candidate";
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
