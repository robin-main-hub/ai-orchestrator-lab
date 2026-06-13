import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { deriveApprovalEvidence, isSafeSubsetApprovable } from "./approvalCommandEvidence";

function item(overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem {
  return {
    id: "q1",
    sourceItemId: "s1",
    summary: "승인 필요",
    requestedBy: "agent",
    permissions: ["run_safe_commands"],
    state: "required",
    createdAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveApprovalEvidence — 정직 증거 분류", () => {
  it("진짜 명령이 있으면 command + 안전 계열 판정", () => {
    const evidence = deriveApprovalEvidence(item({ action: "terminal_run", commandPreview: "ls -la" }));
    expect(evidence.kind).toBe("command");
    if (evidence.kind === "command") {
      expect(evidence.commandPreview).toBe("ls -la");
      expect(evidence.safe.allowed).toBe(true);
    }
  });

  it("위험 명령은 command지만 safe.allowed=false", () => {
    const evidence = deriveApprovalEvidence(item({ action: "terminal_run", commandPreview: "rm -rf /" }));
    expect(evidence.kind).toBe("command");
    if (evidence.kind === "command") expect(evidence.safe.allowed).toBe(false);
  });

  it("provider_completion은 명령 없이 cost(토큰 추정)", () => {
    const evidence = deriveApprovalEvidence(item({ action: "provider_completion", costEstimateTokens: 1200 }));
    expect(evidence).toEqual({ kind: "cost", costEstimateTokens: 1200 });
  });

  it("commandPreview 없고 cost도 아니면 none", () => {
    expect(deriveApprovalEvidence(item({ action: "git_push" })).kind).toBe("none");
    expect(deriveApprovalEvidence(item({ action: "secret_view" })).kind).toBe("none");
  });

  it("요약을 명령으로 합성하지 않는다 — commandPreview 없으면 절대 command 아님", () => {
    const evidence = deriveApprovalEvidence(item({ summary: "터미널 실행 · ls -la", action: "terminal_run" }));
    expect(evidence.kind).not.toBe("command");
  });

  it("빈/공백 commandPreview는 명령으로 보지 않음", () => {
    expect(deriveApprovalEvidence(item({ commandPreview: "   " })).kind).toBe("none");
  });
});

describe("isSafeSubsetApprovable — 작업 C 게이트", () => {
  it("진짜 명령 + 안전 계열일 때만 true", () => {
    expect(isSafeSubsetApprovable(item({ action: "terminal_run", commandPreview: "cat README.md" }))).toBe(true);
  });
  it("위험 명령은 false", () => {
    expect(isSafeSubsetApprovable(item({ action: "terminal_run", commandPreview: "git push origin main" }))).toBe(false);
  });
  it("명령 없는 provider/merge/secret은 전부 false", () => {
    expect(isSafeSubsetApprovable(item({ action: "provider_completion", costEstimateTokens: 10 }))).toBe(false);
    expect(isSafeSubsetApprovable(item({ action: "git_push" }))).toBe(false);
    expect(isSafeSubsetApprovable(item({ action: "secret_view" }))).toBe(false);
  });
});
