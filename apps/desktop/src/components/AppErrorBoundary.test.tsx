import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

describe("AppErrorBoundary", () => {
  it("자식이 정상이면 그대로 렌더", () => {
    const html = renderToStaticMarkup(
      <AppErrorBoundary>
        <span>정상 화면</span>
      </AppErrorBoundary>,
    );
    expect(html).toContain("정상 화면");
    expect(html).not.toContain("화면을 그리다 문제가 생겼어요");
  });

  it("getDerivedStateFromError가 에러를 상태로 전환 (화이트스크린 대신 카드)", () => {
    const next = AppErrorBoundary.getDerivedStateFromError(new Error("의도적 폭발"));
    expect(next.error).toBeInstanceOf(Error);
    expect(next.error?.message).toBe("의도적 폭발");
  });
});
