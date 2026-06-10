import type { CodingSession } from "./codingChat";

/**
 * localStorage persistence for coding sessions (mirrors hermesPoolStore).
 * Sessions survive app restarts; a corrupt entry falls back to empty.
 */

export const CODING_SESSIONS_STORAGE_KEY = "ai-orch.codingSessions.v1";
const MAX_PERSISTED_SESSIONS = 30;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadCodingSessions(storage: StorageLike | null = defaultStorage()): CodingSession[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CODING_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CodingSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((session) => typeof session?.id === "string" && Array.isArray(session.messages));
  } catch {
    return [];
  }
}

export function saveCodingSessions(
  sessions: ReadonlyArray<CodingSession>,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    // newest-updated first, capped so the entry never grows unbounded
    const trimmed = [...sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_PERSISTED_SESSIONS);
    storage.setItem(CODING_SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota issues must never break a turn
  }
}
