import { describe, expect, it } from "vitest";
import {
  approvalStateLabel,
  costBadgeLabel,
  fallbackStatusLabel,
  mirrorHealthLabel,
  outboxSyncLabel,
  payloadBindingLabel,
  relativeMinutes,
  speedBadgeLabel,
  trustBadgeLabel,
  workerStatusLabel,
} from "./presentation";

describe("operator cockpit presentation labels", () => {
  it("renders cockpit status enums as Korean operator labels", () => {
    expect(payloadBindingLabel("bound")).toBe("페이로드 묶임");
    expect(payloadBindingLabel("unbound")).toBe("묶임 확인 필요");
    expect(approvalStateLabel("not_required")).toBe("승인 불필요");
    expect(workerStatusLabel("waiting_approval")).toBe("승인 대기");
    expect(fallbackStatusLabel("available")).toBe("대체 경로 있음");
    expect(mirrorHealthLabel("disconnected")).toBe("연결 끊김");
    expect(outboxSyncLabel("pending")).toBe("동기화 대기");
    expect(costBadgeLabel("high")).toBe("고비용");
    expect(speedBadgeLabel("slow")).toBe("느림");
    expect(trustBadgeLabel("limited")).toBe("제한 신뢰");
  });

  it("formats relative time in Korean", () => {
    expect(relativeMinutes(new Date().toISOString())).toBe("방금 전");

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeMinutes(fiveMinutesAgo)).toBe("5분 전");

    const twoHoursAgo = new Date(Date.now() - 122 * 60_000).toISOString();
    expect(relativeMinutes(twoHoursAgo)).toBe("2시간 전");
  });
});
