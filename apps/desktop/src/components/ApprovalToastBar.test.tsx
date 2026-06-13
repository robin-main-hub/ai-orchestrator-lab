import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalToastBar } from "./ApprovalToastBar";

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
});
