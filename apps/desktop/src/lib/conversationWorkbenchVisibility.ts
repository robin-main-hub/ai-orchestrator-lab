export interface ConversationWorkbenchVisibilityInput {
  delegationItemCount: number;
  pendingApprovalCount: number;
  pendingProviderRetry: boolean;
}

export interface ConversationWorkbenchVisibility {
  showComposerDelegationChips: boolean;
  showInlineApprovalQueue: boolean;
  showInlineDelegation: boolean;
  showOverflowBranchControls: boolean;
}

export interface V0ConversationActionItem {
  id:
    | "promote-to-debate"
    | "create-coding-packet"
    | "create-agent-run"
    | "backup-status"
    | "telegram";
}

export function getConversationWorkbenchVisibility({
  pendingApprovalCount,
  pendingProviderRetry,
}: ConversationWorkbenchVisibilityInput): ConversationWorkbenchVisibility {
  return {
    showComposerDelegationChips: false,
    showInlineApprovalQueue: pendingProviderRetry && pendingApprovalCount > 0,
    showInlineDelegation: false,
    showOverflowBranchControls: false,
  };
}

export function getV0ConversationActionItems(): V0ConversationActionItem[] {
  return [
    { id: "promote-to-debate" },
    { id: "create-coding-packet" },
    { id: "create-agent-run" },
    { id: "backup-status" },
    { id: "telegram" },
  ];
}
