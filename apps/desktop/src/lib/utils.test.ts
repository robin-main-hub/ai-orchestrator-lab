import { describe, expect, it } from "vitest";
import { cn } from "./utils";

// Characterization tests (no behavior change) for the previously-untested `cn`
// className combiner. Every Shadcn primitive imports `cn` from this path, so its
// contract is load-bearing for the whole component layer. Two distinct guarantees
// are pinned here:
//   1. clsx layer — arrays / objects / falsy values resolve into a single
//      space-joined string (falsy dropped, not stringified to "false"/"null").
//   2. twMerge layer — conflicting Tailwind utilities collapse to the LAST one
//      (`cn("p-2","p-4")` → "p-4"). This is the reason `cn` wraps twMerge rather
//      than returning clsx directly: without it BOTH classes would land and the
//      winner would depend on stylesheet insertion order (flaky, unoverridable).
describe("cn", () => {
  it("no / empty input → empty string", () => {
    expect(cn()).toBe("");
    expect(cn("", false, null, undefined)).toBe("");
  });

  it("clsx layer: drops falsy and space-joins the rest", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("clsx layer: resolves array and object forms", () => {
    expect(cn(["a", "b"])).toBe("a b");
    expect(cn({ active: true, hidden: false })).toBe("active");
  });

  it("twMerge layer: conflicting Tailwind utilities collapse to the last", () => {
    // load-bearing: last padding wins, the earlier one is dropped entirely
    expect(cn("p-2", "p-4")).toBe("p-4");
    // non-conflicting utilities are both kept, in order
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  it("twMerge runs AFTER clsx: a conditionally-applied override still wins", () => {
    // the falsy branch is removed first, then the surviving p-1/p-4 conflict resolves
    expect(cn("p-1", { "p-2": false }, "p-4")).toBe("p-4");
  });
});
