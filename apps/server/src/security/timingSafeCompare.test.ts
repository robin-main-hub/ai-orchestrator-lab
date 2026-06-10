import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "./timingSafeCompare.js";

describe("timingSafeStringEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeStringEqual("Bearer abc123", "Bearer abc123")).toBe(true);
    expect(timingSafeStringEqual("", "")).toBe(true);
  });

  it("rejects different strings, including different lengths and prefixes", () => {
    expect(timingSafeStringEqual("Bearer abc123", "Bearer abc124")).toBe(false);
    expect(timingSafeStringEqual("Bearer abc", "Bearer abc123")).toBe(false);
    expect(timingSafeStringEqual("a", "")).toBe(false);
  });
});
