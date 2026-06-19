import { describe, expect, it } from "vitest";
import {
  createCockpitLocalHealthIndicators,
  createCockpitServerSnapshotIndicator,
  resolveCockpitPayloadBindingStatus,
  sanitizeCockpitProjectionText,
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
      "DGX-02 미러 노드 오프라인",
      "기억 동기화 저하",
      "이벤트 발신함 동기화 실패: timeout while syncing",
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

  it("redacts prompt/tool/secret/path fragments before cockpit projection text reaches the UI", () => {
    expect(
      sanitizeCockpitProjectionText(
        "raw prompt: deploy with Bearer abc123 from /Users/robin/Documents/app and https://internal.example.test using sk-live-secret tp-slmvllbti6z4gmjnj5srk2r9nqdbhj5hteonqwswxks2o6ge",
      ),
    ).toBe(
      "[redacted:internal]",
    );

    expect(sanitizeCockpitProjectionText("tool input {\"command\":\"rm -rf /\"}")).toBe(
      "[redacted:internal]",
    );
  });

  it("only marks approval payloads as bound when replay metadata is trusted and not expired", () => {
    expect(
      resolveCockpitPayloadBindingStatus({
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        hasReplayMetadata: true,
        sourceTrust: "trusted",
      }),
    ).toBe("expired");

    expect(
      resolveCockpitPayloadBindingStatus({
        hasReplayMetadata: true,
        sourceTrust: "untrusted",
      }),
    ).toBe("unbound");

    expect(
      resolveCockpitPayloadBindingStatus({
        hasReplayMetadata: true,
        sourceTrust: "trusted",
      }),
    ).toBe("bound");
  });
});

// Characterization tests for the previously-uncovered fallback and partial-state
// branches (no behavior change). The existing suite exercises the all-clear,
// all-failing, and trusted/expired paths; these pin the "오류 원문 없음" fallbacks,
// the loaded-indicator timestamp paths, that each single subsystem trigger
// yields exactly one indicator (never the empty-state fallback), and that
// payload binding requires BOTH replay metadata AND trust while a future
// expiry does not mark the payload expired. All pure, no network/secret.
describe("cockpit projection health — fallback & partial-state characterization", () => {
  it("falls back to '오류 원문 없음' when an event-sync failure has no recorded error", () => {
    expect(
      createCockpitLocalHealthIndicators({
        dgxStatus: "online",
        eventSyncLastError: undefined,
        eventSyncStatus: "failed",
        memorySyncStatus: "synced",
      }),
    ).toEqual(["이벤트 발신함 동기화 실패: 오류 원문 없음"]);
  });

  it("emits exactly one indicator for a single offline DGX (no empty-state fallback)", () => {
    expect(
      createCockpitLocalHealthIndicators({
        dgxStatus: "offline",
        eventSyncStatus: "idle",
        memorySyncStatus: "synced",
      }),
    ).toEqual(["DGX-02 미러 노드 오프라인"]);
  });

  it("emits exactly one indicator for a single degraded memory sync", () => {
    expect(
      createCockpitLocalHealthIndicators({
        dgxStatus: "online",
        eventSyncStatus: "idle",
        memorySyncStatus: "degraded",
      }),
    ).toEqual(["기억 동기화 저하"]);
  });

  it("uses the timestamp for a loaded snapshot without a provider indicator", () => {
    expect(
      createCockpitServerSnapshotIndicator({
        status: "loaded",
        timestamp: "2026-06-05T00:00:00.000Z",
      }),
    ).toBe("서버 스냅샷 동기화됨: 2026-06-05T00:00:00.000Z");
  });

  it("falls back to '동기화 시각 없음' for a loaded snapshot with neither provider nor timestamp", () => {
    expect(createCockpitServerSnapshotIndicator({ status: "loaded" })).toBe(
      "서버 스냅샷 동기화됨: 동기화 시각 없음",
    );
  });

  it("falls back to '오류 원문 없음' for a failed snapshot with no error text", () => {
    expect(createCockpitServerSnapshotIndicator({ status: "failed" })).toBe(
      "서버 스냅샷 실패 · 로컬 투영 유지: 오류 원문 없음",
    );
  });

  it("does not mark a payload bound when replay metadata is absent even if trusted", () => {
    expect(
      resolveCockpitPayloadBindingStatus({
        hasReplayMetadata: false,
        sourceTrust: "trusted",
      }),
    ).toBe("unbound");
  });

  it("binds a trusted replay payload whose expiry is still in the future", () => {
    expect(
      resolveCockpitPayloadBindingStatus({
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        hasReplayMetadata: true,
        sourceTrust: "trusted",
      }),
    ).toBe("bound");
  });
});
