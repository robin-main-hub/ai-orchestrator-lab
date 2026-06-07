import { describe, expect, it } from "vitest";
import { createSettingsDiagnostics } from "./settingsDiagnostics";

describe("settingsDiagnostics", () => {
  it("첫 실행에 필요한 provider, memory, worker, runtime 진단을 통과시킨다", () => {
    const diagnostics = createSettingsDiagnostics({
      agentCount: 18,
      enabledProviderCount: 4,
      memoryAdapterStatus: "ready",
      providerSmokeReadyCount: 2,
      runtimeStatus: "online",
      workerCount: 18,
    });

    expect(diagnostics.blockingCount).toBe(0);
    expect(diagnostics.status).toBe("ready");
    expect(diagnostics.items.every((item) => item.status === "pass")).toBe(true);
  });

  it("필수 설정이 빠지면 차단 항목과 다음 조치를 만든다", () => {
    const diagnostics = createSettingsDiagnostics({
      agentCount: 0,
      enabledProviderCount: 0,
      memoryAdapterStatus: "error",
      providerSmokeReadyCount: 0,
      runtimeStatus: "offline",
      workerCount: 0,
    });

    expect(diagnostics.status).toBe("blocked");
    expect(diagnostics.blockingCount).toBeGreaterThan(0);
    expect(diagnostics.nextActions).toContain("활성 공급자를 1개 이상 설정");
    expect(diagnostics.nextActions).toContain("기억 어댑터 상태 복구");
  });
});
