import { describe, expect, it } from "vitest";
import type { AttachmentProcessingPlan } from "./attachmentProcessing";
import { attachmentDeliveryNote, summarizeRejectedAttachments } from "./attachmentWarnings";

const plan = (over: Partial<AttachmentProcessingPlan>): AttachmentProcessingPlan => ({
  kind: "document",
  name: "x",
  processingMode: "metadata_only",
  size: 10,
  status: "rejected",
  storage: "metadata_only",
  ...over,
});

describe("summarizeRejectedAttachments", () => {
  it("거부 없으면 count 0, CTA 없음", () => {
    expect(summarizeRejectedAttachments([])).toEqual({ count: 0, reasons: [], showModelCta: false });
    expect(summarizeRejectedAttachments(undefined).count).toBe(0);
  });

  it("accepted는 세지 않고, 사유는 중복 제거", () => {
    const r = summarizeRejectedAttachments([
      plan({ reason: "지원하지 않는 첨부 파일 형식" }),
      plan({ reason: "지원하지 않는 첨부 파일 형식" }),
      plan({ status: "accepted", reason: undefined }),
    ]);
    expect(r.count).toBe(2);
    expect(r.reasons).toEqual(["지원하지 않는 첨부 파일 형식"]);
  });

  it("모델 능력 미달 거부면 모델 교체 CTA 노출", () => {
    expect(summarizeRejectedAttachments([plan({ reason: "선택 모델이 이 첨부 종류를 지원하지 않음" })]).showModelCta).toBe(true);
    // 형식 자체 미지원은 모델 교체로 해결 안 됨 → CTA 없음
    expect(summarizeRejectedAttachments([plan({ reason: "지원하지 않는 첨부 파일 형식" })]).showModelCta).toBe(false);
  });
});

describe("attachmentDeliveryNote — 정직 전달 안내", () => {
  it("ZIP/압축은 직접 전달 안 됨 명시", () => {
    expect(attachmentDeliveryNote({ name: "logs.zip", mimeType: "application/zip", kind: "document", storage: "metadata_only" })).toContain("직접 전달되지 않습니다");
    expect(attachmentDeliveryNote({ name: "x.tar.gz", mimeType: "", kind: "document", storage: "metadata_only" })).toContain("압축");
  });

  it("엑셀/스프레드시트는 직접 해석 못할 수 있음 + CSV 권장", () => {
    const note = attachmentDeliveryNote({ name: "data.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document", storage: "metadata_only" });
    expect(note).toContain("CSV");
  });

  it("이미지 정상 전달이면 안내 없음", () => {
    expect(attachmentDeliveryNote({ name: "shot.png", mimeType: "image/png", kind: "image", storage: "local_cache" })).toBeUndefined();
  });

  it("이미지 아닌 metadata_only면 내용 미전달 명시", () => {
    expect(attachmentDeliveryNote({ name: "notes.txt", mimeType: "text/plain", kind: "document", storage: "metadata_only" })).toContain("메타데이터만");
  });
});
