import { useCallback, useEffect, useState } from "react";
import type { CodingPacket, MissionCreateRequest } from "@ai-orchestrator/protocol";
import { mergeMissionBoard, type MissionBoardItem, type MissionBoardSnapshot } from "../lib/missionBoardModel";
import {
  createDgxMission,
  fetchDgxMissions,
  mergeDgxMission,
  verifyDgxMission,
} from "../runtime/stage47MissionServer";
import { MissionBoardPanel } from "./MissionBoardPanel";

/**
 * Mission Board 컨테이너 — 풀 루프 글루:
 *   패킷 → 미션 생성(POST /missions)
 *   → 검증 실행(POST /missions/:id/verify, 서버가 실제 실행 → 진짜 observed)
 *   → 병합 대기열(mission.merge.queued)
 *   → 머지 실행(POST /missions/:id/merge)
 * 로직은 전부 순수 모듈/서버에 있고 여기는 배선만. 서버가 죽어도 보드는 죽지 않는다.
 */
export function MissionBoardContainer({
  serverBaseUrl,
  packet,
  localItems,
}: {
  serverBaseUrl?: string | string[];
  /** 검증 명령 소스 + 미션 생성 시드 — 현재 CodingPacket */
  packet?: CodingPacket;
  /** 서버 밖 로컬 임시 미션 (있으면 fallback으로 병합 표시) */
  localItems?: MissionBoardItem[];
}) {
  const [snapshot, setSnapshot] = useState<MissionBoardSnapshot>(() =>
    mergeMissionBoard({ serverRecords: undefined, localItems, serverError: "아직 불러오지 않음" }),
  );
  const [loading, setLoading] = useState(false);
  const [busyMissionId, setBusyMissionId] = useState<string | undefined>();
  const [busyKind, setBusyKind] = useState<"verify" | "queue" | "merge" | undefined>();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchDgxMissions({ serverBaseUrl });
      setSnapshot(mergeMissionBoard({ serverRecords: response.missions, localItems }));
    } catch (error) {
      setSnapshot(
        mergeMissionBoard({
          serverRecords: undefined,
          localItems,
          serverError: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [serverBaseUrl, localItems]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verificationCommands = packet?.verificationPlan.filter((line) => line.trim().length > 0) ?? [];

  const withBusy = useCallback(
    async (missionId: string, kind: "verify" | "queue" | "merge", action: () => Promise<string>) => {
      if (busyMissionId) {
        return;
      }
      setBusyMissionId(missionId);
      setBusyKind(kind);
      setNotice(undefined);
      try {
        setNotice(await action());
        await refresh();
      } catch (error) {
        setNotice(`${kind} 실패: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusyMissionId(undefined);
        setBusyKind(undefined);
      }
    },
    [busyMissionId, refresh],
  );

  const onCreateMission = useCallback(async () => {
    if (!packet || creating) {
      return;
    }
    setCreating(true);
    setNotice(undefined);
    try {
      const stamp = Date.now();
      const request: MissionCreateRequest = {
        id: `mission_${stamp}`,
        title: packet.goal.slice(0, 60) || "새 미션",
        goal: packet.goal || "패킷에서 승격된 미션",
        truthStatus: "observed",
        createdBy: "desktop",
        workers: [
          { agentId: "agent_architect", role: "architect", displayName: "Architect", soulMode: "summary", configSource: "internal" },
          { agentId: "agent_builder", role: "builder", displayName: "Builder", soulMode: "summary", configSource: "internal" },
          { agentId: "agent_verifier", role: "verifier", displayName: "Verifier", soulMode: "summary", configSource: "internal" },
        ],
      };
      await createDgxMission({ request, serverBaseUrl });
      setNotice(`미션 생성됨: ${request.title}`);
      await refresh();
    } catch (error) {
      setNotice(`미션 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreating(false);
    }
  }, [packet, creating, serverBaseUrl, refresh]);

  const onVerify = useCallback(
    (item: MissionBoardItem) =>
      withBusy(item.missionId, "verify", async () => {
        // 서버가 검증 명령을 실제로 실행하고 종료코드를 관측 → 진짜 observed
        const { mission } = await verifyDgxMission({
          missionId: item.missionId,
          request: { commands: verificationCommands },
          serverBaseUrl,
        });
        const report = mission.verificationReports.at(-1);
        return `검증 완료: ${report?.status}${report?.observed ? " (observed)" : ""}`;
      }),
    [withBusy, verificationCommands, serverBaseUrl],
  );

  const onQueueMerge = useCallback(
    (item: MissionBoardItem) =>
      withBusy(item.missionId, "queue", async () => {
        if (!item.latestVerification) {
          throw new Error("검증 리포트가 없습니다");
        }
        const { appendDgxMissionEvent } = await import("../runtime/stage47MissionServer");
        await appendDgxMissionEvent({
          missionId: item.missionId,
          request: {
            type: "mission.merge.queued",
            payload: {
              item: {
                id: `merge_${item.missionId}_${item.latestVerification.id}`,
                missionId: item.missionId,
                branchName: `agent/${item.missionId}`,
                status: "queued",
                requiredVerificationReportId: item.latestVerification.id,
                reason: "observed passed verification",
                queuedAt: new Date().toISOString(),
              },
            },
          },
          serverBaseUrl,
        });
        return "병합 대기열에 등록됨";
      }),
    [withBusy, serverBaseUrl],
  );

  const onMerge = useCallback(
    (item: MissionBoardItem) =>
      withBusy(item.missionId, "merge", async () => {
        const { mission } = await mergeDgxMission({
          missionId: item.missionId,
          request: { mergeQueueItemId: `merge_${item.missionId}_${item.latestVerification?.id}` },
          serverBaseUrl,
        });
        return `머지 실행됨 — 미션 상태: ${mission.status}`;
      }),
    [withBusy, serverBaseUrl],
  );

  return (
    <MissionBoardPanel
      snapshot={snapshot}
      loading={loading}
      creating={creating}
      busyMissionId={busyMissionId}
      busyKind={busyKind}
      notice={notice}
      onRefresh={() => void refresh()}
      onCreateMission={packet ? () => void onCreateMission() : undefined}
      onVerify={(item) => void onVerify(item)}
      onQueueMerge={(item) => void onQueueMerge(item)}
      onMerge={(item) => void onMerge(item)}
      verifyAvailable={verificationCommands.length > 0}
    />
  );
}
