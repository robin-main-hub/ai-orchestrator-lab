import { describe, expect, it } from "vitest";
import { initialAssistantDrafts, initialWorkItemHandoffs, initialWorkItems } from "./workItems";

// Characterization tests (no behavior change, pure, no I/O) for the WorkItem board
// seeds. These three seeds are 0-ref across the test tree. This is read-only seed
// structure — we do NOT start any committed WorkItem lifecycle, just assert the
// graph the board renders at boot: a draft or handoff carries a workItemId, and one
// that points at a non-existent work item would be an orphan card. Drafts/handoffs
// also inherit their parent work item's evidenceRefs, so that linkage must hold.
// We assert referential integrity only, deriving the valid id set from initialWorkItems.

const workItemIds = new Set(initialWorkItems.map((item) => item.id));
const workItemById = new Map(initialWorkItems.map((item) => [item.id, item] as const));

describe("WorkItem board seeds — referential integrity", () => {
  it("keeps work item ids unique and every work item's evidence ref ids unique", () => {
    const ids = initialWorkItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of initialWorkItems) {
      const evidenceIds = item.evidenceRefs.map((ref) => ref.id);
      expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
    }
  });

  it("ties every assistant draft to an existing work item and its session (no orphan card)", () => {
    const ids = initialAssistantDrafts.map((draft) => draft.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const draft of initialAssistantDrafts) {
      expect(workItemIds.has(draft.workItemId)).toBe(true);
      expect(draft.sessionId).toBe(workItemById.get(draft.workItemId)!.sessionId);
    }
  });

  it("ties every work item handoff to an existing work item (no orphan handoff)", () => {
    const ids = initialWorkItemHandoffs.map((handoff) => handoff.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const handoff of initialWorkItemHandoffs) {
      expect(workItemIds.has(handoff.workItemId)).toBe(true);
    }
  });

  it("inherits the parent work item's evidence refs onto its drafts and handoffs", () => {
    for (const draft of initialAssistantDrafts) {
      expect(draft.evidenceRefs).toEqual(workItemById.get(draft.workItemId)!.evidenceRefs);
    }
    for (const handoff of initialWorkItemHandoffs) {
      expect(handoff.evidenceRefs).toEqual(workItemById.get(handoff.workItemId)!.evidenceRefs);
    }
  });
});
