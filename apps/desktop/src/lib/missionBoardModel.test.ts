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
    scaffoldPlans: [],
    scaffoldOverlays: [],
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
    workspaceCount: 0,
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
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

describe("mapServerMissionToBoardItem — D2~D8 차원", () => {
  it("flattens workspace/preview/visualQa/designIssues/errorCards/selfCorrections from the record", () => {
    const base = serverRecord();
    const record: ServerMissionRecord = {
      ...base,
      workspaces: [
        {
          id: "ws_1",
          missionId: "mission_1",
          repoRootRef: "/repos/demo-app",
          appType: "react_vite",
          preview: { status: "running", truthStatus: "observed", url: "http://127.0.0.1:4466", port: 4466 },
          terminal: { runnerKind: "local", mode: "build" },
          files: { changedCount: 3 },
          createdAt: "2026-06-13T00:10:00.000Z",
        },
      ],
      visualQaReports: [
        {
          id: "qa_1",
          missionId: "mission_1",
          workspaceId: "ws_1",
          previewUrl: "http://127.0.0.1:4466",
          checks: [],
          issues: [],
          status: "failed",
          truthStatus: "observed",
          createdAt: "2026-06-13T00:11:00.000Z",
        },
      ],
      designIssues: [
        {
          id: "issue_1",
          missionId: "mission_1",
          workspaceId: "ws_1",
          kind: "visual_overflow",
          severity: "high",
          summary: "mobile 가로 overflow",
          recommendation: "max-width로 가두세요",
          evidenceRef: "/shots/ws_1/mobile.png",
          truthStatus: "observed",
          createdAt: "2026-06-13T00:11:00.000Z",
        },
      ],
      errorCards: [
        {
          id: "err_1",
          missionId: "mission_1",
          runnerKind: "local",
          status: "failed",
          rootCause: "TS2532 객체가 undefined일 수 있음",
          directive: "옵셔널 체이닝으로 가드하세요",
          targetFile: "src/x.ts",
          stderrPreview: "x.ts(3,1): error TS2532",
          truthStatus: "observed",
          createdAt: "2026-06-13T00:12:00.000Z",
        },
      ],
      selfCorrections: [
        { id: "sc_1", missionId: "mission_1", attempt: 1, action: "retry", reason: "동일 에러 첫 발생 — 1회 재시도", createdAt: "2026-06-13T00:12:30.000Z" },
      ],
    };
    const item = mapServerMissionToBoardItem(record);
    expect(item.workspace).toMatchObject({ name: "repos/demo-app", appType: "react_vite", previewStatus: "running", previewUrl: "http://127.0.0.1:4466", previewTruth: "observed" });
    expect(item.workspaceCount).toBe(1);
    expect(item.latestVisualQa).toMatchObject({ status: "failed", truthStatus: "observed", issueCount: 0 });
    expect(item.designIssues[0]).toMatchObject({ kind: "visual_overflow", severity: "high", evidenceRef: "/shots/ws_1/mobile.png" });
    expect(item.errorCards[0]).toMatchObject({ status: "failed", targetFile: "src/x.ts" });
    expect(item.selfCorrections[0]).toMatchObject({ action: "retry", attempt: 1 });
  });

  it("leaves dimensions empty/undefined when the record has none (no fabricated state)", () => {
    const item = mapServerMissionToBoardItem(serverRecord());
    expect(item.workspace).toBeUndefined();
    expect(item.workspaceCount).toBe(0);
    expect(item.latestVisualQa).toBeUndefined();
    expect(item.designIssues).toEqual([]);
    expect(item.errorCards).toEqual([]);
    expect(item.selfCorrections).toEqual([]);
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
