import { describe, expect, it } from "vitest";
import {
  createCockpitLocalHealthIndicators,
  createCockpitServerSnapshotIndicator,
} from "./cockpitProjectionHealth";

describe("cockpit projection health labels", () => {
  it("does not present an empty local projection as fully operational", () => {
    expect(
      createCockpitLocalHealthIndicators({
        dgxStatus: "online",
        eventSyncLastError: undefined,
        eventSyncStatus: "idle",
        memorySyncStatus: "synced",
      }),
    ).toEqual(["로컬 경고 없음 · 서버 스냅샷은 별도 확인"]);
  });

  it("surfaces degraded memory and event sync failures", () => {
    expect(
      createCockpitLocalHealthIndicators({
        dgxStatus: "offline",
        eventSyncLastError: "timeout while syncing",
        eventSyncStatus: "failed",
        memorySyncStatus: "degraded",
      }),
    ).toEqual([
      "DGX-02 mirror node is offline",
      "Memory sync degraded",
      "Event outbox sync failure: timeout while syncing",
    ]);
  });

  it("labels server snapshot fallback as local projection instead of normal status", () => {
    expect(createCockpitServerSnapshotIndicator({ status: "idle" })).toBe(
      "서버 스냅샷 미연결 · 로컬 투영 표시 중",
    );
    expect(createCockpitServerSnapshotIndicator({ status: "loading" })).toBe("서버 스냅샷 동기화 중");
    expect(
      createCockpitServerSnapshotIndicator({
        error: "connection refused",
        status: "failed",
      }),
    ).toBe("서버 스냅샷 실패 · 로컬 투영 유지: connection refused");
    expect(
      createCockpitServerSnapshotIndicator({
        providerIndicator: "Provider registry: ready",
        status: "loaded",
        timestamp: "2026-06-05T00:00:00.000Z",
      }),
    ).toBe("서버 스냅샷 동기화됨: Provider registry: ready");
  });
});
