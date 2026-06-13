import type { AgentProfile, AgentRole } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { createMissionWorkerAssignment } from "@ai-orchestrator/agents";
import { createHermesSlotPool, type HermesSlot } from "./hermesSlotPool";
import {
  createPersonaContinuityFromHermesSlot,
  reserveHermesSlotForMissionWorker,
} from "./missionWorkerHermes";

function profile(role: AgentRole, overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: `agent_${role}`,
    name: role,
    kind: "virtual",
    role,
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    ...overrides,
  };
}

describe("createPersonaContinuityFromHermesSlot", () => {
  it("re-points the static contract slotId at the real pool slot id", () => {
    const kurumi = profile("companion", { personaName: "kurumi", soulMode: "full", configSource: "markdown" });
    const slot: HermesSlot = { id: "hermes-03", status: "bound", persona: "kurumi", needsReset: false };
    const continuity = createPersonaContinuityFromHermesSlot(kurumi, slot);

    expect(continuity.hermes.slotId).toBe("hermes-03"); // not "hermes:kurumi"
    expect(continuity.hermes.sticky).toBe(true);
    expect(continuity.personaSlug).toBe("kurumi");
    // SOUL/AGENTS file refs from the contract are preserved
    expect(continuity.identityFiles.map((f) => f.kind)).toEqual(["SOUL", "AGENTS", "IDENTITY", "USER"]);
  });

  it("downgrades restore policy to summary_only for a recycled (needsReset) slot", () => {
    const slot: HermesSlot = { id: "hermes-05", status: "bound", persona: "yohane", needsReset: true };
    const continuity = createPersonaContinuityFromHermesSlot(profile("skeptic", { personaName: "yohane" }), slot);
    expect(continuity.hermes.restorePolicy).toBe("summary_only");
  });
});

describe("reserveHermesSlotForMissionWorker", () => {
  it("reserves a real slot for the worker and binds the continuity to it", () => {
    const worker = createMissionWorkerAssignment({
      missionId: "mission_1",
      profile: profile("companion", { personaName: "kurumi" }),
      now: "2026-06-13T00:00:00.000Z",
    });
    const pool = createHermesSlotPool(4);

    const reservation = reserveHermesSlotForMissionWorker(worker, pool);

    expect(reservation.outcome).toBe("spare_attached");
    expect(reservation.slot.persona).toBe("kurumi");
    expect(reservation.continuity.hermes.slotId).toBe(reservation.slot.id);
    expect(reservation.pool.slots.find((s) => s.id === reservation.slot.id)?.status).toBe("bound");
  });

  it("is sticky — the same persona reuses her slot across missions", () => {
    const worker = createMissionWorkerAssignment({
      missionId: "mission_1",
      profile: profile("builder", { personaName: "rias" }),
      now: "2026-06-13T00:00:00.000Z",
    });
    const first = reserveHermesSlotForMissionWorker(worker, createHermesSlotPool(4));
    const second = reserveHermesSlotForMissionWorker(worker, first.pool);

    expect(second.outcome).toBe("sticky_reuse");
    expect(second.slot.id).toBe(first.slot.id);
    expect(second.requiresBoot).toBe(false);
  });
});
