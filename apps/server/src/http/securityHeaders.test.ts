import { describe, expect, it } from "vitest";
import { createSecurityHeaders } from "./securityHeaders.js";

describe("createSecurityHeaders", () => {
  it("sets the baseline hardening headers", () => {
    expect(createSecurityHeaders()).toEqual({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    });
  });
});
