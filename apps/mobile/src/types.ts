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

export type MobileTab = "chat" | "souls" | "system" | "more";

export type MobileMoreScreen =
  | "menu"
  | "memory"
  | "packets"
  | "debates"
  | "handoffs"
  | "approvals"
  | "settings-general"
  | "settings-connection";

/**
 * Mobile-local SOUL model. SOULs are personas (Orchestrator, Tracy, 본부장 등)
 * and may be embodied by any number of agents. The UI uses SOUL identity for
 * what the user sees -- avatar, name, chat background -- so backgrounds are
 * keyed on `soulId`, NOT agentId (which is a role like "reviewer").
 *
 * Wired to the real protocol-side SOUL/agent data in a follow-up PR; for now
 * we ship a few seeded SOULs so the UI can be exercised on device.
 */
export type MobileSoul = {
  id: string;
  name: string;
  /** Short tagline shown under the name. */
  tagline: string;
  /** Emoji or single-character avatar fallback (until real avatars). */
  avatarEmoji: string;
  /** Accent color (CSS color string) used for the avatar background. */
  accentColor: string;
  /** Optional reference to a SOUL markdown source so the user can drill in. */
  markdownPath?: string;
};

export type RuntimeStatus = "online" | "degraded" | "offline" | "syncing" | "unknown";

export type MobileRuntimeSnapshot = {
  status: RuntimeStatus;
  serverEndpoint?: string;
  lastProbeAt?: string;
  modelCount?: number;
  providerCount?: number;
};

export type MobileProviderEntry = {
  id: string;
  name: string;
  trustLevel: "trusted" | "limited" | "untrusted";
  secretAvailability: "available" | "missing" | "expired";
  modelCount: number;
  tags: string[];
};

export type MobileMemoryItem = {
  id: string;
  title: string;
  excerpt: string;
  trustLevel: "trusted" | "limited" | "untrusted";
  sourceChannel: "desktop" | "mobile" | "telegram" | "api" | "agent" | "system";
  createdAt: string;
};

export type MobileCodingPacket = {
  id: string;
  goal: string;
  status: "draft" | "ready" | "executing" | "done" | "blocked";
  filesToInspect: string[];
  createdAt: string;
};

export type MobileDebateRound = {
  id: string;
  debateTitle: string;
  kind: string;
  status: "pending" | "running" | "completed" | "blocked";
  utteranceCount: number;
};

export type MobileHandoff = {
  id: string;
  title: string;
  fromAgent: string;
  toAgent: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};
