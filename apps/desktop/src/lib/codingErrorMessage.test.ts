import { describe, expect, it } from "vitest";
import { humanizeCodingError } from "./codingErrorMessage";

describe("humanizeCodingError", () => {
  it("explains network/fetch failures as a server-connection problem (not the provider)", () => {
    const msg = humanizeCodingError("http://dgx-02:4317: Failed to fetch");
    expect(msg).toContain("오케스트레이터 서버(:4317)");
    expect(msg).toContain("Tailscale");
  });
  it("handles the common network error shapes", () => {
    for (const raw of ["NetworkError when attempting", "connect ECONNREFUSED 127.0.0.1:4317", "fetch failed"]) {
      expect(humanizeCodingError(raw)).toContain("오케스트레이터 서버(:4317)");
    }
  });
  it("passes through other errors, truncating very long ones", () => {
    expect(humanizeCodingError("completion 500")).toBe("completion 500");
    expect(humanizeCodingError("x".repeat(200))).toHaveLength(118);
  });
  it("returns empty string for no error", () => {
    expect(humanizeCodingError(undefined)).toBe("");
  });
});
