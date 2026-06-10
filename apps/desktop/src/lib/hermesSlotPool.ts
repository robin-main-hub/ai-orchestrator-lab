/**
 * Hermes agent slot pool — persona ↔ Hermes agent bindings are STICKY.
 *
 * Booting a brand-new Hermes session on every summon would pile up discarded
 * session records forever. Instead the orchestrator keeps a pool of
 * pre-provisioned Hermes agent slots:
 *
 *   - a persona that already owns a slot REUSES it (her history stays hers,
 *     no reset, no new session record)
 *   - a NEW persona attaches to a spare slot (fresh spare = no reset needed;
 *     a recycled spare gets one reset so the new character inherits nothing)
 *   - when every slot is taken, ONE new Hermes agent slot is provisioned —
 *     from that point the pool grows one agent at a time, exactly as the
 *     roster actually grows
 *
 * Pure state machine; callers persist the returned pool (hermesPoolStore).
 */

export type HermesSlotStatus = "spare" | "bound";

export type HermesSlot = {
  id: string;
  status: HermesSlotStatus;
  /** sticky persona binding while bound */
  persona?: string;
  /** a previous persona used this slot — the next attach must reset the session */
  needsReset: boolean;
};

export type HermesSlotPool = {
  slots: HermesSlot[];
  /** 1-based counter used to name newly provisioned slots */
  nextSlotNumber: number;
};

/**
 * Default pool size: 7 swarm pane roles + headroom for parallel missions and
 * newly imported characters before any provisioning kicks in.
 */
export const DEFAULT_HERMES_POOL_SIZE = 12;

const slotName = (n: number): string => `hermes-${String(n).padStart(2, "0")}`;

export function createHermesSlotPool(count: number = DEFAULT_HERMES_POOL_SIZE): HermesSlotPool {
  return {
    slots: Array.from({ length: Math.max(0, count) }, (_, index) => ({
      id: slotName(index + 1),
      status: "spare" as const,
      needsReset: false,
    })),
    nextSlotNumber: Math.max(0, count) + 1,
  };
}

export type SlotAcquisitionOutcome = "sticky_reuse" | "spare_attached" | "provisioned_new";

export type SlotAcquisition = {
  pool: HermesSlotPool;
  slot: HermesSlot;
  outcome: SlotAcquisitionOutcome;
  /** dispatch the reset/boot command before identity injection */
  requiresBoot: boolean;
};

export function acquireHermesSlot(pool: HermesSlotPool, personaName: string): SlotAcquisition {
  const sticky = pool.slots.find((slot) => slot.status === "bound" && slot.persona === personaName);
  if (sticky) {
    return { pool, slot: sticky, outcome: "sticky_reuse", requiresBoot: false };
  }

  const spare = pool.slots.find((slot) => slot.status === "spare");
  if (spare) {
    const bound: HermesSlot = { ...spare, status: "bound", persona: personaName, needsReset: false };
    return {
      pool: { ...pool, slots: pool.slots.map((slot) => (slot.id === spare.id ? bound : slot)) },
      slot: bound,
      outcome: "spare_attached",
      // a recycled spare carries a previous character's session — reset it once
      requiresBoot: spare.needsReset,
    };
  }

  const provisioned: HermesSlot = {
    id: slotName(pool.nextSlotNumber),
    status: "bound",
    persona: personaName,
    needsReset: false,
  };
  return {
    pool: { slots: [...pool.slots, provisioned], nextSlotNumber: pool.nextSlotNumber + 1 },
    slot: provisioned,
    outcome: "provisioned_new",
    requiresBoot: false, // brand-new agent: nothing to inherit
  };
}

/** Unbind a persona (e.g. character retired/replaced). The slot returns to spare and resets on its next attach. */
export function releaseHermesSlot(pool: HermesSlotPool, personaName: string): HermesSlotPool {
  return {
    ...pool,
    slots: pool.slots.map((slot) =>
      slot.status === "bound" && slot.persona === personaName
        ? { id: slot.id, status: "spare" as const, needsReset: true }
        : slot,
    ),
  };
}

export type HermesPoolSummary = { total: number; bound: number; spare: number };

export function summarizeHermesPool(pool: HermesSlotPool): HermesPoolSummary {
  const bound = pool.slots.filter((slot) => slot.status === "bound").length;
  return { total: pool.slots.length, bound, spare: pool.slots.length - bound };
}
