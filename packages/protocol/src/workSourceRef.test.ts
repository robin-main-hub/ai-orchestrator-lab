import { describe, expect, it } from "vitest";
import { workSourceRefSchema } from "./index.js";

// workSourceRefSchema is the ORIGIN POINTER stapled to a work item — where the
// item was observed coming from. The workSource enum itself is already pinned
// elsewhere (vocab + "external" rejection), but the wrapper RECORD is never
// validated directly: inline source refs only ride through workItemSchema, so the
// ref's own invariants are unpinned. The FRESH authority angle here is a URL-FORMAT-
// VALIDATED, TIMESTAMPED-BUT-MINIMAL ORIGIN POINTER. (1) URL IS FORMAT-CHECKED, NOT
// JUST A STRING — `url` is z.string().url(): a malformed origin URL is rejected at
// the boundary, so a source pointer can never carry a non-URL where a URL is
// claimed (this is the audit's first url()-format pin). (2) TIMESTAMPED, OTHERWISE
// MINIMAL — `source` + `observedAt` are the only required fields; every origin is
// stamped with WHEN it was observed, while the identity fields (externalId, url,
// title, contentHash, revision) are ALL optional, so a manual desktop capture is a
// legal pointer with nothing but {source, observedAt}. (3) OPTIONAL CONTENT-
// ADDRESSING — contentHash + revision are optional here (unlike ssotSnapshot where
// the fingerprint is mandatory): a hand-entered source needn't be fingerprinted,
// but may be. (4) BY-VALUE ENUM + PLAIN-OBJECT STRIP — an unknown source is
// transitively rejected, and being a plain z.object an unknown key is stripped.

const ref = {
  source: "desktop_manual",
  observedAt: "2026-06-21T00:00:00.000Z",
};

describe("workSourceRef — timestamped, otherwise-minimal origin pointer", () => {
  it("accepts a minimal pointer (only source + observedAt)", () => {
    expect(workSourceRefSchema.safeParse(ref).success).toBe(true);
  });

  it("requires source and observedAt", () => {
    const { source: _omitSource, ...noSource } = ref;
    const { observedAt: _omitObserved, ...noObserved } = ref;
    expect(workSourceRefSchema.safeParse(noSource).success).toBe(false);
    expect(workSourceRefSchema.safeParse(noObserved).success).toBe(false);
  });

  it("transitively rejects an unknown source (by-value enum embed)", () => {
    expect(workSourceRefSchema.safeParse({ ...ref, source: "external" }).success).toBe(false);
  });
});

describe("workSourceRef — url is format-validated, not just a string", () => {
  it("accepts a well-formed url but rejects a non-url string", () => {
    expect(workSourceRefSchema.safeParse({ ...ref, source: "external_legacy", url: "https://example.com/x" }).success).toBe(true);
    expect(workSourceRefSchema.safeParse({ ...ref, source: "external_legacy", url: "not a url" }).success).toBe(false);
  });
});

describe("workSourceRef — optional content-addressing + strip", () => {
  it("treats contentHash + revision as optional (a manual source needn't be fingerprinted)", () => {
    expect(workSourceRefSchema.safeParse(ref).success).toBe(true); // neither present
    expect(workSourceRefSchema.safeParse({ ...ref, contentHash: "sha256:abc", revision: "rev-3" }).success).toBe(true);
  });

  it("strips an unknown key rather than carrying it", () => {
    const parsed = workSourceRefSchema.parse({ ...ref, forgedTrust: "elevated" });
    expect("forgedTrust" in parsed).toBe(false);
  });
});
