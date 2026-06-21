import { describe, expect, it } from "vitest";
import { ssotProviderKindSchema, ssotSnapshotSchema } from "./index.js";

// ssotSnapshotSchema is the OS's record of a single OBSERVATION of an external
// Single-Source-Of-Truth document (a project's markdown / Notion / GitHub source
// of record) — what was seen, when, and at which content fingerprint. Neither it
// nor its provider enum was pinned. The FRESH authority angle here is CONTENT-
// ADDRESSED OBSERVATION INTEGRITY: a snapshot is only trustworthy if it pins
// exactly what was observed. (1) CLOSED PROVIDER VOCAB — providerKind is exactly
// {markdown, notion, github}; an unknown backend is rejected, so a snapshot can
// never claim to come from an unspecced source of truth. (2) FINGERPRINT +
// REVISION ARE MANDATORY — contentHash and revision are required strings: every
// snapshot is content-addressed (the hash) AND revision-tagged, so two
// observations can be compared for drift and a snapshot can never exist without
// its fingerprint. (3) NON-NEGATIVE ITEM COUNT — itemCount is an int ≥ 0: an
// empty source (0 items) is legal, a negative count is impossible and rejected.
// (4) OPTIONAL SOURCE URL + PLAIN-OBJECT STRIP — sourceUrl is optional (a local
// markdown SSOT may have no URL), and being a plain z.object the snapshot strips
// unknown keys rather than carrying them. Enum members read back via `.options`.

const snapshot = {
  id: "snap-1",
  projectId: "proj-1",
  providerKind: "markdown",
  contentHash: "sha256:abc123",
  revision: "rev-7",
  observedAt: "2026-06-21T00:00:00.000Z",
  itemCount: 12,
};

describe("ssotProviderKind — closed source-of-truth backend vocabulary", () => {
  it("admits exactly {markdown, notion, github}", () => {
    expect(ssotProviderKindSchema.options).toEqual(["markdown", "notion", "github"]);
    expect(ssotProviderKindSchema.safeParse("gitlab").success).toBe(false);
  });
});

describe("ssotSnapshot — content-addressed observation integrity", () => {
  it("accepts a fully-formed snapshot", () => {
    expect(ssotSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("requires the contentHash fingerprint — a snapshot cannot exist without it", () => {
    const { contentHash: _omit, ...without } = snapshot;
    expect(ssotSnapshotSchema.safeParse(without).success).toBe(false);
  });

  it("requires the revision tag", () => {
    const { revision: _omit, ...without } = snapshot;
    expect(ssotSnapshotSchema.safeParse(without).success).toBe(false);
  });

  it("rejects an unknown providerKind transitively (embed is by-value)", () => {
    expect(ssotSnapshotSchema.safeParse({ ...snapshot, providerKind: "gitlab" }).success).toBe(false);
  });
});

describe("ssotSnapshot — itemCount bound + optional url + strip", () => {
  it("allows an empty source (itemCount 0) but rejects a negative count", () => {
    expect(ssotSnapshotSchema.safeParse({ ...snapshot, itemCount: 0 }).success).toBe(true);
    expect(ssotSnapshotSchema.safeParse({ ...snapshot, itemCount: -1 }).success).toBe(false);
    expect(ssotSnapshotSchema.safeParse({ ...snapshot, itemCount: 1.5 }).success).toBe(false);
  });

  it("treats sourceUrl as optional (a local markdown SSOT may have no URL)", () => {
    expect(ssotSnapshotSchema.safeParse(snapshot).success).toBe(true); // no sourceUrl present
    expect(ssotSnapshotSchema.safeParse({ ...snapshot, sourceUrl: "https://notion.so/x" }).success).toBe(true);
  });

  it("strips unknown keys rather than carrying them in the snapshot", () => {
    const parsed = ssotSnapshotSchema.parse({ ...snapshot, leaked: "x" });
    expect("leaked" in parsed).toBe(false);
  });
});
