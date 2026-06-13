import { describe, expect, it } from "vitest";
import type { ServerMissionRecord } from "@ai-orchestrator/protocol";
import {
  mapServerMissionToBoardItem,
  mergeMissionBoard,
  MISSION_SOURCE_LABEL,
  type MissionBoardItem,
} from "./missionBoardModel";

function serverRecord(overrides: Partial<ServerMissionRecord["mission"]> = {}, updatedAt = "2026-06-13T01:00:00.000Z"): ServerMissionRecord {
  return {
    mission: {
      missionId: "mission_1",
      title: "서버 미션",
      goal: "goal",
      truthStatus: "observed",
      createdBy: "desktop",
      createdAt: "2026-06-13T00:00:00.000Z",
      ...overrides,
    },
    status: "running",
    truthStatus: "observed",
    workers: [
      {
        id: "worker_mission_1_agent_kurumi",
        missionId: "mission_1",
        agentId: "agent_kurumi",
        role: "companion",
        status: "assigned",
        capability: {
          agentId: "agent_kurumi",
          role: "companion",
          displayName: "쿠루미",
          personaName: "kurumi",
          mode: "merge_recommend",
          allowedTools: ["complete"],
          canMutateFiles: false,
          canRunCommands: false,
          requiresSandbox: false,
          defaultSandboxKind: "disabled",
          requiresHumanApprovalFor: [],
          personaContinuity: {
            agentId: "agent_kurumi",
            personaSlug: "kurumi",
            displayName: "쿠루미",
            role: "companion",
            soulMode: "full",
            configSource: "markdown",
            identityFiles: [],
            hermes: {
              slotId: "hermes-03",
              sticky: true,
              memoryScope: "persona:kurumi:role:companion",
              restorePolicy: "restore_when_available",
              promotionPolicy: "curator_required",
            },
            voice: {
              preserveCharacterVoice: true,
              allowSpeechQuirks: true,
              allowEmotionalColor: true,
              forbiddenSuppressionReasons: [],
              safetyOverrideNote: "",
            },
          },
          notes: [],
        },
        assignedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [],
    checkpoints: [],
    errorCards: [],
    selfCorrections: [],
    workspaces: [],
    designBlueprints: [],
    visualQaReports: [],
    designIssues: [],
    updatedAt,
  };
}

function localItem(missionId: string, updatedAt = "2026-06-13T00:30:00.000Z"): MissionBoardItem {
  return {
    missionId,
    title: `로컬 ${missionId}`,
    goal: "local goal",
    status: "planned",
    truthStatus: "planned",
    source: "local_fallback",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    updatedAt,
  };
}

describe("mapServerMissionToBoardItem", () => {
  it("carries source/truth/Hermes slot through to the board item", () => {
    const item = mapServerMissionToBoardItem(serverRecord());
    expect(item.source).toBe("server_observed");
    expect(MISSION_SOURCE_LABEL[item.source]).toBe("DGX 저장됨");
    expect(item.truthStatus).toBe("observed");
    expect(item.workers[0]).toMatchObject({
      displayName: "쿠루미",
      capabilityMode: "merge_recommend",
      canMutateFiles: false,
      hermesSlotId: "hermes-03",
    });
  });
});

describe("mergeMissionBoard", () => {
  it("hydrates the board from server records and keeps local-only items as fallback", () => {
    const snapshot = mergeMissionBoard({
      serverRecords: [serverRecord()],
      localItems: [localItem("mission_local")],
    });
    expect(snapshot.serverReachable).toBe(true);
    expect(snapshot.items.map((item) => [item.missionId, item.source])).toEqual([
      ["mission_1", "server_observed"],
      ["mission_local", "local_fallback"],
    ]);
  });

  it("server-observed wins over a local item with the same mission id", () => {
    const snapshot = mergeMissionBoard({
      serverRecords: [serverRecord()],
      localItems: [localItem("mission_1")],
    });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]!.source).toBe("server_observed");
    expect(snapshot.items[0]!.title).toBe("서버 미션");
  });

  it("keeps the local board alive when the server is unreachable", () => {
    const snapshot = mergeMissionBoard({
      serverRecords: undefined,
      localItems: [localItem("mission_local")],
      serverError: "fetch failed",
    });
    expect(snapshot.serverReachable).toBe(false);
    expect(snapshot.serverError).toBe("fetch failed");
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]!.source).toBe("local_fallback");
  });
});
