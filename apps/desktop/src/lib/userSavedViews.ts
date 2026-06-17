import { readJsonState, writeJsonState } from "./persistentJsonState";
import type { InboxViewMode, InboxFocus } from "../components/inbox/AssistantInbox";
import type { EventCategory } from "./eventClassification";

/**
 * Batch 12 LINE B — user-defined Saved Views. A named snapshot of the LOCAL view
 * state (mode + focus + category + search). Persisted to localStorage ONLY — a
 * local UI preference, never a server / EventStorage write, never an OS action.
 * No createdAt (avoids Date.now); identity is a deterministic slug of the name
 * so saving with an existing name upserts.
 */
export type UserSavedView = {
  id: string;
  name: string;
  mode: InboxViewMode;
  focus: InboxFocus;
  category: "all" | EventCategory;
  search: string;
};

const KEY = "ai-orchestrator.inbox-saved-views.v1";
const MAX = 24;
// Validation sets — kept in sync with the inbox unions (structural decoupling to
// avoid an import cycle with AssistantInbox).
const MODES = ["live", "preview", "replay", "sandbox"];
const FOCUSES = ["all", "today", "blocked", "warnings", "replay"];
const CATS = ["all", "failure", "learning", "runner", "approval", "memory", "project", "system"];

/** Deterministic id from a display name (no Date.now / random). */
export function slugifyViewName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "view";
}

export function isValidUserView(v: unknown): v is UserSavedView {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.name === "string" &&
    o.name.trim().length > 0 &&
    typeof o.mode === "string" &&
    MODES.includes(o.mode) &&
    typeof o.focus === "string" &&
    FOCUSES.includes(o.focus) &&
    typeof o.category === "string" &&
    CATS.includes(o.category) &&
    typeof o.search === "string"
  );
}

export function readUserViews(): UserSavedView[] {
  return readJsonState<UserSavedView[]>(KEY, [], (v) =>
    Array.isArray(v) ? (v.filter(isValidUserView) as UserSavedView[]) : [],
  );
}

export function writeUserViews(views: ReadonlyArray<UserSavedView>): void {
  writeJsonState(KEY, views.slice(0, MAX));
}

/** Upsert by id (newest first); saving an existing name overwrites it. */
export function upsertUserView(
  views: ReadonlyArray<UserSavedView>,
  view: UserSavedView,
): UserSavedView[] {
  return [view, ...views.filter((v) => v.id !== view.id)].slice(0, MAX);
}

export function removeUserView(
  views: ReadonlyArray<UserSavedView>,
  id: string,
): UserSavedView[] {
  return views.filter((v) => v.id !== id);
}
