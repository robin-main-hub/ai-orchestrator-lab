import type { MemoryRecord } from "@ai-orchestrator/protocol";

export type MemoryCuratorPersistencePlan = {
  activateRecordIds: string[];
  changedRecordIds: string[];
  forgetRecordIds: string[];
  quarantineRecordIds: string[];
};

export function createMemoryCuratorPersistencePlan(
  beforeRecords: MemoryRecord[],
  afterRecords: MemoryRecord[],
): MemoryCuratorPersistencePlan {
  const beforeById = new Map(beforeRecords.map((record) => [record.id, record]));
  const activateRecordIds: string[] = [];
  const changedRecordIds: string[] = [];
  const forgetRecordIds: string[] = [];
  const quarantineRecordIds: string[] = [];

  for (const after of afterRecords) {
    const before = beforeById.get(after.id);
    if (!before) continue;

    const becameTombstoned = !before.tombstonedAt && Boolean(after.tombstonedAt);
    const activationChanged = before.activationState !== after.activationState;
    const updated = before.updatedAt !== after.updatedAt;

    if (becameTombstoned) {
      forgetRecordIds.push(after.id);
    }
    if (after.activationState === "active" && before.activationState !== "active" && !after.tombstonedAt) {
      activateRecordIds.push(after.id);
    }
    if (after.activationState === "quarantined" && before.activationState !== "quarantined" && !after.tombstonedAt) {
      quarantineRecordIds.push(after.id);
    }
    if (becameTombstoned || activationChanged || updated) {
      changedRecordIds.push(after.id);
    }
  }

  return {
    activateRecordIds,
    changedRecordIds,
    forgetRecordIds,
    quarantineRecordIds,
  };
}
