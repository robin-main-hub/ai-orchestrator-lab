import { describe, expect, it } from "vitest";
import { workItemSchema, workItemStatusSchema } from "./index.js";

// workItemStatusSchema is the full LIFECYCLE vocabulary of a work item — the
// longest status enum in the protocol — and it is referenced by no test at all
// (workItemSchema.parse fixtures elsewhere use a couple of literal statuses but
// never assert the vocabulary nor reject an unknown one). The FRESH authority angle
// here is COMPLETE-LIFECYCLE VOCABULARY WITH EXPLICIT GATE + TERMINAL STATES, pinned
// both directly and transitively through the record. (1) THIRTEEN DECLARED STATES —
// from intake (inbox / captured) through triage and drafting (triaged /
// waiting_input / drafted / running / waiting_approval / planned / in_progress /
// blocked / ready_for_review) to the two terminal states (done / archived); an
// unknown status is rejected. (2) GATE STATES ARE FIRST-CLASS — waiting_input,
// waiting_approval, and blocked are declared members, so a stalled item names WHY
// it is parked rather than sitting in a vague "pending". (3) NO IMPLICIT DEFAULT —
// a bare z.enum (no `.default()`): an item's status must always be an explicit
// declared state; parsing `undefined` fails. (4) THE RECORD CANNOT HOLD AN
// UNMODELLED STATE — workItemSchema embeds the status by value, so a work item
// carrying an unknown lifecycle state is transitively rejected. Enum members read
// back via `.options`.

const workItem = {
  id: "work_item_1",
  sessionId: "session_1",
  title: "pin the lifecycle vocab",
  kind: "general",
  lane: "auto",
  status: "inbox",
  summary: "characterize the work-item status enum",
  sourceRefs: [],
  evidenceRefs: [],
  missingInfo: [],
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("workItemStatus — complete lifecycle vocabulary", () => {
  it("admits exactly the thirteen lifecycle states in order", () => {
    expect(workItemStatusSchema.options).toEqual([
      "inbox",
      "captured",
      "triaged",
      "waiting_input",
      "drafted",
      "running",
      "waiting_approval",
      "planned",
      "in_progress",
      "blocked",
      "ready_for_review",
      "done",
      "archived",
    ]);
    expect(workItemStatusSchema.safeParse("cancelled").success).toBe(false);
  });

  it("declares the gate and terminal states as first-class members", () => {
    for (const status of ["waiting_input", "waiting_approval", "blocked", "done", "archived"]) {
      expect(workItemStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("has no implicit default — an absent status is an error, not a fallback", () => {
    expect(workItemStatusSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("workItemStatus — the record cannot hold an unmodelled state", () => {
  it("accepts a work item at a declared lifecycle state", () => {
    expect(workItemSchema.safeParse(workItem).success).toBe(true);
  });

  it("transitively rejects a work item carrying an unknown status (by-value embed)", () => {
    expect(workItemSchema.safeParse({ ...workItem, status: "cancelled" }).success).toBe(false);
  });
});
