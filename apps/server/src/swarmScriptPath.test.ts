import { describe, expect, it } from "vitest";
import { resolveSwarmScriptPath } from "./swarmScriptPath";

const ROOT = "/home/robin/ai-orchestrator-lab";
const MODULE_DIR = `${ROOT}/apps/server/dist`;
const CWD = `${ROOT}/apps/server`; // pnpm --filter가 바꿔놓는 실제 cwd

describe("resolveSwarmScriptPath", () => {
  it("resolves to the monorepo-root scripts dir regardless of cwd", () => {
    // 루트 scripts/에만 파일이 존재하는 실제 배치
    const exists = (p: string) => p === `${ROOT}/scripts/swarm-capture.sh`;
    const path = resolveSwarmScriptPath("swarm-capture.sh", { moduleDir: MODULE_DIR, cwd: CWD, exists });
    expect(path).toBe(`${ROOT}/scripts/swarm-capture.sh`);
  });

  it("does NOT pick the apps/server/scripts path that caused the 502 ENOENT", () => {
    const exists = (p: string) => p === `${ROOT}/scripts/swarm-send.sh`;
    const path = resolveSwarmScriptPath("swarm-send.sh", { moduleDir: MODULE_DIR, cwd: CWD, exists });
    expect(path).not.toBe(`${CWD}/scripts/swarm-send.sh`);
  });

  it("honors an explicit env override above everything", () => {
    const path = resolveSwarmScriptPath("swarm-capture.sh", {
      envOverride: "/opt/custom/capture.sh",
      moduleDir: MODULE_DIR,
      cwd: CWD,
      exists: () => true,
    });
    expect(path).toBe("/opt/custom/capture.sh");
  });

  it("falls back to the module-relative root path (correct expected location) when nothing exists", () => {
    const path = resolveSwarmScriptPath("swarm-capture.sh", {
      moduleDir: MODULE_DIR,
      cwd: CWD,
      exists: () => false,
    });
    expect(path).toBe(`${ROOT}/scripts/swarm-capture.sh`);
  });
});
