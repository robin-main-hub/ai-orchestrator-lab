// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WorkbenchAgent } from "../../types";
import type { AttachmentProcessingPlan } from "../../lib/attachmentProcessing";
import { Composer } from "./Composer";

afterEach(cleanup);

const agent: WorkbenchAgent = {
  configSource: "internal",
  enabled: true,
  id: "agent_orchestrator",
  kind: "virtual",
  name: "마키마",
  personaName: "orchestrator",
  role: "orchestrator",
  soulMode: "summary",
  modelId: "mimo-v2.5-pro",
  providerProfileId: "provider_mimo",
};

function renderComposer(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  return render(
    <Composer
      attachmentAccept="image/*"
      attachmentEnabled
      attachmentLimitReached={false}
      draftAttachments={[]}
      draftMessage=""
      maxDraftAttachments={5}
      onAddDraftAttachments={() => {}}
      onDraftMessageChange={() => {}}
      onRemoveDraftAttachment={() => {}}
      onSendMessage={() => {}}
      selectedAgent={agent}
      showDelegationChips={false}
      {...overrides}
    />,
  );
}

function imageItem(): DataTransferItem {
  return {
    kind: "file",
    type: "image/png",
    getAsFile: () => new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" }),
  } as unknown as DataTransferItem;
}

const rejectedPlan = (over: Partial<AttachmentProcessingPlan>): AttachmentProcessingPlan => ({
  kind: "document",
  name: "x",
  processingMode: "metadata_only",
  size: 10,
  status: "rejected",
  storage: "metadata_only",
  ...over,
});

describe("Composer 첨부 상호작용 (jsdom)", () => {
  it("클립보드 이미지를 Ctrl+V로 붙이면 onAddDraftAttachments(File[]) 호출 (Win+Shift+S)", () => {
    const onAddDraftAttachments = vi.fn();
    renderComposer({ onAddDraftAttachments });
    fireEvent.paste(screen.getByLabelText("메시지 입력"), { clipboardData: { items: [imageItem()] } });
    expect(onAddDraftAttachments).toHaveBeenCalledTimes(1);
    const files = onAddDraftAttachments.mock.calls[0]![0] as File[];
    expect(Array.isArray(files)).toBe(true);
    expect(files[0]!.name).toBe("shot.png");
  });

  it("이미지 없는(텍스트) paste는 onAddDraftAttachments 안 부르고 기본 동작 유지", () => {
    const onAddDraftAttachments = vi.fn();
    renderComposer({ onAddDraftAttachments });
    fireEvent.paste(screen.getByLabelText("메시지 입력"), {
      clipboardData: { items: [{ kind: "string", type: "text/plain", getAsFile: () => null } as unknown as DataTransferItem] },
    });
    expect(onAddDraftAttachments).not.toHaveBeenCalled();
  });

  it("거부된 첨부를 조용히 삼키지 않고 경고로 표면화 + 모델 능력 미달이면 모델 교체 CTA", () => {
    const onOpenModelPicker = vi.fn();
    renderComposer({
      rejectedAttachmentPlans: [rejectedPlan({ reason: "선택 모델이 이 첨부 종류를 지원하지 않음" })],
      onOpenModelPicker,
    });
    expect(screen.getByText(/추가되지 않았습니다/)).toBeTruthy();
    expect(screen.getByText(/선택 모델이 이 첨부 종류를 지원하지 않음/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /모델 바꾸기/ }));
    expect(onOpenModelPicker).toHaveBeenCalledTimes(1);
  });

  it("형식 자체 미지원 거부는 모델 교체 CTA 없음(모델 바꿔도 해결 안 됨)", () => {
    renderComposer({ rejectedAttachmentPlans: [rejectedPlan({ reason: "지원하지 않는 첨부 파일 형식" })], onOpenModelPicker: vi.fn() });
    expect(screen.getByText(/지원하지 않는 첨부 파일 형식/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /모델 바꾸기/ })).toBeNull();
  });
});
