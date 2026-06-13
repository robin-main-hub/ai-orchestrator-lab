import { useCallback, useEffect, useState } from "react";
import { createSandboxPlanFromCodingPacket } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket, TerminalHostKind } from "@ai-orchestrator/protocol";
import { createAutonomyEffectsFactory } from "../lib/autonomousRun";
import { createLegacyTmuxRunner } from "../lib/legacyTmuxRunner";
import { mergeMissionBoard, type MissionBoardItem, type MissionBoardSnapshot } from "../lib/missionBoardModel";
import { runMissionVerificationPlan } from "../lib/missionVerification";
import { appendDgxMissionEvent, fetchDgxMission, fetchDgxMissions } from "../runtime/stage47MissionServer";
import { MissionBoardPanel } from "./MissionBoardPanel";

/**
 * Mission Board 컨테이너 — 서버 미션 인덱스 hydration(D1) + 검증 실행→기록(D2)
 * + 머지 큐 등록(D3)의 React 글루. 로직은 전부 순수 모듈(missionBoardModel /
 * missionVerification / sandboxPlan / legacyTmuxRunner)에 있고 여기는 배선만.
 */
export function MissionBoardContainer({
  serverBaseUrl,
  host = "dgx_02",
  tmuxSessionName = "ai-swarm",
  sessionId = "session_desktop_001",
  packet,
  localItems,
}: {
  serverBaseUrl?: string | string[];
  host?: TerminalHostKind;
  tmuxSessionName?: string;
  sessionId?: string;
  /** 검증 명령 소스 — 현재 CodingPacket의 verificationPlan을 사용 */
  packet?: CodingPacket;
  /** 서버 밖 로컬 임시 미션 (있으면 fallback으로 병합 표시) */
  localItems?: MissionBoardItem[];
}) {
  const [snapshot, setSnapshot] = useState<MissionBoardSnapshot>(() =>
    mergeMissionBoard({ serverRecords: undefined, localItems, serverError: "아직 불러오지 않음" }),
  );
  const [loading, setLoading] = useState(false);
  const [verifyingMissionId, setVerifyingMissionId] = useState<string | undefined>();
  const [queueingMissionId, setQueueingMissionId] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchDgxMissions({ serverBaseUrl });
      setSnapshot(mergeMissionBoard({ serverRecords: response.missions, localItems }));
    } catch (error) {
      // 서버가 죽어도 보드는 죽지 않는다 — 로컬 fallback 유지 + 사유 표기
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

  const onVerify = useCallback(
    async (item: MissionBoardItem) => {
      if (verificationCommands.length === 0 || verifyingMissionId) {
        return;
      }
      setVerifyingMissionId(item.missionId);
      setNotice(undefined);
      try {
        // 전체 미션 레코드에서 verifier capability를 가져온다 (보드 요약엔 없음)
        const { mission } = await fetchDgxMission({ missionId: item.missionId, serverBaseUrl });
        const verifier = mission.workers.find((worker) => worker.capability.mode === "sandbox_verify");
        if (!verifier) {
          setNotice("sandbox_verify 가능한 워커가 없습니다 — verifier/reviewer를 배정하세요");
          return;
        }

        // 기존 자율실행과 동일한 게이트 경로: base effects → LegacyTmuxRunner
        const session: AgentSession = {
          id: `as_${verifier.agentId}_verify_${item.missionId}`,
          sessionId,
          agentId: verifier.agentId,
          role: "qa",
          backend: "tmux",
          paneId: "role:qa",
          status: "spawned",
          createdAt: new Date().toISOString(),
        };
        const effects = createAutonomyEffectsFactory({
          mode: "auto_safe",
          server: { serverBaseUrl, host, tmuxSessionName },
          runId: `mission_verify_${item.missionId}`,
        })(session);
        const runner = createLegacyTmuxRunner({ capability: verifier.capability, effects });

        const requests = createSandboxPlanFromCodingPacket({
          packet: { ...packetWithOnly(verificationCommands) },
          missionId: item.missionId,
          workerId: verifier.id,
          mode: "verify",
          now: new Date().toISOString(),
        });
        const { report } = await runMissionVerificationPlan({
          requests,
          runner,
          missionId: item.missionId,
          verifierAgentId: verifier.agentId,
          reportId: `verify_${item.missionId}_${Date.now()}`,
        });

        await appendDgxMissionEvent({
          missionId: item.missionId,
          request: { type: "mission.verification.recorded", payload: { report } },
          serverBaseUrl,
        });
        setNotice(
          `검증 기록됨: ${report.status}${report.observed ? " (observed)" : " (종료코드 미관측 — legacy tmux)"}`,
        );
        await refresh();
      } catch (error) {
        setNotice(`검증 실패: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setVerifyingMissionId(undefined);
      }
    },
    [verificationCommands, verifyingMissionId, serverBaseUrl, host, tmuxSessionName, sessionId, refresh],
  );

  const onQueueMerge = useCallback(
    async (item: MissionBoardItem) => {
      if (!item.latestVerification || queueingMissionId) {
        return;
      }
      setQueueingMissionId(item.missionId);
      setNotice(undefined);
      try {
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
        setNotice("병합 대기열에 등록됐습니다 (sequential merge queue)");
        await refresh();
      } catch (error) {
        setNotice(`병합 대기열 등록 실패: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setQueueingMissionId(undefined);
      }
    },
    [queueingMissionId, serverBaseUrl, refresh],
  );

  return (
    <MissionBoardPanel
      snapshot={snapshot}
      loading={loading}
      verifyingMissionId={verifyingMissionId}
      queueingMissionId={queueingMissionId}
      notice={notice}
      onRefresh={() => void refresh()}
      onVerify={(item) => void onVerify(item)}
      onQueueMerge={(item) => void onQueueMerge(item)}
      verifyAvailable={verificationCommands.length > 0}
    />
  );
}

/** verificationPlan만 살린 최소 패킷 (sandboxPlan 입력용) */
function packetWithOnly(verificationPlan: string[]): CodingPacket {
  return {
    goal: "mission verification",
    context: [],
    decisions: [],
    rejectedOptions: [],
    constraints: [],
    filesToInspect: [],
    implementationPlan: [],
    verificationPlan,
    reviewerNotes: [],
  };
}
