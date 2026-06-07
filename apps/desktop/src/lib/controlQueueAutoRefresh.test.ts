import { describe, expect, it } from "vitest";
import { shouldRefreshControlQueueOnOpen } from "./controlQueueAutoRefresh";

describe("shouldRefreshControlQueueOnOpen", () => {
  it("닫힘에서 열림으로 바뀌면 서버 승인 큐 새로고침을 요청한다", () => {
    expect(shouldRefreshControlQueueOnOpen({ isOpen: true, previousOpen: false, status: "idle" })).toBe(true);
  });

  it("이미 열려 있거나 로딩 중이면 중복 새로고침하지 않는다", () => {
    expect(shouldRefreshControlQueueOnOpen({ isOpen: true, previousOpen: true, status: "ready" })).toBe(false);
    expect(shouldRefreshControlQueueOnOpen({ isOpen: true, previousOpen: false, status: "loading" })).toBe(false);
    expect(shouldRefreshControlQueueOnOpen({ isOpen: false, previousOpen: true, status: "ready" })).toBe(false);
  });
});
