import type { DraftAttachment, WorkbenchAgent } from "../types";

export function getCanSend({
  selectedAgent,
  isStreaming,
  draftMessage,
  draftAttachments,
}: {
  selectedAgent?: WorkbenchAgent;
  isStreaming: boolean;
  draftMessage: string;
  draftAttachments: DraftAttachment[];
}) {
  return (
    Boolean(selectedAgent) &&
    !isStreaming &&
    (draftMessage.trim().length > 0 || draftAttachments.length > 0)
  );
}
