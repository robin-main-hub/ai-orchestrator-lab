import { describe, expect, it } from "vitest";
import {
  getConversationWorkbenchVisibility,
  getV0ConversationActionItems,
} from "./conversationWorkbenchVisibility";

describe("getConversationWorkbenchVisibility", () => {
  it("keeps v0 conversation focused when nothing is waiting", () => {
    expect(
      getConversationWorkbenchVisibility({
        delegationItemCount: 2,
        pendingApprovalCount: 0,
        pendingProviderRetry: false,
      }),
    ).toEqual({
      showComposerDelegationChips: false,
      showInlineApprovalQueue: false,
      showInlineDelegation: false,
      showOverflowBranchControls: false,
    });
  });

  it("shows the inline approval card whenever something waits for a human decision", () => {
    // 대화 도구 루프(tmux dispatch 등)가 승인을 기다릴 때 카드가 안 뜨면
    // 턴이 멈춘 것처럼 보인다 — provider retry 여부와 무관하게 띄운다.
    expect(
      getConversationWorkbenchVisibility({
        delegationItemCount: 0,
        pendingApprovalCount: 1,
        pendingProviderRetry: false,
      }).showInlineApprovalQueue,
    ).toBe(true);
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
      "external-ingress",
    ]);
  });
});
