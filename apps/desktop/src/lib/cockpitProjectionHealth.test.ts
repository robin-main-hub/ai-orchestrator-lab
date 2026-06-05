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
      "원문 프롬프트: deploy with Bearer [token] from [local-path] and [url] using [secret] [secret]",
    );

    expect(sanitizeCockpitProjectionText("tool input {\"command\":\"rm -rf /\"}")).toBe(
      "도구 입력 [redacted]",
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
