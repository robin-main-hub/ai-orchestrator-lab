import { describe, expect, it } from "vitest";
import { MemoryAdapterError, isMemoryAdapterError } from "./errors.js";

// errors.ts is the OS's typed memory-error surface: every adapter throws a
// MemoryAdapterError carrying a closed-vocabulary category, and callers branch
// on that category to decide retry / promotion / deny handling. The class +
// guard were never pinned. Two authority facts protect them: (1) TYPED
// CONSTRUCTION — the error preserves its category, message, and optional meta
// verbatim, its name is LOCKED to "MemoryAdapterError" (so it can never be
// confused on the wire with a generic Error), and it is a genuine Error (flows
// through normal throw/catch with a stack). (2) DISCRIMINATION GUARD —
// isMemoryAdapterError is true ONLY for a real instance; a plain Error, a
// duck-typed look-alike object (right name/category fields but not constructed
// by us), and null/undefined/primitives all read false, so a foreign error can
// never be mistaken for the OS error and mis-branched on `.category`. Pure: no
// I/O, no Date.now.

describe("MemoryAdapterError — typed construction", () => {
  it("preserves category + message, leaves meta undefined when omitted, and locks the name", () => {
    const e = new MemoryAdapterError("trust_violation", "untrusted caller");
    expect(e.category).toBe("trust_violation");
    expect(e.message).toBe("untrusted caller");
    expect(e.meta).toBeUndefined();
    expect(e.name).toBe("MemoryAdapterError"); // locked override, not "Error"
  });

  it("preserves the optional meta verbatim when supplied", () => {
    const meta = { recordId: "rec-1", backendStatus: 503, retryAfterSec: 30 };
    const e = new MemoryAdapterError("backend_unavailable", "down", meta);
    expect(e.meta).toEqual(meta);
  });

  it("is a genuine Error that flows through normal throw/catch", () => {
    expect(() => {
      throw new MemoryAdapterError("not_found", "missing");
    }).toThrow(/missing/);
    const e = new MemoryAdapterError("unknown", "x");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(MemoryAdapterError);
    expect(typeof e.stack).toBe("string");
  });
});

describe("isMemoryAdapterError — discrimination guard", () => {
  it("is true only for a real MemoryAdapterError instance", () => {
    expect(isMemoryAdapterError(new MemoryAdapterError("quota_exceeded", "limit"))).toBe(true);
  });

  it("rejects a plain Error and a duck-typed look-alike (not constructed by us)", () => {
    expect(isMemoryAdapterError(new Error("plain"))).toBe(false);
    const lookAlike = { name: "MemoryAdapterError", category: "trust_violation", message: "fake" };
    expect(isMemoryAdapterError(lookAlike)).toBe(false); // right fields, wrong prototype
  });

  it("rejects null/undefined/primitives (never mistakes a non-error for the OS error)", () => {
    for (const v of [null, undefined, "MemoryAdapterError", 42, false, {}]) {
      expect(isMemoryAdapterError(v)).toBe(false);
    }
  });
});
