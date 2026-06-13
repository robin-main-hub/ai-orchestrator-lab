import { describe, expect, it } from "vitest";
import { decideSelfCorrection } from "./selfCorrection.js";

describe("decideSelfCorrection", () => {
  it("retries while under the attempt cap", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1"], currentErrorSignature: "e2", workerRole: "builder" });
    expect(d.action).toBe("retry");
    expect(d.attempt).toBe(2);
  });

  it("stops when the same error repeats (no infinite loop)", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1"], currentErrorSignature: "e1" });
    expect(d.action).toBe("stop_same_error");
  });

  it("requires human review after max attempts", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1", "e2", "e3"], currentErrorSignature: "e4" });
    expect(d.action).toBe("require_human");
  });

  it("never auto-marks failure as success — resolved only when no error", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1"], currentErrorSignature: undefined });
    expect(d.action).toBe("stop_resolved");
  });

  it("blocks roles outside the allowlist", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: [], currentErrorSignature: "e1", workerRole: "companion" });
    expect(d.action).toBe("require_human");
  });
});
