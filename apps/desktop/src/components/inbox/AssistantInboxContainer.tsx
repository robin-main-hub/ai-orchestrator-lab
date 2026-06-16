import { useMemo } from "react";
import { AssistantInbox } from "./AssistantInbox";
import { buildAssistantInboxProps } from "../../lib/assistantInboxProjection";

/**
 * LINE B/C — Assistant Inbox container.
 *
 * Thin mounting shell: it computes the AssistantInbox props once from the
 * generic projection module (evidence bridge / learning loop / runtime
 * manifest / runner gate) and renders the read-only inbox. It fires NO
 * callback on mount and triggers no provider/runtime/external call — the
 * projection is pure and memoized so render touches nothing.
 */
export function AssistantInboxContainer() {
  const props = useMemo(() => buildAssistantInboxProps(), []);
  return (
    <div className="nav-center-page" data-page="command_center">
      <AssistantInbox {...props} />
    </div>
  );
}
