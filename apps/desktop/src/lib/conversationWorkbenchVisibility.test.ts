import { describe, expect, it } from "vitest";
import {
  getConversationWorkbenchVisibility,
  getV0ConversationActionItems,
} from "./conversationWorkbenchVisibility";

describe("getConversationWorkbenchVisibility", () => {
  it("keeps v0 conversation focused when there are no urgent inline items", () => {
    expect(
      getConversationWorkbenchVisibility({
        delegationItemCount: 2,
        pendingApprovalCount: 2,
        pendingProviderRetry: false,
      }),
    ).toEqual({
      showComposerDelegationChips: false,
      showInlineApprovalQueue: false,
      showInlineDelegation: false,
      showOverflowBranchControls: false,
    });
  });

  it("allows inline approval only when approving restores a blocked provider retry", () => {
    expect(
      getConversationWorkbenchVisibility({
        delegationItemCount: 0,
        pendingApprovalCount: 1,
        pendingProviderRetry: true,
      }).showInlineApprovalQueue,
    ).toBe(true);
  });
});

describe("getV0ConversationActionItems", () => {
  it("matches the v0 first-row action order", () => {
    expect(getV0ConversationActionItems().map((item) => item.id)).toEqual([
      "promote-to-debate",
      "create-coding-packet",
      "create-agent-run",
      "backup-status",
      "telegram",
    ]);
  });
});
