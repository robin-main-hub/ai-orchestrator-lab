import { describe, expect, it } from "vitest";
import { navItems, navSections } from "./conversation";

// Characterization tests (no behavior change, pure, no I/O) for the workbench
// navigation seed. navSections is the grouped source of truth and navItems is its
// derived in-order flattening — both 0-ref across the test tree. The nav item ids
// are the routing keys (NavItemId), so their structural invariants are load-bearing:
//   - navItems must stay the exact flatten of navSections (a hand-maintained second
//     list would silently drift from the rendered groups).
//   - every nav item id must be UNIQUE across all sections; a duplicate would make
//     two menu entries resolve to the same view key, an ambiguous route.
//   - section ids must be unique, and every entry must carry a non-empty id/label
//     plus an icon, so nothing renders blank.
// We assert structure only (ids/derivation/completeness), never the display labels.

describe("workbench navigation seed", () => {
  it("derives navItems as the exact in-order flattening of every section's items", () => {
    expect(navItems).toEqual(navSections.flatMap((section) => section.items));
    const summed = navSections.reduce((total, section) => total + section.items.length, 0);
    expect(navItems).toHaveLength(summed);
  });

  it("keeps every nav item id unique across all sections (a duplicate would be an ambiguous route)", () => {
    const ids = navItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every nav section id unique", () => {
    const sectionIds = navSections.map((section) => section.id);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
  });

  it("gives every section a non-empty id/label and at least one item", () => {
    for (const section of navSections) {
      expect(section.id.trim().length).toBeGreaterThan(0);
      expect(section.label.trim().length).toBeGreaterThan(0);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("gives every nav item a non-empty id/label and an icon so nothing renders blank", () => {
    for (const item of navItems) {
      expect(item.id.trim().length).toBeGreaterThan(0);
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.icon).toBeDefined();
    }
  });
});
