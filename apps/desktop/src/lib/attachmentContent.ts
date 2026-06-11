import type { ConversationAttachment, ProviderCompletionAttachment } from "@ai-orchestrator/protocol";

/**
 * Real attachment content delivery (item 3). Reads the picked file's bytes
 * into the attachment record so the provider request can carry them:
 *   - images  → base64 data URL (≤ 4MB), mapped to vision blocks by adapters
 *   - text-like documents → inline textContent (≤ 64K chars, truncation marked)
 *   - everything else stays metadata_only (name/type/size context only)
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 64_000;
export const MAX_PROVIDER_ATTACHMENTS = 6;

const TEXT_EXTENSION_PATTERN =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html|css|js|jsx|ts|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|sh|bash|sql|toml|ini|cfg|conf|log|env\.example)$/i;

export function isTextLikeAttachment(name: string, mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (/^application\/(json|x-yaml|xml|javascript|typescript|x-sh)/.test(mimeType)) return true;
  return TEXT_EXTENSION_PATTERN.test(name);
}

/** minimal File/Blob surface so tests can pass plain fakes */
export type AttachmentSourceFile = {
  name: string;
  type: string;
  size: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * Fills textContent / dataUrl on a metadata-only attachment from the source
 * file. Failures degrade to the original metadata-only record — sending the
 * message must never be blocked by a file read.
 */
export async function readAttachmentContent(
  file: AttachmentSourceFile,
  attachment: ConversationAttachment,
): Promise<ConversationAttachment> {
  try {
    if (attachment.kind === "image" && file.type.startsWith("image/")) {
      if (file.size > MAX_IMAGE_BYTES) {
        return { ...attachment, truncated: true };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return {
        ...attachment,
        storage: "local_cache",
        dataUrl: `data:${file.type};base64,${bytesToBase64(bytes)}`,
      };
    }
    if (isTextLikeAttachment(file.name, file.type)) {
      const text = await file.text();
      const truncated = text.length > MAX_TEXT_CHARS;
      return {
        ...attachment,
        storage: "local_cache",
        textContent: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
        truncated: truncated || undefined,
      };
    }
    return attachment;
  } catch {
    return attachment;
  }
}

/** attachments that actually carry content, mapped onto the provider request rider */
export function toProviderAttachments(
  attachments: ReadonlyArray<ConversationAttachment> | undefined,
): ProviderCompletionAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  const mapped = attachments
    .filter((attachment) => attachment.dataUrl || attachment.textContent)
    .slice(0, MAX_PROVIDER_ATTACHMENTS)
    .map((attachment) => ({
      name: attachment.name,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      dataUrl: attachment.dataUrl,
      textContent: attachment.textContent,
    }));
  return mapped.length > 0 ? mapped : undefined;
}

/** parse `metadata.attachments` defensively (metadata is a free-form record) */
export function extractMessageAttachments(
  metadata: Record<string, unknown> | undefined,
): ConversationAttachment[] {
  const raw = metadata?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ConversationAttachment =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as ConversationAttachment).name === "string" &&
      typeof (entry as ConversationAttachment).mimeType === "string",
  );
}
