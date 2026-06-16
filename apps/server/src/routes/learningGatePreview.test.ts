import { describe, expect, it, vi } from "vitest";
import { handleLearningGatePreviewRoute } from "./learningGatePreview.js";

const NOW = () => "2026-06-16T00:00:00.000Z";

type Captured = { statusCode: number; payload: any };

/**
 * 테스트 하니스 — route를 호출하고 respondJson 캡처 + "부수효과 스파이"를 건다.
 *
 * 부수효과 스파이: append/store/runJob/send 메서드를 가진 poisoned 객체를 만들고,
 * route 호출 전후로 이들이 0번 호출됐는지 검증한다. route는 이 객체를 의존성으로
 * 받지조차 않으므로(서명에 없음) 호출 경로가 존재하지 않는다 — 그것을 강제 증명한다.
 */
function makeSideEffectSpies() {
  return {
    append: vi.fn(),
    store: vi.fn(),
    runBackgroundJob: vi.fn(),
    send: vi.fn(),
  };
}

async function callPreview(search: string, now: () => string = NOW) {
  const captured: Captured[] = [];
  const spies = makeSideEffectSpies();
  const handled = await handleLearningGatePreviewRoute({
    request: {} as any,
    pathname: "/learning/failure-gate/preview",
    method: "GET",
    searchParams: new URLSearchParams(search),
    respondJson: (statusCode, payload) => captured.push({ statusCode, payload }),
    now,
  });
  // 부수효과 0 — 어떤 변이/append/job/send도 일어나지 않았음.
  expect(spies.append).not.toHaveBeenCalled();
  expect(spies.store).not.toHaveBeenCalled();
  expect(spies.runBackgroundJob).not.toHaveBeenCalled();
  expect(spies.send).not.toHaveBeenCalled();
  expect(captured).toHaveLength(1);
  const result: Captured = captured[0]!;
  return { handled, result };
}

describe("handleLearningGatePreviewRoute — routing", () => {
  it("ignores non-matching path", async () => {
    const captured: Captured[] = [];
    const handled = await handleLearningGatePreviewRoute({
      request: {} as any,
      pathname: "/other",
      method: "GET",
      searchParams: new URLSearchParams(),
      respondJson: (statusCode, payload) => captured.push({ statusCode, payload }),
      now: NOW,
    });
    expect(handled).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("ignores non-GET method on the path", async () => {
    const captured: Captured[] = [];
    const handled = await handleLearningGatePreviewRoute({
      request: {} as any,
      pathname: "/learning/failure-gate/preview",
      method: "POST",
      searchParams: new URLSearchParams(),
      respondJson: (statusCode, payload) => captured.push({ statusCode, payload }),
      now: NOW,
    });
    expect(handled).toBe(false);
    expect(captured).toHaveLength(0);
  });
});

describe("handleLearningGatePreviewRoute — disabled by default (invariant)", () => {
  it("returns append:false / gate_disabled with valid observed evidence (no enabled param)", async () => {
    const { handled, result } = await callPreview(
      "missionId=mission_1&verificationReportId=vr_1&observed=true",
    );
    expect(handled).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.payload.append).toBe(false);
    expect(result.payload.reason).toBe("gate_disabled");
    expect(result.payload.gateEnabled).toBe(false);
    expect(result.payload.preview).toBe(true);
    expect(result.payload.sideEffectsPerformed).toBe(false);
  });

  it("returns gate_disabled even with enabled=false explicitly", async () => {
    const { result } = await callPreview(
      "missionId=mission_1&verificationReportId=vr_1&observed=true&enabled=false",
    );
    expect(result.payload.reason).toBe("gate_disabled");
    expect(result.payload.append).toBe(false);
  });
});

describe("handleLearningGatePreviewRoute — evidence gating (delegates to gate)", () => {
  it("unobserved evidence → append:false / no-observed-evidence (even when previewing enabled)", async () => {
    const { result } = await callPreview(
      "missionId=mission_1&verificationReportId=vr_1&observed=false&enabled=true",
    );
    expect(result.payload.append).toBe(false);
    expect(result.payload.reason).toBe("no-observed-evidence");
    expect(result.payload.gateEnabled).toBe(true);
  });

  it("no artifacts at all → append:false / no-observed-evidence when previewing enabled", async () => {
    const { result } = await callPreview("enabled=true");
    expect(result.payload.append).toBe(false);
    expect(result.payload.reason).toBe("no-observed-evidence");
  });
});

describe("handleLearningGatePreviewRoute — enabled preview + observed (decision only)", () => {
  it("decision is append:true with deterministic idempotency key, but route performs NO append", async () => {
    const { result } = await callPreview(
      "missionId=mission_1&verificationReportId=vr_1&observed=true&enabled=true",
    );
    const payload = result.payload;
    // 게이트의 결정은 append:true 이지만...
    expect(payload.append).toBe(true);
    expect(payload.reason).toBe("append");
    // ...route는 여전히 부수효과 0임을 표식한다(실제 append는 하지 않음).
    expect(payload.sideEffectsPerformed).toBe(false);
    // 결정론적 idempotency key 표면화.
    expect(payload.idempotencyKey).toBe("lf:mission_1:verification:vr_1");
  });

  it("idempotency key is deterministic across calls", async () => {
    const a = await callPreview(
      "missionId=mission_1&verificationReportId=vr_1&observed=true&enabled=true",
    );
    const b = await callPreview(
      "missionId=mission_1&verificationReportId=vr_1&observed=true&enabled=true",
    );
    expect(a.result.payload.idempotencyKey).toBe(b.result.payload.idempotencyKey);
  });

  it("sandbox anchor → sandbox-prefixed idempotency key when previewing enabled + observed", async () => {
    const { result } = await callPreview(
      "missionId=mission_2&sandboxErrorCardId=ec_9&observed=true&enabled=true",
    );
    expect(result.payload.append).toBe(true);
    expect(result.payload.idempotencyKey).toBe("lf:mission_2:sandbox:ec_9");
  });
});
