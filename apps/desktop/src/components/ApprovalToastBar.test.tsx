// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ApprovalToastBar } from "./ApprovalToastBar";
import type { ApprovalToastBarItem } from "../lib/approvalToastBar";

afterEach(() => cleanup());

const shinobu: ApprovalToastBarItem = {
  sourceItemId: "item_p",
  summary: "터미널 실행 · 빌드 검증",
  requester: {
    actor: "agent",
    name: "시노부",
    role: "Implementer",
    model: "claude-sonnet-4",
    avatarUrl: "data:image/png;base64,AAAA",
  },
};

describe("ApprovalToastBar", () => {
  it("승인 요약(라벨) + 허용/거절/이력을 렌더 — 가짜 명령·계열 버튼 없음", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBar
        item={{ sourceItemId: "item_1", summary: "터미널 실행 · 빌드 검증" }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onOpenHistory={vi.fn()}
      />,
    );
    expect(html).toContain("터미널 실행 · 빌드 검증");
    expect(html).toContain("허용");
    expect(html).toContain("거절");
    expect(html).toContain("이력");
    // 정직: 큐엔 실제 명령이 없으니 "계열"(명령 prefix 자동승인) 버튼을 두지 않는다
    expect(html).not.toContain("계열");
  });

  it("onOpenHistory 없으면 이력 버튼 숨김", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBar item={{ sourceItemId: "item_2", summary: "provider completion 승인 필요" }} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(html).toContain("허용");
    expect(html).toContain("거절");
    expect(html).not.toContain("이력");
  });

  it("스크린리더용 assertive aria-live", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBar item={{ sourceItemId: "item_3", summary: "test" }} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-label="승인 필요"');
  });

  it("신원이 있으면 동료 이름·역할·모델을 노출하고 동료 어조 헤더를 보여준다", () => {
    const { getByTestId } = render(
      <ApprovalToastBar item={shinobu} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(getByTestId("approval-toast-requester-name").textContent).toBe("시노부");
    expect(getByTestId("approval-toast-requester-role").textContent).toContain("Implementer");
    expect(getByTestId("approval-toast-requester-model").textContent).toContain("claude-sonnet-4");
    expect(getByTestId("approval-toast-ask-line").textContent).toContain("시노부");
    expect(getByTestId("approval-toast-ask-line").textContent).toContain("Implementer");
  });

  it("avatarUrl이 있으면 아바타 이미지를 보여준다", () => {
    const { getByTestId, queryByTestId } = render(
      <ApprovalToastBar item={shinobu} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    const avatar = getByTestId("approval-toast-requester-avatar") as HTMLImageElement;
    expect(avatar.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(queryByTestId("approval-toast-requester-initial")).toBeNull();
  });

  it("avatarUrl이 없으면 이니셜 폴백을 보여준다", () => {
    const { getByTestId, queryByTestId } = render(
      <ApprovalToastBar
        item={{ ...shinobu, requester: { actor: "agent", name: "Asuka", role: "Skeptic" } }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(getByTestId("approval-toast-requester-initial").textContent).toBe("A");
    expect(queryByTestId("approval-toast-requester-avatar")).toBeNull();
  });

  it("신원이 없으면 actor 라벨(에이전트)로 정직 폴백 — 가짜 이름 없음", () => {
    const { queryByTestId } = render(
      <ApprovalToastBar
        item={{ sourceItemId: "x", summary: "터미널 실행 · 빌드 검증" }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    // 신원 요소 자체가 없다(요약만 보여줌).
    expect(queryByTestId("approval-toast-requester")).toBeNull();
    expect(queryByTestId("approval-toast-ask-line")).toBeNull();
  });

  it("이름 없는 에이전트 신원이면 actor 라벨 '에이전트'를 이름으로 폴백", () => {
    const { getByTestId } = render(
      <ApprovalToastBar
        item={{ sourceItemId: "y", summary: "승인 필요", requester: { actor: "agent" } }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(getByTestId("approval-toast-requester-name").textContent).toBe("에이전트");
  });

  it("user actor면 운영자 라벨로 폴백", () => {
    const { getByTestId } = render(
      <ApprovalToastBar
        item={{ sourceItemId: "z", summary: "승인 필요", requester: { actor: "user" } }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(getByTestId("approval-toast-requester-name").textContent).toBe("운영자");
  });

  it("허용/거절/이력 콜백이 동작한다", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onOpenHistory = vi.fn();
    const { getByText } = render(
      <ApprovalToastBar item={shinobu} onApprove={onApprove} onReject={onReject} onOpenHistory={onOpenHistory} />,
    );
    fireEvent.click(getByText("허용"));
    fireEvent.click(getByText("거절"));
    fireEvent.click(getByText("이력"));
    expect(onApprove).toHaveBeenCalledWith("item_p");
    expect(onReject).toHaveBeenCalledWith("item_p");
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("commandPreview는 주어진 그대로만 노출 — 명령을 합성하지 않는다", () => {
    const { getByText, queryByText } = render(
      <ApprovalToastBar
        item={{ ...shinobu, commandPreview: "pnpm build", safeFamily: false }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(getByText("pnpm build")).toBeTruthy();
    // 신원/요약이 명령으로 둔갑하지 않는다
    expect(queryByText("시노부 build")).toBeNull();
  });
});
