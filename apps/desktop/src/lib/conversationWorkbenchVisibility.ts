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
    | "external-ingress";
}

export function getConversationWorkbenchVisibility({
  pendingApprovalCount,
}: ConversationWorkbenchVisibilityInput): ConversationWorkbenchVisibility {
  return {
    showComposerDelegationChips: false,
    // 승인 대기가 있으면 항상 카드를 띄운다 — 대화 도구 루프가 사람 승인을
    // 기다리는 동안 카드가 없으면 턴이 멈춘 것처럼 보인다 (provider retry
    // 시나리오에만 묶여 있던 과거 조건이 그 증상의 원인이었다)
    showInlineApprovalQueue: pendingApprovalCount > 0,
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
    { id: "external-ingress" },
  ];
}
