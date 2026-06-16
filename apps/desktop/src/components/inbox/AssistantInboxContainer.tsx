import { useMemo } from "react";
import { AssistantInbox } from "./AssistantInbox";
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
  const props = useMemo(
    () => (live === undefined ? buildAssistantInboxProps() : buildAssistantInboxLiveProps(live)),
    [live],
  );
  return (
    <div className="nav-center-page" data-page="command_center">
      <AssistantInbox {...props} />
    </div>
  );
}
