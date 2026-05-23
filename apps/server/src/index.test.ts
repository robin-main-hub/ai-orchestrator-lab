import { describe, expect, it } from "vitest";
import { createHealthResponse } from "./index";

describe("server health placeholder", () => {
  it("returns degraded runtime status while execution is not implemented", () => {
    const health = createHealthResponse();

    expect(health.status).toBe("ok");
    expect(health.runtime.status).toBe("degraded");
    expect(health.capabilities).toContain("remote-execution-placeholder");
  });
});
