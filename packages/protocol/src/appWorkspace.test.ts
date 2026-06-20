import { describe, expect, it } from "vitest";
import {
  appTypeSchema,
  appWorkspacePreviewSchema,
  appWorkspaceSchema,
  buildAppWorkspace,
  defaultPreviewCommandForAppType,
  derivePreviewPort,
  previewBlocked,
  previewFailed,
  previewFromProbe,
  previewRunning,
  previewStopped,
} from "./appWorkspace.js";

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

// The preview status builders are the single honesty point: "running만 observed".
// They are 0-ref across the test tree, yet they encode the same observed-only-
// when-actually-observed truth rule that previewFromProbe pins — so the builders
// must hold it too (a builder that stamped a non-running state observed, or
// minted a url for a stopped preview, would let the UI fake a live server).
describe("preview status builders — honesty (running only is observed)", () => {
  it("previewRunning is the ONLY observed builder, with url + port + optional command", () => {
    const running = previewRunning({ host: "127.0.0.1", port: 4401, command: "vite preview" });
    expect(running.status).toBe("running");
    expect(running.truthStatus).toBe("observed");
    expect(running.url).toBe("http://127.0.0.1:4401");
    expect(running.port).toBe(4401);
    expect(running.command).toBe("vite preview");
    expect(() => appWorkspacePreviewSchema.parse(running)).not.toThrow();
  });

  it("previewFailed / previewBlocked / previewStopped are configured, never observed, never minting a url", () => {
    const failed = previewFailed({ port: 4401, command: "vite preview", detail: "exited 1" });
    const blocked = previewBlocked({ command: "vite preview", detail: "not in allowlist" });
    const stopped = previewStopped({ command: "vite preview" });
    expect(failed.status).toBe("failed");
    expect(blocked.status).toBe("blocked");
    expect(stopped.status).toBe("stopped");
    for (const preview of [failed, blocked, stopped]) {
      expect(preview.truthStatus).toBe("configured");
      expect(preview.truthStatus).not.toBe("observed");
      expect(preview.url).toBeUndefined();
      expect(() => appWorkspacePreviewSchema.parse(preview)).not.toThrow();
    }
    // blocked/stopped carry no port; previewStopped tolerates no args at all
    expect(blocked.port).toBeUndefined();
    expect(stopped.port).toBeUndefined();
    expect(previewStopped().status).toBe("stopped");
  });
});

describe("defaultPreviewCommandForAppType", () => {
  it("maps nextjs to its own command and everything else to vite preview", () => {
    expect(defaultPreviewCommandForAppType("nextjs")).toBe("npm run preview");
    expect(defaultPreviewCommandForAppType("react_vite")).toBe("vite preview");
    expect(defaultPreviewCommandForAppType("tauri")).toBe("vite preview");
    expect(defaultPreviewCommandForAppType("unknown")).toBe("vite preview");
  });

  it("returns a non-empty command for every declared app type (no unmapped fallthrough)", () => {
    for (const appType of appTypeSchema.options) {
      expect(defaultPreviewCommandForAppType(appType).length).toBeGreaterThan(0);
    }
  });
});
