import { describe, expect, it } from "vitest";
import { assistantDraftSchema, workItemHandoffSchema, workItemSchema } from "@ai-orchestrator/protocol";
import { initialAssistantDrafts, initialWorkItemHandoffs, initialWorkItems } from "./workItems";

// These three arrays are the BOOT-STATE the desktop OS renders before any live
// data arrives — the seeded work item, its assistant draft, and its handoff packet.
// They are declared with TypeScript types (WorkItem[] / AssistantDraft[] /
// WorkItemHandoff[]) but NOTHING runtime-validates them against the Zod schemas:
// the compiler checks the inferred *shape*, yet Zod refinements the inferred type
// cannot express (enum literal narrowing, min/max bounds, the surface/kind/lane
// vocabularies, the createdAt string) are only enforced at parse time — so a seed
// could typecheck and still be a malformed protocol instance the renderer boots
// into. The FRESH authority angle here is BOOT-STATE CONFORMANCE: the demo state
// the OS starts from is itself a valid, internally-consistent protocol instance.
// (1) EVERY SEED PARSES — each initialWorkItems / initialAssistantDrafts /
// initialWorkItemHandoffs entry round-trips through its schema (a runtime check
// strictly stronger than the compile-time type). (2) THE BOOT GRAPH HAS NO DANGLING
// REFERENCE — every draft and every handoff names a workItemId that an actual
// seeded work item carries, so the OS never boots pointing a draft/handoff at a
// work item that isn't there. (3) NON-EMPTY BOOT STATE — there is at least one
// seeded work item, so the very first render exercises a real record, not an
// empty list.

describe("workItems seed — boot-state conforms to the protocol schema", () => {
  it("seeds at least one work item (non-empty boot state)", () => {
    expect(initialWorkItems.length).toBeGreaterThan(0);
  });

  it("every seeded work item parses against workItemSchema", () => {
    for (const item of initialWorkItems) {
      expect(workItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it("every seeded assistant draft parses against assistantDraftSchema", () => {
    for (const draft of initialAssistantDrafts) {
      expect(assistantDraftSchema.safeParse(draft).success).toBe(true);
    }
  });

  it("every seeded handoff parses against workItemHandoffSchema", () => {
    for (const handoff of initialWorkItemHandoffs) {
      expect(workItemHandoffSchema.safeParse(handoff).success).toBe(true);
    }
  });
});

describe("workItems seed — the boot graph has no dangling reference", () => {
  const workItemIds = new Set(initialWorkItems.map((item) => item.id));

  it("every draft points at a seeded work item", () => {
    for (const draft of initialAssistantDrafts) {
      expect(workItemIds.has(draft.workItemId)).toBe(true);
    }
  });

  it("every handoff points at a seeded work item", () => {
    for (const handoff of initialWorkItemHandoffs) {
      expect(workItemIds.has(handoff.workItemId)).toBe(true);
    }
  });
});
