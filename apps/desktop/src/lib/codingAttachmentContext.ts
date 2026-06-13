import type { ConversationAttachment, ProviderCompletionAttachment } from "@ai-orchestrator/protocol";

/**
 * Honest attachment delivery for the coding tool loop.
 *
 * Two real channels (mirrors the conversation pipeline, verified against the
 * adapters):
 *   - images with a base64 data URL → provider `attachments` rider; both the
 *     Anthropic and OpenAI-compatible adapters map these to vision blocks on
 *     the last user turn. Non-image riders are dropped by the adapters, so we
 *     never put text there.
 *   - text/document bodies → inlined into a system context string, because the
 *     adapters ignore textContent riders. Everything else stays metadata-only
 *     and is honestly flagged as "bytes not delivered".
 *
 * The coding agent runs a multi-round tool loop where the system/user messages
 * persist across rounds. Re-sending attachment bodies every round would explode
 * the token budget, so we split delivery:
 *   - `firstRequestContext` (full bodies) is injected ONLY on the first request.
 *   - `followupContext` (a short ref, no bodies) is injected on later rounds so
 *     the model still knows the attachments existed without paying for them
 *     again.
 */

/** prompt budget per inlined text attachment — read-time already caps at 64K */
const INLINE_CHAR_LIMIT = 12_000;
/** at most this many attachments are described/inlined into one request */
const MAX_DESCRIBED = 6;

export type CodingAttachmentDelivery = {
  /** image riders for the FIRST provider request (vision-deliverable bytes only) */
  providerAttachments: ProviderCompletionAttachment[] | undefined;
  /** full attachment context (bodies inlined) — first request only */
  firstRequestContext: string | undefined;
  /** short attachment reminder (no bodies) — subsequent tool rounds */
  followupContext: string | undefined;
  /** images whose bytes are actually delivered as vision input */
  images: number;
  /** text/document attachments whose body is inlined into the prompt */
  texts: number;
  /** attachments delivered as metadata only (bytes NOT delivered to the model) */
  metadataOnly: number;
};

/** strip control characters (except tab/newline/CR) that would corrupt the inlined prompt block */
function sanitizeInline(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function isDeliverableImage(attachment: ConversationAttachment): boolean {
  return (
    attachment.kind === "image" &&
    typeof attachment.dataUrl === "string" &&
    attachment.dataUrl.startsWith("data:")
  );
}

function attachmentText(attachment: ConversationAttachment): string {
  return typeof attachment.textContent === "string" ? attachment.textContent : "";
}

/**
 * Classifies each attachment into its real delivery channel and builds the
 * prompt context strings + image riders. Pure — no I/O, no clock.
 */
export function buildCodingAttachmentDelivery(
  attachments: ReadonlyArray<ConversationAttachment>,
): CodingAttachmentDelivery {
  const empty: CodingAttachmentDelivery = {
    providerAttachments: undefined,
    firstRequestContext: undefined,
    followupContext: undefined,
    images: 0,
    texts: 0,
    metadataOnly: 0,
  };
  if (!attachments || attachments.length === 0) return empty;

  const described = attachments.slice(0, MAX_DESCRIBED);
  const imageRiders: ProviderCompletionAttachment[] = [];
  const lines: string[] = [];
  const bodyBlocks: string[] = [];
  const refParts: string[] = [];
  let images = 0;
  let texts = 0;
  let metadataOnly = 0;

  described.forEach((attachment, index) => {
    const name = sanitizeInline(attachment.name || `attachment_${index + 1}`);
    const kind = attachment.kind;
    if (isDeliverableImage(attachment)) {
      images += 1;
      imageRiders.push({
        name: attachment.name,
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        dataUrl: attachment.dataUrl,
      });
      lines.push(`${index + 1}. ${name} · kind=${kind} · 이미지 바이트가 이 요청에 동봉됨 (비전 입력으로 직접 볼 수 있음)`);
      refParts.push(`${name}(이미지·1라운드 비전 제공)`);
      return;
    }
    const body = attachmentText(attachment);
    if (body.trim()) {
      texts += 1;
      const overBudget = body.length > INLINE_CHAR_LIMIT;
      const inlined = overBudget ? body.slice(0, INLINE_CHAR_LIMIT) : body;
      const truncationNote = attachment.truncated === true || overBudget ? " (일부만 — 원본이 더 김)" : "";
      bodyBlocks.push(
        [`--- 첨부 본문: ${name}${truncationNote} ---`, sanitizeInline(inlined), "--- 첨부 본문 끝 ---"].join("\n"),
      );
      lines.push(`${index + 1}. ${name} · kind=${kind} · 본문이 아래에 인라인됨${truncationNote}`);
      refParts.push(`${name}(본문·1라운드 제공)`);
      return;
    }
    metadataOnly += 1;
    const storage = sanitizeInline(attachment.storage ?? "metadata_only");
    lines.push(`${index + 1}. ${name} · kind=${kind} · storage=${storage} · 메타데이터만 (바이트 미전달)`);
    refParts.push(`${name}(메타데이터만·미전달)`);
  });

  const disclaimer =
    metadataOnly > 0
      ? "메타데이터만 전달된 첨부가 있음 — 해당 파일 바이트는 모델에 직접 전달되지 않음. 그 첨부 내용을 보았다고 주장하지 말고, 필요하면 추가 추출/권한을 요청한다."
      : undefined;

  const firstRequestContext = ["첨부 컨텍스트:", disclaimer, ...lines, ...bodyBlocks].filter(Boolean).join("\n");

  const followupContext =
    refParts.length > 0
      ? [
          `이번 턴 첨부(본문/이미지는 1라운드에서만 제공됨): ${refParts.join(", ")}.`,
          "본문이 더 필요하면 사용자에게 재첨부를 요청하고, 보지 못한 내용을 추측하지 않는다.",
        ].join("\n")
      : undefined;

  return {
    providerAttachments: imageRiders.length > 0 ? imageRiders.slice(0, 6) : undefined,
    firstRequestContext,
    followupContext,
    images,
    texts,
    metadataOnly,
  };
}

/** one-line honest summary for the post-send notice */
export function describeCodingAttachmentDelivery(delivery: CodingAttachmentDelivery): string | undefined {
  const total = delivery.images + delivery.texts + delivery.metadataOnly;
  if (total === 0) return undefined;
  const parts = [
    delivery.images > 0 ? `이미지 ${delivery.images}` : undefined,
    delivery.texts > 0 ? `본문 ${delivery.texts}` : undefined,
    delivery.metadataOnly > 0 ? `메타데이터만 ${delivery.metadataOnly}` : undefined,
  ].filter(Boolean);
  const tail = delivery.metadataOnly > 0 ? " · 메타데이터만 항목은 모델에 바이트가 전달되지 않음" : "";
  return `첨부 ${total}개 전송 (${parts.join(" · ")})${tail}`;
}
