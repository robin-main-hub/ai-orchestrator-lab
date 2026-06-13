import { createHermesPersonaContinuity } from "@ai-orchestrator/agents";
import type { AgentProfile, MissionWorkerAssignment, PersonaContinuitySpec } from "@ai-orchestrator/protocol";
import {
  acquireHermesSlot,
  type HermesSlot,
  type HermesSlotPool,
  type SlotAcquisitionOutcome,
} from "./hermesSlotPool";

/**
 * Bridge between the product-kernel persona continuity contract and the live
 * Hermes slot pool.
 *
 * The contract's createHermesPersonaContinuity emits a static slotId
 * ("hermes:<slug>"), while the runtime pool hands out real sticky slots
 * ("hermes-03"). Left apart, those are two parallel notions of "the persona's
 * Hermes slot" — a dead layer. These helpers bind the contract's continuity to
 * the actual reserved slot so a MissionWorker carries the same slot identity
 * the pool tracks.
 */

/** Re-point a continuity spec at a concrete pool slot, reflecting its sticky/reset state. */
export function bindContinuityToHermesSlot(
  continuity: PersonaContinuitySpec,
  slot: HermesSlot,
): PersonaContinuitySpec {
  return {
    ...continuity,
    hermes: {
      ...continuity.hermes,
      slotId: slot.id,
      sticky: slot.status === "bound",
      // a recycled slot inherits nothing — fall back to summary-only restore
      restorePolicy: slot.needsReset ? "summary_only" : continuity.hermes.restorePolicy,
    },
  };
}

/** Build a continuity spec for a profile already bound to a specific pool slot. */
export function createPersonaContinuityFromHermesSlot(
  profile: AgentProfile,
  slot: HermesSlot,
): PersonaContinuitySpec {
  return bindContinuityToHermesSlot(createHermesPersonaContinuity(profile), slot);
}

export type MissionWorkerHermesReservation = {
  pool: HermesSlotPool;
  slot: HermesSlot;
  /** the worker's continuity, re-bound to the reserved pool slot */
  continuity: PersonaContinuitySpec;
  /** dispatch the reset/boot before identity injection (recycled spare) */
  requiresBoot: boolean;
  outcome: SlotAcquisitionOutcome;
};

/**
 * Reserve a Hermes slot for a mission worker and return its continuity bound to
 * that real slot. Sticky: the same persona reuses her slot across missions, so
 * her history stays hers.
 */
export function reserveHermesSlotForMissionWorker(
  worker: MissionWorkerAssignment,
  pool: HermesSlotPool,
): MissionWorkerHermesReservation {
  const acquisition = acquireHermesSlot(pool, worker.capability.personaContinuity.personaSlug);
  return {
    pool: acquisition.pool,
    slot: acquisition.slot,
    continuity: bindContinuityToHermesSlot(worker.capability.personaContinuity, acquisition.slot),
    requiresBoot: acquisition.requiresBoot,
    outcome: acquisition.outcome,
  };
}
