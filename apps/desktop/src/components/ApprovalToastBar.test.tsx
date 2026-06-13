import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalToastBar } from "./ApprovalToastBar";

describe("ApprovalToastBar", () => {
  it("승인 요약 + 명령 + 액션 버튼을 렌더", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBar
        item={{ sourceItemId: "item_1", summary: "pnpm test 실행 승인 필요", command: "pnpm test" }}
        onApprove={vi.fn()}
        onApprovePattern={vi.fn()}
        onReject={vi.fn()}
        onOpenHistory={vi.fn()}
      />,
    );
    expect(html).toContain("pnpm test 실행 승인 필요");
    expect(html).toContain("pnpm test");
    expect(html).toContain("허용");
    expect(html).toContain("계열");
    expect(html).toContain("거절");
    expect(html).toContain("이력");
  });

  it("명령이 없으면 계열 버튼 숨김", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBar item={{ sourceItemId: "item_2", summary: "provider completion 승인 필요" }} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(html).toContain("허용");
    expect(html).toContain("거절");
    expect(html).not.toContain("계열");
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
