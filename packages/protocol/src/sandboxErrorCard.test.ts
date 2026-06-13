import { describe, expect, it } from "vitest";
import { parseSandboxError, sandboxErrorSignature } from "./sandboxErrorCard.js";

const now = () => "2026-06-13T00:00:00.000Z";
const base = { id: "ec1", missionId: "m1", runnerKind: "docker_rootless", now };

describe("parseSandboxError", () => {
  it("parses a TypeScript diagnostic into class/file/line + directive", () => {
    const card = parseSandboxError({
      ...base,
      stderr: "src/foo.ts(42,7): error TS2532: Object is possibly 'undefined'.",
    });
    expect(card.errorClass).toBe("TS2532");
    expect(card.targetFile).toBe("src/foo.ts");
    expect(card.targetLine).toBe(42);
    expect(card.directive).toContain("가드");
  });

  it("parses a Python traceback", () => {
    const card = parseSandboxError({
      ...base,
      stderr: 'Traceback...\n  File "app/main.py", line 13, in <module>\nValueError: bad input',
    });
    expect(card.errorClass).toBe("ValueError");
    expect(card.targetFile).toBe("app/main.py");
    expect(card.targetLine).toBe(13);
  });

  it("parses a Node error + stack frame", () => {
    const card = parseSandboxError({
      ...base,
      stderr: "TypeError: Cannot read properties of undefined\n    at run (/app/x.js:9:5)",
    });
    expect(card.errorClass).toBe("TypeError");
    expect(card.targetFile).toBe("/app/x.js");
    expect(card.targetLine).toBe(9);
  });

  it("falls back to a generic directive for unknown errors", () => {
    const card = parseSandboxError({ ...base, stderr: "weird non-standard failure" });
    expect(card.errorClass).toBeUndefined();
    expect(card.directive.length).toBeGreaterThan(0);
  });

  it("signature is stable for the same error and differs across errors", () => {
    const a = parseSandboxError({ ...base, stderr: "src/foo.ts(42,7): error TS2532: x" });
    const b = parseSandboxError({ ...base, id: "ec2", stderr: "src/foo.ts(42,7): error TS2532: x" });
    const c = parseSandboxError({ ...base, id: "ec3", stderr: "src/bar.ts(1,1): error TS2345: y" });
    expect(sandboxErrorSignature(a)).toBe(sandboxErrorSignature(b));
    expect(sandboxErrorSignature(a)).not.toBe(sandboxErrorSignature(c));
  });
});
