import type { DraftAttachment } from "../types";
import type { AttachmentProcessingPlan } from "./attachmentProcessing";

/**
 * Attachment UX 정직성 헬퍼(순수). 첨부가 조용히 거부/강등되지 않도록 사용자에게 보여줄 경고를
 * 만든다. 모델이 못 읽는 첨부를 읽는 척 금지, metadata_only/미지원을 정직하게 표기.
 */

export type RejectedAttachmentSummary = {
  count: number;
  /** 중복 제거된 거부 사유들 */
  reasons: string[];
  /** 선택 모델이 종류를 지원 안 해서 거부된 게 있으면 true → "모델 교체" CTA 노출 */
  showModelCta: boolean;
};

/** 거부된 처리 플랜들을 사용자 경고로 요약. 없으면 count 0. */
export function summarizeRejectedAttachments(plans: ReadonlyArray<AttachmentProcessingPlan> | undefined): RejectedAttachmentSummary {
  const rejected = (plans ?? []).filter((plan) => plan.status === "rejected");
  const reasons: string[] = [];
  for (const plan of rejected) {
    const reason = plan.reason ?? "첨부를 추가할 수 없습니다";
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  // 모델 능력 미달로 거부된 경우(사유에 "모델"). 그 외(형식 자체 미지원)는 모델 교체로 해결 안 됨.
  const showModelCta = rejected.some((plan) => (plan.reason ?? "").includes("모델"));
  return { count: rejected.length, reasons, showModelCta };
}

function matchExt(name: string, exts: RegExp): boolean {
  return exts.test(name.toLowerCase());
}

/**
 * 첨부 한 건이 모델에 어떻게 전달되는지 정직하게 한 줄로. 내용이 모델에 직접 안 가는 경우만
 * 반환(이미지 등 정상 전달은 undefined). zip/excel은 리뷰 지적대로 "직접 못 읽음"을 명시.
 */
export function attachmentDeliveryNote(attachment: Pick<DraftAttachment, "name" | "mimeType" | "kind" | "storage">): string | undefined {
  const name = attachment.name ?? "";
  const mime = (attachment.mimeType ?? "").toLowerCase();
  const isArchive = matchExt(name, /\.(zip|tar|gz|tgz|7z|rar)$/) || mime.includes("zip") || mime.includes("compressed") || mime.includes("x-tar");
  const isSpreadsheet = matchExt(name, /\.(xlsx|xls)$/) || mime.includes("spreadsheet") || mime.includes("excel");

  if (isArchive) {
    return "압축 파일은 모델에 직접 전달되지 않습니다 — 메타데이터만 보냅니다(해제/파일 선택 필요).";
  }
  if (isSpreadsheet) {
    return "스프레드시트 구조는 모델이 직접 해석하지 못할 수 있습니다 — CSV/텍스트로 변환하거나 문서 지원 모델을 쓰세요.";
  }
  // 이미지가 아니고 metadata_only로 남으면 내용이 모델에 안 간다(정직 표기).
  if (attachment.kind !== "image" && attachment.storage === "metadata_only") {
    return "이 첨부는 메타데이터만 전송됩니다(내용은 모델에 전달되지 않음).";
  }
  return undefined;
}
