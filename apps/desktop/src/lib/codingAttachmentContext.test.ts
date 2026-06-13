import { describe, expect, it } from "vitest";
import type { ConversationAttachment } from "@ai-orchestrator/protocol";
import { buildCodingAttachmentDelivery, describeCodingAttachmentDelivery } from "./codingAttachmentContext";

const base = (over: Partial<ConversationAttachment>): ConversationAttachment => ({
  id: "a1",
  name: "file",
  kind: "document",
  mimeType: "text/plain",
  size: 10,
  storage: "metadata_only",
  ...over,
});

describe("buildCodingAttachmentDelivery — 정직 2채널 전달", () => {
  it("첨부 없으면 전부 비어 있음", () => {
    const d = buildCodingAttachmentDelivery([]);
    expect(d).toEqual({
      providerAttachments: undefined,
      firstRequestContext: undefined,
      followupContext: undefined,
      images: 0,
      texts: 0,
      metadataOnly: 0,
    });
  });

  it("이미지(dataUrl)는 provider rider로, 본문은 인라인 안 됨", () => {
    const d = buildCodingAttachmentDelivery([
      base({ kind: "image", mimeType: "image/png", name: "shot.png", storage: "local_cache", dataUrl: "data:image/png;base64,AAAA" }),
    ]);
    expect(d.images).toBe(1);
    expect(d.providerAttachments).toEqual([
      { name: "shot.png", kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" },
    ]);
    expect(d.firstRequestContext).toContain("이미지 바이트가 이 요청에 동봉됨");
  });

  it("텍스트 본문은 1라운드 컨텍스트에 인라인되지만 rider에는 안 실림", () => {
    const d = buildCodingAttachmentDelivery([
      base({ name: "notes.txt", storage: "local_cache", textContent: "hello world" }),
    ]);
    expect(d.texts).toBe(1);
    expect(d.providerAttachments).toBeUndefined();
    expect(d.firstRequestContext).toContain("--- 첨부 본문: notes.txt ---");
    expect(d.firstRequestContext).toContain("hello world");
    expect(d.firstRequestContext).toContain("본문이 아래에 인라인됨");
  });

  it("12K 초과 본문은 잘리고 잘림 표시", () => {
    const big = "x".repeat(20_000);
    const d = buildCodingAttachmentDelivery([base({ name: "big.txt", storage: "local_cache", textContent: big })]);
    expect(d.firstRequestContext).toContain("일부만 — 원본이 더 김");
    // 인라인 본문은 12K로 절단
    expect(d.firstRequestContext!.length).toBeLessThan(20_000);
  });

  it("metadata_only는 미전달로 명시 + 디스클레이머", () => {
    const d = buildCodingAttachmentDelivery([base({ name: "archive.zip", mimeType: "application/zip" })]);
    expect(d.metadataOnly).toBe(1);
    expect(d.providerAttachments).toBeUndefined();
    expect(d.firstRequestContext).toContain("메타데이터만 (바이트 미전달)");
    expect(d.firstRequestContext).toContain("보았다고 주장하지 말고");
  });

  it("후속 라운드 컨텍스트는 본문을 다시 싣지 않고 ref만 유지", () => {
    const d = buildCodingAttachmentDelivery([
      base({ name: "notes.txt", storage: "local_cache", textContent: "secret body text here" }),
    ]);
    expect(d.followupContext).toBeTruthy();
    expect(d.followupContext).not.toContain("secret body text here");
    expect(d.followupContext).toContain("1라운드에서만 제공됨");
  });

  it("제어문자는 인라인 시 제거(탭/개행은 보존)", () => {
    const d = buildCodingAttachmentDelivery([
      base({ name: "x.txt", storage: "local_cache", textContent: "a\x07b\x00c\tD\nE" }),
    ]);
    // \x07, \x00 제거 → abc; 탭/개행은 보존
    expect(d.firstRequestContext).toContain("abc\tD\nE");
    expect(d.firstRequestContext).not.toContain("\x07");
    expect(d.firstRequestContext).not.toContain("\x00");
  });
});

describe("describeCodingAttachmentDelivery — 전송 후 정직 요약", () => {
  it("혼합 전달을 항목별로 요약", () => {
    const note = describeCodingAttachmentDelivery({
      providerAttachments: undefined,
      firstRequestContext: undefined,
      followupContext: undefined,
      images: 1,
      texts: 2,
      metadataOnly: 1,
    });
    expect(note).toContain("첨부 4개 전송");
    expect(note).toContain("이미지 1");
    expect(note).toContain("본문 2");
    expect(note).toContain("메타데이터만 1");
    expect(note).toContain("모델에 바이트가 전달되지 않음");
  });

  it("전부 0이면 요약 없음", () => {
    expect(
      describeCodingAttachmentDelivery({
        providerAttachments: undefined,
        firstRequestContext: undefined,
        followupContext: undefined,
        images: 0,
        texts: 0,
        metadataOnly: 0,
      }),
    ).toBeUndefined();
  });
});
