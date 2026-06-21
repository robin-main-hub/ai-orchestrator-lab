import { describe, expect, it } from "vitest";
import {
  appTypeSchema,
  appWorkspaceAttachRequestSchema,
  appWorkspacePreviewSchema,
  appWorkspaceSchema,
  appWorkspaceTerminalSchema,
  buildAppWorkspace,
  sandboxRunnerKindSchema,
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

// The derivePreviewPort test above only exercises the DEFAULT window
// (base 4400, span 600). The opts.base/opts.span overrides — the whole reason
// the function takes a second argument — are unpinned: a custom range must keep
// the same deterministic guarantee while staying strictly inside [base, base+span),
// the per-workspace OFFSET (port - base) must be base-invariant (it depends only
// on hash % span, not on where the window starts), and span=1 must collapse every
// workspace onto base exactly (hash % 1 === 0). Pin them, self-consistent
// (derived from the very formula under test, never magic port literals).
describe("derivePreviewPort — custom base/span window", () => {
  it("keeps the port strictly inside the requested [base, base+span) window, deterministically", () => {
    const base = 9000;
    const span = 50;
    for (const id of ["ws1", "ws2", "alpha", "", "워크스페이스-가"]) {
      const port = derivePreviewPort(id, { base, span });
      expect(port).toBe(derivePreviewPort(id, { base, span })); // deterministic
      expect(port).toBeGreaterThanOrEqual(base);
      expect(port).toBeLessThan(base + span); // strictly inside the custom window
    }
  });

  it("makes the per-workspace offset base-invariant — only the window start shifts", () => {
    // offset = hash % span depends on span only, so two windows of the SAME span
    // produce the same offset; the ports differ by exactly the base delta.
    for (const id of ["ws1", "ws2", "alpha"]) {
      const defaultOffset = derivePreviewPort(id) - 4400; // default span 600
      expect(derivePreviewPort(id, { base: 20_000, span: 600 }) - 20_000).toBe(defaultOffset);
      expect(derivePreviewPort(id, { base: 8_000, span: 600 })).toBe(8_000 + defaultOffset);
    }
  });

  it("collapses every workspace onto base when span is 1 (hash % 1 === 0)", () => {
    for (const id of ["ws1", "ws2", "anything", "전혀-다른-id"]) {
      expect(derivePreviewPort(id, { base: 7777, span: 1 })).toBe(7777);
    }
  });
});

// The attach-request schema is 0-ref across the whole suite, yet its .default()
// values are a deny-by-default / least-privilege contract: a client that OMITS
// a field must land on the *least*-privileged option, never silently gain power.
// The header comment ("id/createdAt/preview 기본값은 서버가 정한다 — 주장 못 함")
// makes this a safety invariant, not a convenience. Pin the defaults, the
// required non-empty repoRootRef bound, and that an explicit higher-privilege
// choice is honored (defaults only FILL omissions, they never override).
describe("appWorkspaceAttachRequestSchema — least-privilege defaults for omitted client fields", () => {
  it("defaults every omitted optional to its least-privileged value", () => {
    const parsed = appWorkspaceAttachRequestSchema.parse({ repoRootRef: "/repo" });
    expect(parsed.appType).toBe("unknown"); // not a concrete framework claim
    expect(parsed.terminalMode).toBe("read_only"); // not verify/build — least privilege
    expect(parsed.runnerKind).toBe("local"); // the plain default runner
    expect(parsed.worktreeRef).toBeUndefined(); // optional, no value invented
  });

  it("requires a non-empty repoRootRef within the 1..1024 bound", () => {
    expect(() => appWorkspaceAttachRequestSchema.parse({})).toThrow(); // missing
    expect(() => appWorkspaceAttachRequestSchema.parse({ repoRootRef: "" })).toThrow(); // min(1)
    expect(() => appWorkspaceAttachRequestSchema.parse({ repoRootRef: "a".repeat(1025) })).toThrow(); // max(1024)
    expect(appWorkspaceAttachRequestSchema.parse({ repoRootRef: "a".repeat(1024) }).repoRootRef.length).toBe(1024); // boundary kept
  });

  it("honors an explicit higher-privilege selection — defaults fill omissions, they do not override", () => {
    const parsed = appWorkspaceAttachRequestSchema.parse({
      repoRootRef: "/repo",
      appType: "nextjs",
      terminalMode: "build",
      runnerKind: "docker",
      worktreeRef: "wt/feature",
    });
    expect(parsed.appType).toBe("nextjs");
    expect(parsed.terminalMode).toBe("build"); // explicit choice survives, not clamped back to read_only
    expect(parsed.runnerKind).toBe("docker");
    expect(parsed.worktreeRef).toBe("wt/feature");
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

// The attach-request least-privilege DEFAULTS (terminalMode→read_only, runnerKind→
// local) are pinned above, but the two schemas that encode the sandbox boundary
// itself — the runner-kind ladder and the persisted terminal record — are not. Per
// the module doc, the terminal is NOT a host-shell: it is metadata sitting behind a
// SandboxRunner/approval boundary. Pin that boundary:
//   - sandboxRunnerKindSchema is a CLOSED 4-kind ladder (local / docker / gvisor /
//     tmux_observation) — a terminal can't name an arbitrary "ssh"/"host" runner, and
//     tmux_observation is the read-only observation runner, not a shell;
//   - the persisted terminal RECORD requires runnerKind EXPLICITLY — unlike the attach
//     request it has NO default, so a stored terminal never silently fabricates "local";
//     its mode is the closed {read_only, verify, build} set and sessionId is optional
//     (never invented before a session exists);
//   - the record's `mode` draws from the IDENTICAL 3-value least-privilege vocabulary as
//     the attach request's `terminalMode` — one shared ladder, not a divergent copy.
// Expected values are read off the schema's own declared shape (self-consistent).
describe("appWorkspace — sandbox runner-kind ladder + terminal boundary record (terminal is sandboxed metadata, not a host shell)", () => {
  it("the runner-kind is a closed 4-kind sandbox ladder; an arbitrary host/ssh runner is rejected", () => {
    expect(sandboxRunnerKindSchema.options).toEqual(["local", "docker", "gvisor", "tmux_observation"]);
    // tmux_observation is the read-only observation runner the ladder explicitly includes
    expect(sandboxRunnerKindSchema.options).toContain("tmux_observation");
    for (const forged of ["ssh", "host", "bash", "remote"]) {
      expect(sandboxRunnerKindSchema.safeParse(forged).success).toBe(false);
    }
  });

  it("the persisted terminal record requires runnerKind explicitly (no default, unlike the attach request) and bounds mode; sessionId is optional", () => {
    const ok = appWorkspaceTerminalSchema.parse({ runnerKind: "docker", mode: "verify" });
    expect(ok.sessionId).toBeUndefined(); // never fabricated before a session exists
    // runnerKind has NO default at the record level — omitting it fails (the attach request defaults it, the record does not)
    expect(appWorkspaceTerminalSchema.safeParse({ mode: "read_only" }).success).toBe(false);
    // mode is the closed least-privilege 3-set
    expect(appWorkspaceTerminalSchema.shape.mode.options).toEqual(["read_only", "verify", "build"]);
    expect(appWorkspaceTerminalSchema.safeParse({ runnerKind: "local", mode: "admin" }).success).toBe(false);
  });

  it("the terminal record's mode and the attach request's terminalMode are the SAME 3-value least-privilege ladder (no divergent copy)", () => {
    const recordModes = appWorkspaceTerminalSchema.shape.mode.options;
    const requestModes = appWorkspaceAttachRequestSchema.shape.terminalMode.removeDefault().options;
    expect(recordModes).toEqual(requestModes);
    expect(recordModes).toEqual(["read_only", "verify", "build"]);
  });
});
