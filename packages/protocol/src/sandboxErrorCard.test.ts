import { describe, expect, it } from "vitest";
import {
  missionErrorCardRecordedPayloadSchema,
  parseSandboxError,
  sandboxErrorCardSchema,
  sandboxErrorSignature,
} from "./sandboxErrorCard.js";

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

// The cases above cover the three happy-path stacks + one fallback + signature
// stability, but leave the parser's *decision* edges unpinned: the regex
// precedence (TS over Python over Node), the Python "File line is a required
// companion" rule, directive selection from rootCause when no errorClass was
// extracted, the empty-input fallback, the fact that stdout is scanned but only
// stderr feeds the preview, the 240/2000 clip boundaries, request defaults/
// passthrough, and the signature's "?" placeholders + 80-char rootCause window
// (which is what actually collapses near-identical errors so the self-correction
// loop can detect "same error again"). Pin them, self-consistent.
describe("parseSandboxError — precedence, fallbacks, clipping, defaults, signature window", () => {
  it("prefers a TS diagnostic over co-present Python/Node markers (deterministic precedence)", () => {
    const card = parseSandboxError({
      ...base,
      stderr: [
        "src/foo.ts(42,7): error TS2345: Type X is not assignable",
        '  File "app/main.py", line 9, in <module>',
        "ValueError: nope",
        "    at run (/app/x.js:3:1)",
      ].join("\n"),
    });
    expect(card.errorClass).toBe("TS2345");
    expect(card.targetFile).toBe("src/foo.ts");
    expect(card.targetLine).toBe(42);
    expect(card.directive).toContain("할당"); // TS2345 directive, not the Node/Python one
  });

  it("treats a bare XxxError without a File line as a Node-style error (class parsed, no targetFile)", () => {
    const card = parseSandboxError({ ...base, stderr: "ValueError: bad input" });
    expect(card.errorClass).toBe("ValueError");
    expect(card.rootCause).toBe("bad input");
    expect(card.targetFile).toBeUndefined(); // no `File "..."` and no `at` frame
    expect(card.targetLine).toBeUndefined();
  });

  it("derives a directive from rootCause text even when no errorClass is extracted", () => {
    const card = parseSandboxError({ ...base, stderr: "npm ERR! Cannot find module 'zod'" });
    expect(card.errorClass).toBeUndefined();
    expect(card.directive).toContain("의존성"); // matched via /Cannot find module/ on rootCause
  });

  it("falls back to 알 수 없는 실패 + generic directive when stderr and stdout are empty", () => {
    const card = parseSandboxError({ ...base, stderr: "" });
    expect(card.errorClass).toBeUndefined();
    expect(card.rootCause).toBe("알 수 없는 실패");
    expect(card.directive).toContain("가장 좁은");
    expect(card.stderrPreview).toBe("");
  });

  it("scans stdout for the error but the preview only ever reflects stderr", () => {
    const card = parseSandboxError({
      ...base,
      stderr: "",
      stdout: "src/q.ts(7,3): error TS2304: Cannot find name 'X'",
    });
    expect(card.errorClass).toBe("TS2304"); // found in stdout
    expect(card.targetFile).toBe("src/q.ts");
    expect(card.stderrPreview).toBe(""); // stdout never leaks into the stderr preview
  });

  it("clips rootCause to 240 and stderrPreview to 2000, trimming surrounding whitespace", () => {
    const longMsg = parseSandboxError({ ...base, stderr: `src/a.ts(1,1): error TS9999: ${"y".repeat(300)}` });
    expect(longMsg.rootCause).toHaveLength(240);
    expect(longMsg.rootCause.endsWith("…")).toBe(true);

    const longPreview = parseSandboxError({ ...base, stderr: "z".repeat(2_500) });
    expect(longPreview.stderrPreview).toHaveLength(2_000);
    expect(longPreview.stderrPreview.endsWith("…")).toBe(true);

    const padded = parseSandboxError({ ...base, stderr: "   hello   " });
    expect(padded.stderrPreview).toBe("hello"); // trimmed
  });

  it("defaults status→failed and truthStatus→observed, passing through when supplied", () => {
    const def = parseSandboxError({ ...base, stderr: "boom" });
    expect(def.status).toBe("failed");
    expect(def.truthStatus).toBe("observed");

    const explicit = parseSandboxError({
      ...base,
      stderr: "boom",
      status: "timeout",
      truthStatus: "planned",
      workerId: "w1",
      relatedCheckId: "chk1",
    });
    expect(explicit.status).toBe("timeout");
    expect(explicit.truthStatus).toBe("planned");
    expect(explicit.workerId).toBe("w1");
    expect(explicit.relatedCheckId).toBe("chk1");
  });

  it("signature uses ? for missing fields and only the first 80 rootCause chars (collapses near-identical errors)", () => {
    expect(sandboxErrorSignature({ errorClass: undefined, targetFile: undefined, targetLine: undefined, rootCause: "boom" })).toBe(
      "?|?|?|boom",
    );
    const head = "x".repeat(80);
    const same = sandboxErrorSignature({ errorClass: "TS1", targetFile: "a.ts", targetLine: 1, rootCause: `${head}AAA` });
    const alsoSame = sandboxErrorSignature({ errorClass: "TS1", targetFile: "a.ts", targetLine: 1, rootCause: `${head}BBB` });
    const differs = sandboxErrorSignature({ errorClass: "TS1", targetFile: "a.ts", targetLine: 1, rootCause: `${"y".repeat(80)}AAA` });
    expect(same).toBe(alsoSame); // differ only after char 80 ⇒ same signature
    expect(same).not.toBe(differs); // differ within first 80 ⇒ distinct
  });
});

// Everything above pins the parser/signature behavior — the cards it RETURNS are
// well covered, but the SCHEMAS (sandboxErrorCardSchema and the server-only
// recorded payload) are never asserted directly. The authority surface still
// unpinned: (1) the card closes status to {failed,timeout,blocked} and REQUIRES
// the cause/directive/preview triad — a failure must name what broke, how to fix
// it, and carry a (redacted) stderr preview, never an empty shell; (2) the
// attribution/location optionals (workerId/errorClass/targetFile/targetLine/
// relatedCheckId) are never fabricated when the parser couldn't extract them, and
// targetLine is int-only; (3) the server-only recorded event EMBEDS the card
// transitively (a bad status sinks the payload) and requires missionId while
// keeping workerId/verificationReportId optional. Fixtures derive from a real
// parseSandboxError run (self-consistent with what the parser emits).
describe("sandboxErrorCard — schema validation boundary: closed status, required cause/fix/preview, honest optionals, server-only embed", () => {
  const CARD = parseSandboxError({ id: "ec1", missionId: "m1", runnerKind: "docker_rootless", now, stderr: "ValueError: bad input" });

  it("closes status to {failed,timeout,blocked} and REQUIRES the cause/directive/stderrPreview triad", () => {
    expect(sandboxErrorCardSchema.safeParse(CARD).success).toBe(true);
    expect(sandboxErrorCardSchema.safeParse({ ...CARD, status: "crashed" }).success).toBe(false); // outside the closed set
    for (const field of ["rootCause", "directive", "stderrPreview"] as const) {
      const { [field]: _omit, ...without } = CARD;
      expect(sandboxErrorCardSchema.safeParse(without).success).toBe(false); // a failure can't omit cause/fix/evidence
    }
  });

  it("never fabricates the attribution/location optionals the parser couldn't extract; targetLine is int-only", () => {
    // a bare ValueError has no worker, no file/line, no related check — all stay undefined
    expect(CARD.workerId).toBeUndefined();
    expect(CARD.targetFile).toBeUndefined();
    expect(CARD.targetLine).toBeUndefined();
    expect(CARD.relatedCheckId).toBeUndefined();
    expect(sandboxErrorCardSchema.safeParse(CARD).success).toBe(true); // valid with the optionals absent
    expect(sandboxErrorCardSchema.safeParse({ ...CARD, targetLine: 12.5 }).success).toBe(false); // int only
    expect(sandboxErrorCardSchema.safeParse({ ...CARD, targetLine: 12 }).success).toBe(true);
  });

  it("the server-only recorded event requires missionId and never fabricates the optional workerId/verificationReportId", () => {
    const parsed = missionErrorCardRecordedPayloadSchema.parse({ missionId: "m1", errorCard: CARD });
    expect(parsed.workerId).toBeUndefined();
    expect(parsed.verificationReportId).toBeUndefined();
    expect(missionErrorCardRecordedPayloadSchema.safeParse({ errorCard: CARD }).success).toBe(false); // missionId required
  });

  it("the recorded event EMBEDS the card transitively — a bad status in the embedded card sinks the whole payload", () => {
    const ok = missionErrorCardRecordedPayloadSchema.parse({ missionId: "m1", workerId: "w1", verificationReportId: "vr1", errorCard: CARD });
    expect(ok.workerId).toBe("w1");
    expect(missionErrorCardRecordedPayloadSchema.safeParse({ missionId: "m1", errorCard: { ...CARD, status: "crashed" } }).success).toBe(false);
  });
});
