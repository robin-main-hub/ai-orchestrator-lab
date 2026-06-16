import { useEffect, useMemo, useState } from "react";
import {
  AssistantInbox,
  INBOX_VIEW_MODES,
  type InboxViewMode,
  type InboxCommand,
} from "./AssistantInbox";
import {
  buildAssistantInboxProps,
  buildAssistantInboxLiveProps,
  type AssistantInboxLiveInput,
} from "../../lib/assistantInboxProjection";
import { readJsonState, writeJsonState } from "../../lib/persistentJsonState";

/** LINE A — local UI preference key for the remembered seat (no server write). */
const INBOX_VIEW_MODE_KEY = "ai-orchestrator.inbox-view-mode.v1";

/** Read a remembered seat — only an ENABLED mode counts; else null (→ default). */
function readStoredViewMode(): InboxViewMode | null {
  const stored = readJsonState<string | null>(INBOX_VIEW_MODE_KEY, null, (v) =>
    typeof v === "string" ? v : null,
  );
  if (stored && INBOX_VIEW_MODES.some((m) => m.value === stored && m.enabled)) {
    return stored as InboxViewMode;
  }
  return null;
}

/**
 * LINE B/C/H — Assistant Inbox container.
 *
 * Thin mounting shell. It has two honest modes:
 *
 *   - LIVE (preferred): when a `live` input is provided (even an empty object),
 *     it projects each card from REAL app state via `buildAssistantInboxLiveProps`.
 *     Sources with no real data render an HONEST EMPTY STATE (never a fixture);
 *     the runner gate is always a real derived fact (dgx disabled → observed
 *     false). Evidence stays empty unless `live.includeEvidenceExample` opts into
 *     a clearly-labeled 예시(fixture).
 *
 *   - EXAMPLE (legacy / demo): with NO `live` prop it falls back to the neutral
 *     fixture composition, every section explicitly labeled 예시(fixture).
 *
 * It fires NO callback on mount and triggers no provider/runtime/external call —
 * both projections are pure and memoized so render touches nothing.
 */
export type AssistantInboxContainerProps = {
  /**
   * Real app state. Presence (even `{}`) switches the container to honest LIVE
   * mode. Absence keeps the legacy fixture/example composition.
   */
  live?: AssistantInboxLiveInput;
  /**
   * LINE A — remember the last seat across mounts in localStorage. Local UI
   * preference ONLY (no server / EventStorage write). Off by default so isolated
   * renders stay deterministic; the real app turns it on.
   */
  persistViewMode?: boolean;
  /** Batch 11 LINE C — one-shot view command from the Command Palette (view-only). */
  command?: InboxCommand;
};

export function AssistantInboxContainer({
  live,
  persistViewMode = false,
  command,
}: AssistantInboxContainerProps = {}) {
  // Default seat: LIVE when real app state is wired (the real app always passes
  // `live`, so the command center opens LIVE). It falls back to PREVIEW only in
  // isolation/demo, where there is no live data to honestly show. The seat is
  // pure UI state — switching it never writes anywhere (except the local pref).
  const [mode, setMode] = useState<InboxViewMode>(() => {
    if (persistViewMode) {
      const stored = readStoredViewMode();
      if (stored) return stored; // remembered enabled seat wins
    }
    // No (valid) stored seat → default. Real app (live wired) opens LIVE;
    // isolation/demo opens PREVIEW. Invalid/disabled stored values fall through here.
    return live === undefined ? "preview" : "live";
  });

  // Persist the seat as a local UI preference only when explicitly enabled.
  useEffect(() => {
    if (persistViewMode) writeJsonState(INBOX_VIEW_MODE_KEY, mode);
  }, [persistViewMode, mode]);

  // Batch 11 LINE C — the container owns the seat, so it applies mode commands
  // from the palette (e.g. "Switch to REPLAY"); filter commands flow to the inbox.
  useEffect(() => {
    if (command?.kind === "mode" && command.value) setMode(command.value as InboxViewMode);
  }, [command]);

  // DATA-PLANE SEPARATION (Batch 5 LINE S): each seat reads ONE projection and
  // never the other. liveProjection (buildAssistantInboxLiveProps) and
  // previewProjection (buildAssistantInboxProps) are distinct, pure functions;
  // PREVIEW never receives `live`, LIVE never receives fixtures. So no fixture
  // can leak into a live card and vice versa.
  const props = useMemo(() => {
    if (mode === "preview") return buildAssistantInboxProps();
    if (mode === "live") return buildAssistantInboxLiveProps(live ?? {});
    // REPLAY / SANDBOX are disabled placeholders this batch — render an honest
    // empty live frame (no fixtures) until their real sources are wired.
    return buildAssistantInboxLiveProps({});
  }, [mode, live]);

  // LINE A/C — strip extras. LIVE surfaces real event-log/record counts and an
  // honest source label; PREVIEW marks the source as fixture; placeholders none.
  const stripExtras =
    mode === "live"
      ? {
          eventCount: live?.eventLogCount,
          recordCount: live?.projectRecords?.length,
          lastUpdateSource: live?.eventLogCount ? "eventLog" : "no live data",
          // Batch 8 LINE B — real timed events feed the Today/Recent lanes.
          recentEvents: live?.recentEvents,
          nowMs: live?.nowMs,
        }
      : mode === "preview"
        ? { lastUpdateSource: "fixture" }
        : mode === "replay"
          ? {
              // LINE C — replay reads the real eventLog read-only; surface its size
              // and feed the deck. No write/append/activation/server.
              eventCount: live?.recentEvents?.length,
              lastUpdateSource: "replay (read-only)",
              recentEvents: live?.recentEvents,
              nowMs: live?.nowMs,
            }
          : {};

  return (
    <div className="nav-center-page" data-page="command_center" data-safe-bottom="true">
      <AssistantInbox
        {...props}
        {...stripExtras}
        mode={mode}
        onModeChange={setMode}
        persistFilters={persistViewMode}
        command={command}
      />
    </div>
  );
}
