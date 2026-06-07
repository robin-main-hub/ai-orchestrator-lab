import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import { createMemoryCuratorPersistencePlan } from "./memoryCuratorRuntime";

const createdAt = "2026-06-06T00:00:00.000Z";
const updatedAt = "2026-06-06T00:01:00.000Z";

function createRecord(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "title">): MemoryRecord {
  const { id, title, ...rest } = overrides;
  return {
    id,
    layer: "project_memory",
    scope: "project",
    kind: "decision",
    title,
    content: `${title} content`,
    sourceChannel: "desktop",
    trustLevel: "trusted",
    projectId: "project_ai_orchestrator_lab",
    activationState: "suggested",
    createdAt,
    pinned: false,
    ...rest,
  };
}

describe("memory curator runtime persistence planning", () => {
  it("turns duplicate reflection fixes into activate and forget persistence requests", () => {
    const older = createRecord({ id: "memory_old", title: "Old duplicate", createdAt });
    const newer = createRecord({ id: "memory_new", title: "New duplicate", createdAt: updatedAt });

    const plan = createMemoryCuratorPersistencePlan(
      [older, newer],
      [
        { ...older, activationState: "inactive", tombstonedAt: updatedAt },
        { ...newer, activationState: "active", updatedAt },
      ],
    );

    expect(plan.forgetRecordIds).toEqual(["memory_old"]);
    expect(plan.activateRecordIds).toEqual(["memory_new"]);
    expect(plan.quarantineRecordIds).toEqual([]);
    expect(plan.changedRecordIds).toEqual(["memory_old", "memory_new"]);
  });

  it("turns contradiction reflection fixes into activate and quarantine persistence requests", () => {
    const winner = createRecord({ id: "memory_winner", title: "Winner", importance: 0.9 });
    const loser = createRecord({ id: "memory_loser", title: "Loser", importance: 0.2 });

    const plan = createMemoryCuratorPersistencePlan(
      [winner, loser],
      [
        { ...winner, activationState: "active", updatedAt },
        { ...loser, activationState: "quarantined", updatedAt },
      ],
    );

    expect(plan.activateRecordIds).toEqual(["memory_winner"]);
    expect(plan.quarantineRecordIds).toEqual(["memory_loser"]);
    expect(plan.forgetRecordIds).toEqual([]);
    expect(plan.changedRecordIds).toEqual(["memory_winner", "memory_loser"]);
  });
});
