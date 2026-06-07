import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import {
  attachmentProcessingLabel,
  assistantPendingLabel,
  approvalPermissionListLabel,
  createAssistantRuntimeEvidenceBadges,
  delegationStatusLabel,
  resolveAssistantMessageStatusSummary,
  shouldShowAssistantPendingBubble,
} from "./MessageThread";

function message(role: ConversationMessage["role"]): ConversationMessage {
  return {
    id: `message_${role}`,
    role,
    content: role,
    createdAt: "2026-06-06T00:00:00.000Z",
    sessionId: "session_test",
  };
}

describe("MessageThread pending assistant state", () => {
  it("shows a pending assistant bubble after a user message while the selected agent is preparing or responding", () => {
    expect(shouldShowAssistantPendingBubble([message("user")], "preparing")).toBe(true);
    expect(shouldShowAssistantPendingBubble([message("user")], "responding")).toBe(true);
    expect(shouldShowAssistantPendingBubble([message("user")], "tooling")).toBe(true);
    expect(shouldShowAssistantPendingBubble([message("user")], "waiting_approval")).toBe(true);
  });

  it("does not show a pending assistant bubble after an assistant message or while idle", () => {
    expect(shouldShowAssistantPendingBubble([message("assistant")], "preparing")).toBe(false);
    expect(shouldShowAssistantPendingBubble([message("user")], "idle")).toBe(false);
    expect(shouldShowAssistantPendingBubble([], "responding")).toBe(false);
  });

  it("uses Korean status copy for the visible waiting state", () => {
    expect(assistantPendingLabel("preparing")).toBe("요청을 정리하고 있어요");
    expect(assistantPendingLabel("responding")).toBe("답변을 다듬고 있어요");
    expect(assistantPendingLabel("tooling")).toBe("도구를 고르는 중이에요");
    expect(assistantPendingLabel("capturing")).toBe("작업창을 읽는 중이에요");
    expect(assistantPendingLabel("dispatching")).toBe("명령을 전달하는 중이에요");
    expect(assistantPendingLabel("waiting_approval")).toBe("승인을 기다리고 있어요");
    expect(assistantPendingLabel("error")).toBe("막힌 원인을 정리하고 있어요");
  });

  it("keeps provider failure status visible on assistant messages without leaking raw URLs", () => {
    const summary = resolveAssistantMessageStatusSummary({
      ...message("assistant"),
      metadata: {
        error: "http://dgx-02:4317: Failed to fetch",
        realProviderCall: false,
      },
    });

    expect(summary).toEqual({
      detail: "[redacted:url] Failed to fetch",
      label: "호출 실패",
      variant: "danger",
    });
  });

  it("keeps provider approval status visible on assistant messages", () => {
    const summary = resolveAssistantMessageStatusSummary({
      ...message("assistant"),
      metadata: {
        providerProfileId: "provider_mimo_token_openai",
        requiresServerApproval: true,
      },
    });

    expect(summary).toEqual({
      detail: "승인 후 같은 요청을 이어 붙일 수 있습니다.",
      label: "승인 필요",
      variant: "warning",
    });
  });

  it("surfaces persona, memory, runtime config, and tool evidence on assistant messages", () => {
    const badges = createAssistantRuntimeEvidenceBadges({
      ...message("assistant"),
      metadata: {
        personaSoulApplied: true,
        personaAgentsMdApplied: true,
        recalledMemoryCount: 3,
        runtimeConfigFileIds: ["config_soul", "config_tools"],
        roleToolProfileTools: ["work.queue", "approval"],
      },
    });

    expect(badges.map((badge) => badge.label)).toEqual([
      "SOUL",
      "AGENTS",
      "기억 3개",
      "인격 파일 2개",
      "도구 2개",
    ]);
  });

  it("uses conservative Korean copy for completed provider responses", () => {
    const summary = resolveAssistantMessageStatusSummary({
      ...message("assistant"),
      metadata: {
        realProviderCall: true,
        providerProfileId: "provider_apifun_claude",
        modelId: "claude-opus-4-8",
      },
    });

    expect(summary).toEqual({
      detail: "모델 응답이 기록되고 공개 작업 로그로 요약되었습니다.",
      label: "응답 기록",
      variant: "success",
    });
  });

  it("uses Korean copy for delegation status badges", () => {
    expect(delegationStatusLabel("succeeded")).toBe("완료");
    expect(delegationStatusLabel("blocked")).toBe("차단");
    expect(delegationStatusLabel("failed")).toBe("실패");
    expect(delegationStatusLabel("unknown_target")).toBe("대상 없음");
    expect(delegationStatusLabel("self_delegation")).toBe("자기위임 차단");
    expect(delegationStatusLabel("detected")).toBe("감지됨");
  });

  it("renders approval permissions as Korean user-facing labels", () => {
    expect(approvalPermissionListLabel([])).toBe("보기 전용");
    expect(approvalPermissionListLabel(["read_only", "provider_completion", "terminal_run"])).toBe(
      "보기 전용, 모델 호출, 터미널 실행",
    );
  });

  it("renders attachment metadata mode as a natural Korean label", () => {
    expect(attachmentProcessingLabel("metadata_only")).toBe("파일 정보만");
  });
});
