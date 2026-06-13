import { describe, expect, it } from "vitest";
import { appWorkspaceSchema, buildAppWorkspace } from "./appWorkspace.js";

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
