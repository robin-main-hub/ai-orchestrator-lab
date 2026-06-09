import { describe, expect, it } from "vitest";
import { rosterFromRegistry, rosterRowLabel, rosterRowVariant } from "./autonomyRoster";
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
