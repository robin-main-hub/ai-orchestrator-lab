export type MobileAttachmentKind = "image" | "document" | "clipboard-text";

export type MobileAttachment = {
  id: string;
  kind: MobileAttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Base64 data URL for images / clipboard images; undefined for documents larger than a small preview. */
  previewDataUrl?: string;
  /** Plain text content for clipboard-text attachments. */
  textContent?: string;
};

export type MobileMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: MobileAttachment[];
  createdAt: string;
};

export type MobileScreen = "chat" | "settings";
