import { describe, expect, it } from "vitest";
import {
  classifyHeartbeat,
  projectRunnerTheater,
  summarizeRunnerTheater,
  EXAMPLE_RUNNER_SESSIONS,
  EXAMPLE_RUNNER_NOW_MS,
  HEARTBEAT_THRESHOLDS,
  type RunnerSessionInput,
} from "./runnerTheater";

const FORBIDDEN = ["example-domain", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("E2 — runner theater projection", () => {
  it("classifies heartbeat liveness on a runner (minutes) scale", () => {
    const M = 60_000;
    expect(classifyHeartbeat(null)).toBe("unknown");
    expect(classifyHeartbeat(NaN)).toBe("unknown");
    expect(classifyHeartbeat(30_000)).toBe("live"); // 0.5m
    expect(classifyHeartbeat((HEARTBEAT_THRESHOLDS.liveUnderMin + 1) * M)).toBe("idle");
    expect(classifyHeartbeat((HEARTBEAT_THRESHOLDS.idleUnderMin + 1) * M)).toBe("stale");
    expect(classifyHeartbeat(-5 * M)).toBe("live"); // future-stamped
  });

  it("maps mission status to an operator lane", () => {
    const rows = projectRunnerTheater(EXAMPLE_RUNNER_SESSIONS, EXAMPLE_RUNNER_NOW_MS);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["ms-001"]?.lane).toBe("active"); // running
    expect(byId["ms-002"]?.lane).toBe("attention"); // blocked
    expect(byId["ms-003"]?.lane).toBe("done"); // done
  });

  it("scores each runner's heartbeat liveness from the injected now", () => {
    const rows = projectRunnerTheater(EXAMPLE_RUNNER_SESSIONS, EXAMPLE_RUNNER_NOW_MS);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["ms-001"]?.liveness).toBe("live"); // ~50s
    expect(byId["ms-002"]?.liveness).toBe("stale"); // 40m, and still blocked
    expect(byId["ms-001"]?.eventCount).toBe(2);
    expect(byId["ms-001"]?.artifactCount).toBe(1);
    expect(byId["ms-002"]?.artifactCount).toBe(0); // honest: empty artifacts
  });

  it("only asserts in-memory facts (no fabricated stats, honest empties)", () => {
    const bare: RunnerSessionInput = {
      id: "ms-x",
      title: "bare runner",
      role: "Implementer",
      agent: "implementer",
      model: "m",
      status: "running",
      // no heartbeat, no events, no artifacts, no lastOutput
    };
    const [row] = projectRunnerTheater([bare], EXAMPLE_RUNNER_NOW_MS);
    expect(row?.liveness).toBe("unknown");
    expect(row?.ageMinutes).toBeNull();
    expect(row?.lastOutput).toBe("");
    expect(row?.eventCount).toBe(0);
    expect(row?.artifactCount).toBe(0);
  });

  it("drops invalid rows and never crashes on empty", () => {
    expect(projectRunnerTheater([], EXAMPLE_RUNNER_NOW_MS)).toEqual([]);
    const bad = projectRunnerTheater(
      [{ id: "", title: "x", role: "", agent: "", model: "", status: "running" }],
      EXAMPLE_RUNNER_NOW_MS,
    );
    expect(bad).toEqual([]); // empty id dropped
  });

  it("summarizes lanes and flags stalled-active runners", () => {
    const rows = projectRunnerTheater(EXAMPLE_RUNNER_SESSIONS, EXAMPLE_RUNNER_NOW_MS);
    const s = summarizeRunnerTheater(rows);
    expect(s.total).toBe(3);
    expect(s.active).toBe(1);
    expect(s.attention).toBe(1);
    expect(s.done).toBe(1);
    // ms-002 is blocked (attention), not active → not stalledActive
    expect(s.stalledActive).toBe(0);
  });

  it("is deterministic and carries no domain vocabulary", () => {
    const a = JSON.stringify(projectRunnerTheater(EXAMPLE_RUNNER_SESSIONS, EXAMPLE_RUNNER_NOW_MS));
    const b = JSON.stringify(projectRunnerTheater(EXAMPLE_RUNNER_SESSIONS, EXAMPLE_RUNNER_NOW_MS));
    expect(a).toBe(b);
    const blob = a.toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
