import { describe, expect, it, vi } from "vitest";
import {
  isAllowedPreviewCommand,
  startPreviewProcess,
  stopPreviewProcess,
  type PreviewProcessRegistry,
  type PreviewSpawnHandle,
} from "./previewProcessRunner";

const now = () => "2026-06-13T00:00:00.000Z";
const immediateWait = async () => {};
const ALLOWED = ["/repo"];

function fakeHandle(opts: { exits?: boolean } = {}) {
  let killed = false;
  const handle: PreviewSpawnHandle & { killed: () => boolean } = {
    kill: () => {
      killed = true;
    },
    onExit: (cb) => {
      if (opts.exits) cb(1); // 즉시 종료 통지(조기 종료 시뮬레이션)
    },
    stderrPreview: () => "boom",
    killed: () => killed,
  };
  return handle;
}

const base = {
  workspaceId: "ws1",
  command: "vite preview",
  cwd: "/repo",
  host: "127.0.0.1",
  port: 4401,
  allowedRepoRoots: ALLOWED,
  wait: immediateWait,
  now,
  readyTimeoutMs: 3,
  pollIntervalMs: 1,
};

describe("isAllowedPreviewCommand", () => {
  it("allows vetted preview prefixes, blocks shell features and unknown commands", () => {
    expect(isAllowedPreviewCommand("vite preview").allowed).toBe(true);
    expect(isAllowedPreviewCommand("pnpm preview").allowed).toBe(true);
    expect(isAllowedPreviewCommand("node server.mjs").allowed).toBe(true);
    expect(isAllowedPreviewCommand("vite preview; rm -rf /").allowed).toBe(false); // 메타문자
    expect(isAllowedPreviewCommand("rm -rf /").allowed).toBe(false);
    expect(isAllowedPreviewCommand("curl http://x").allowed).toBe(false);
    expect(isAllowedPreviewCommand("python -m http.server", ["python"]).allowed).toBe(true); // env 추가 허용
  });
});

describe("startPreviewProcess — observed only when the port actually serves", () => {
  it("returns observed running when the HTTP probe succeeds", async () => {
    const registry: PreviewProcessRegistry = new Map();
    const handle = fakeHandle();
    const spawn = vi.fn(() => handle);
    const preview = await startPreviewProcess({ ...base, registry, spawn, probe: async () => true });
    expect(preview.status).toBe("running");
    expect(preview.truthStatus).toBe("observed"); // 실제 포트 관측
    expect(preview.url).toBe("http://127.0.0.1:4401");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(registry.get("ws1")).toBe(handle); // running 프로세스는 추적 유지
  });

  it("returns failed/configured (never observed) when the probe never succeeds", async () => {
    const registry: PreviewProcessRegistry = new Map();
    const preview = await startPreviewProcess({ ...base, registry, spawn: () => fakeHandle(), probe: async () => false });
    expect(preview.status).toBe("failed");
    expect(preview.truthStatus).not.toBe("observed");
    expect(registry.has("ws1")).toBe(false); // 타임아웃 시 정리
  });

  it("fails fast (not observed) if the process exits early", async () => {
    const registry: PreviewProcessRegistry = new Map();
    const probe = vi.fn(async () => true); // 떠 있었으면 observed였겠지만 — 조기 종료가 먼저
    const preview = await startPreviewProcess({ ...base, registry, spawn: () => fakeHandle({ exits: true }), probe });
    expect(preview.status).toBe("failed");
    expect(preview.truthStatus).not.toBe("observed");
    expect(probe).not.toHaveBeenCalled(); // exited면 probe 안 함
  });

  it("blocks (no spawn) when cwd is not in the repo-root allowlist", async () => {
    const registry: PreviewProcessRegistry = new Map();
    const spawn = vi.fn(() => fakeHandle());
    const preview = await startPreviewProcess({ ...base, cwd: "/not-allowed", registry, spawn, probe: async () => true });
    expect(preview.status).toBe("blocked");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("blocks (no spawn) when the command is not an allowed preview command", async () => {
    const registry: PreviewProcessRegistry = new Map();
    const spawn = vi.fn(() => fakeHandle());
    const preview = await startPreviewProcess({ ...base, command: "rm -rf /", registry, spawn, probe: async () => true });
    expect(preview.status).toBe("blocked");
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("stopPreviewProcess", () => {
  it("kills the tracked process and is idempotent", async () => {
    const registry: PreviewProcessRegistry = new Map();
    const handle = fakeHandle();
    await startPreviewProcess({ ...base, registry, spawn: () => handle, probe: async () => true });
    const stopped = await stopPreviewProcess("ws1", registry);
    expect(stopped.status).toBe("stopped");
    expect(handle.killed()).toBe(true);
    expect(registry.has("ws1")).toBe(false);
    // 멱등 — 두 번째 stop도 정상
    expect((await stopPreviewProcess("ws1", registry)).status).toBe("stopped");
  });
});
