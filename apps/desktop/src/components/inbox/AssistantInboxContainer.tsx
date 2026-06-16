import { useMemo, useState } from "react";
import { AssistantInbox, type InboxViewMode } from "./AssistantInbox";
import {
  buildAssistantInboxProps,
  buildAssistantInboxLiveProps,
  type AssistantInboxLiveInput,
} from "../../lib/assistantInboxProjection";

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
};

export function AssistantInboxContainer({ live }: AssistantInboxContainerProps = {}) {
  // Default seat: LIVE when real app state is wired (the real app always passes
  // `live`, so the command center opens LIVE). It falls back to PREVIEW only in
  // isolation/demo, where there is no live data to honestly show. The seat is
  // pure UI state — switching it never writes anywhere.
  const [mode, setMode] = useState<InboxViewMode>(live === undefined ? "preview" : "live");

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

  return (
    <div className="nav-center-page" data-page="command_center">
      <AssistantInbox {...props} mode={mode} onModeChange={setMode} />
    </div>
  );
}
