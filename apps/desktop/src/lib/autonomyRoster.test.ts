import { describe, expect, it } from "vitest";
import { buildRolePaneOptions, rosterFromRegistry, rosterRowLabel, rosterRowVariant } from "./autonomyRoster";
import type { SummonRegistry } from "./personaSummon";

const registry: SummonRegistry = {
  panes: [
    { paneId: "%1", role: "code", status: "busy", agentId: "makise" },
    { paneId: "%2", role: "qa", status: "free" },
  ],
  sessions: [],
};

describe("rosterFromRegistry", () => {
  it("maps panes to rows and counts busy/free", () => {
    const summary = rosterFromRegistry(registry);
    expect(summary.rows).toHaveLength(2);
    expect(summary.busyCount).toBe(1);
    expect(summary.freeCount).toBe(1);
    expect(summary.rows[0]).toEqual({ paneId: "%1", role: "code", busy: true, agentId: "makise" });
  });

  it("labels and colors rows by occupancy", () => {
    expect(rosterRowVariant(true)).toBe("primary");
    expect(rosterRowVariant(false)).toBe("muted");
    expect(rosterRowLabel({ paneId: "%1", role: "code", busy: true, agentId: "makise" })).toContain("makise");
    expect(rosterRowLabel({ paneId: "%2", role: "qa", busy: false })).toBe("비어 있음");
  });
});

describe("buildRolePaneOptions", () => {
  it("merges selectable roles with roster occupancy", () => {
    const roster = rosterFromRegistry(registry);
    const options = buildRolePaneOptions(["code", "qa"], roster);
    expect(options[0]).toEqual({
      role: "code",
      paneId: "%1",
      busy: true,
      occupantId: "makise",
      statusLabel: "makise 점유",
    });
    expect(options[1]).toMatchObject({ role: "qa", busy: false, statusLabel: "비어 있음" });
  });

  it("lists roles as free when no roster is connected or the role has no pane", () => {
    expect(buildRolePaneOptions(["frontend"], undefined)).toEqual([
      { role: "frontend", busy: false, statusLabel: "비어 있음" },
    ]);
    const roster = rosterFromRegistry(registry);
    expect(buildRolePaneOptions(["backend"], roster)[0]).toMatchObject({ role: "backend", busy: false });
  });
});
