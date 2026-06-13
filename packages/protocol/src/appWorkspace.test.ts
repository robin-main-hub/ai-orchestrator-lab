import { describe, expect, it } from "vitest";
import { appWorkspaceSchema, buildAppWorkspace, derivePreviewPort, previewFromProbe } from "./appWorkspace.js";

const now = () => "2026-06-13T00:00:00.000Z";

describe("buildAppWorkspace", () => {
  it("builds a schema-valid workspace with preview NOT started and NOT observed", () => {
    const ws = buildAppWorkspace(
      { repoRootRef: "/repo", appType: "react_vite", terminalMode: "read_only", runnerKind: "local" },
      { id: "ws1", missionId: "m1", now },
    );
    expect(() => appWorkspaceSchema.parse(ws)).not.toThrow();
    expect(ws.preview.status).toBe("not_started");
    expect(ws.preview.truthStatus).toBe("planned"); // 실행 전 — observed 위장 금지
    expect(ws.preview.port).toBeUndefined();
    expect(ws.preview.url).toBeUndefined();
  });

  it("carries terminal runner/mode and starts with zero changed files", () => {
    const ws = buildAppWorkspace(
      { repoRootRef: "/repo", appType: "nextjs", terminalMode: "verify", runnerKind: "docker" },
      { id: "ws2", missionId: "m1", now },
    );
    expect(ws.terminal.runnerKind).toBe("docker");
    expect(ws.terminal.mode).toBe("verify");
    expect(ws.files.changedCount).toBe(0);
    expect(ws.appType).toBe("nextjs");
  });
});

describe("derivePreviewPort", () => {
  it("is deterministic and stays within the range", () => {
    const a = derivePreviewPort("ws1");
    expect(a).toBe(derivePreviewPort("ws1")); // 같은 워크스페이스 → 같은 포트
    expect(a).toBeGreaterThanOrEqual(4400);
    expect(a).toBeLessThan(5000);
    expect(derivePreviewPort("ws2")).not.toBe(a); // 다른 워크스페이스는 (대개) 다름
  });
});

describe("previewFromProbe", () => {
  it("observed running ONLY when the port is actually bound", () => {
    const bound = previewFromProbe({ bound: true, host: "127.0.0.1", port: 4401 });
    expect(bound.status).toBe("running");
    expect(bound.truthStatus).toBe("observed"); // 실제 바인딩 관측
    expect(bound.url).toBe("http://127.0.0.1:4401");
  });

  it("unbound is failed/configured, never fake running/observed", () => {
    const unbound = previewFromProbe({ bound: false, host: "127.0.0.1", port: 4401 });
    expect(unbound.status).toBe("failed");
    expect(unbound.truthStatus).not.toBe("observed");
    expect(unbound.url).toBeUndefined();
  });
});
