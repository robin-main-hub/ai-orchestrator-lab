import type { ConversationMessage } from "@ai-orchestrator/protocol";

export function createCompletionMemoryRecallMessages(
  previousMessages: ConversationMessage[],
  currentUserMessage: ConversationMessage,
): ConversationMessage[] {
  if (previousMessages.some((message) => message.id === currentUserMessage.id)) {
    return previousMessages;
  }
  return [...previousMessages, currentUserMessage];
}
