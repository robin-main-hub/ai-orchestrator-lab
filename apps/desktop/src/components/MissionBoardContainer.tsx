import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CodingPacket,
  MissionCreateRequest,
  MissionWorkerAssignmentRequest,
} from "@ai-orchestrator/protocol";
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
  mergeTargetBranch = "main",
  repoRoot,
  buildWorkers,
  sourceSessionId,
  codingPacketId,
  debateId,
}: {
  serverBaseUrl?: string | string[];
  /** 검증 명령 소스 + 미션 생성 시드 — 현재 CodingPacket */
  packet?: CodingPacket;
  /** 서버 밖 로컬 임시 미션 (있으면 fallback으로 병합 표시) */
  localItems?: MissionBoardItem[];
  /** 병합 대상 브랜치 (서버 allowlist에 있어야 실제 머지) */
  mergeTargetBranch?: string;
  /** 실제 머지를 수행할 repo root (서버 allowlist 미명시면 dry_run) */
  repoRoot?: string;
  /** 미션 워커 구성기 — 실제 페르소나(이름·personaName·Hermes 슬롯)로 채운다.
   *  없으면 익명 역할로 폴백. 호출 시 Hermes 슬롯 풀을 점유·영속할 수 있다. */
  buildWorkers?: () => MissionWorkerAssignmentRequest[];
  /** lineage — 미션을 출처(세션/패킷/토론)와 연결 */
  sourceSessionId?: string;
  codingPacketId?: string;
  debateId?: string;
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

  // 진행 중(verifying/running) 미션이 있으면 가벼운 폴링으로 자동 갱신 —
  // 다른 경로/클라이언트의 진행이 보드에 반영되게 (정적 현황판 방지).
  const hasInflight = snapshot.items.some((item) => item.status === "verifying" || item.status === "running");
  const busyRef = useRef(false);
  busyRef.current = Boolean(busyMissionId) || loading;
  useEffect(() => {
    if (!hasInflight) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      if (!busyRef.current) {
        void refresh();
      }
    }, 8_000);
    return () => globalThis.clearInterval(timer);
  }, [hasInflight, refresh]);

  const verificationCommands = packet?.verificationPlan.filter((line) => line.trim().length > 0) ?? [];

  const fallbackWorkers: MissionWorkerAssignmentRequest[] = [
    { agentId: "agent_architect", role: "architect", displayName: "Architect", soulMode: "summary", configSource: "internal" },
    { agentId: "agent_builder", role: "builder", displayName: "Builder", soulMode: "summary", configSource: "internal" },
    { agentId: "agent_verifier", role: "verifier", displayName: "Verifier", soulMode: "summary", configSource: "internal" },
  ];

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
        const message = error instanceof Error ? error.message : String(error);
        // 검증은 서버가 실제 실행이라 길다 — abort/timeout은 "서버에선 계속 돌 수
        // 있음"을 알려 상태 어긋남 오해를 막고, 자동으로 한 번 더 회수한다.
        const friendly = /abort|timed? ?out/i.test(message)
          ? "시간이 오래 걸려 중단됨 — 서버에선 계속 실행 중일 수 있어요. 곧 자동 새로고침합니다"
          : message;
        setNotice(`${kind} 실패: ${friendly}`);
        if (/abort|timed? ?out/i.test(message)) {
          await refresh();
        }
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
      const request: MissionCreateRequest = {
        // 충돌 불가능한 id (Date.now 단독은 연타/멀티창에서 충돌 → 두 번째 생성이
        // 서버 dedup으로 조용히 사라짐). uuid 조각을 더한다.
        id: `mission_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        title: packet.goal.slice(0, 60) || "새 미션",
        goal: packet.goal || "패킷에서 승격된 미션",
        // 막 만든 미션은 실측 0건 — observed가 아니라 planned. observed 격상은
        // 서버가 검증 통과를 보고서야 부여한다 (가짜 green 방지).
        truthStatus: "planned",
        createdBy: "desktop",
        // 출처 연결 — 어느 세션/패킷/토론에서 왔는지 역추적 가능
        sourceSessionId,
        codingPacketId,
        debateId,
        // 실제 페르소나(이름·personaName·Hermes 슬롯)로 워커 구성, 없으면 익명 폴백
        workers: buildWorkers ? buildWorkers() : fallbackWorkers,
      };
      await createDgxMission({ request, serverBaseUrl });
      setNotice(`미션 생성됨: ${request.title}`);
      await refresh();
    } catch (error) {
      setNotice(`미션 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreating(false);
    }
  }, [packet, creating, serverBaseUrl, refresh, buildWorkers, sourceSessionId, codingPacketId, debateId]);

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
                // D4a: 실제 머지에 필요한 ref. repoRoot는 서버 allowlist에 있을
                // 때만 실제 git merge, 아니면 dry_run. UI는 의도를 표현만 한다.
                sourceBranch: `agent/${item.missionId}`,
                targetBranch: mergeTargetBranch,
                repoRoot,
                status: "queued",
                requiredVerificationReportId: item.latestVerification.id,
                conflictFiles: [],
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
