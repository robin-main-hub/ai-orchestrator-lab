import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CodingPacket,
  MissionCreateRequest,
  MissionWorkerAssignmentRequest,
  MissionScaffoldLatestResponse,
} from "@ai-orchestrator/protocol";
import { mergeMissionBoard, type MissionBoardItem, type MissionBoardSnapshot } from "../lib/missionBoardModel";
import {
  createDgxMission,
  fetchDgxMissions,
  fetchMissionScaffoldLatest,
  mergeDgxMission,
  verifyDgxMission,
} from "../runtime/stage47MissionServer";
import type { MissionScaffoldFile, PublishHistoryByStep } from "../lib/missionPublishPrefill";
import { accumulatePublishHistory } from "../lib/missionPublishPrefill";
import { publishEnvironmentWithScaffolds } from "../lib/publishEnvironmentWithScaffolds";
import { MissionBoardPanel, type MissionPublishEnvironment } from "./MissionBoardPanel";

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
  publishEnvironment,
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
  /** opt-in: 제공 시 Workspace 상세에 "GitHub로 내보내기" CTA(GithubPublishPanel) 노출 */
  publishEnvironment?: MissionPublishEnvironment;
}) {
  const [snapshot, setSnapshot] = useState<MissionBoardSnapshot>(() =>
    mergeMissionBoard({ serverRecords: undefined, localItems, serverError: "아직 불러오지 않음" }),
  );
  const [loading, setLoading] = useState(false);
  const [busyMissionId, setBusyMissionId] = useState<string | undefined>();
  const [busyKind, setBusyKind] = useState<"verify" | "queue" | "merge" | undefined>();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  // 펼쳐진 미션(Workspace/Preview/VisualQA 상세) — 한 번에 하나만, 로컬 UI 상태일 뿐
  const [expandedMissionId, setExpandedMissionId] = useState<string | undefined>();

  /**
   * Publish Flow file prefill용 scaffold 파일 캐시.
   *   - 사용자가 미션을 펼치면(Workspace 상세 토글) 그 미션의 scaffold latest를 한 번 lazy fetch.
   *   - 이 캐시는 publishEnvironment.getScaffoldFiles로 노출되어 builtinMissionPrefill이
   *     첫 안전 파일을 자동으로 채우게 한다.
   *   - 동일 mission을 다시 펼쳐도 재호출하지 않는다(idempotent read이지만 네트워크 절약).
   *   - 실패하면 캐시에 빈 배열을 두지 않는다(다음 재시도 가능) — undefined 유지.
   */
  const [scaffoldCacheByMission, setScaffoldCacheByMission] = useState<Record<string, ReadonlyArray<MissionScaffoldFile>>>({});
  const scaffoldFetchInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!expandedMissionId) return;
    if (scaffoldCacheByMission[expandedMissionId]) return; // 캐시 hit
    if (scaffoldFetchInFlight.current.has(expandedMissionId)) return; // 중복 fetch 방지
    const missionId = expandedMissionId;
    scaffoldFetchInFlight.current.add(missionId);
    void (async () => {
      try {
        const response: MissionScaffoldLatestResponse = await fetchMissionScaffoldLatest({ missionId, serverBaseUrl });
        // 서버가 status="found" 또는 "partial"이면 files가 채워져 있다. "not_found"면 files=[].
        // 추측 금지: 응답에 있는 것만 캐시에 둔다(스킵 목록은 사용자에게 따로 보여줄 수 있게 builtin에서 처리).
        const files: MissionScaffoldFile[] = response.files.map((file) => ({
          path: file.path,
          newContent: file.content,
          operation: "create" as const,
        }));
        setScaffoldCacheByMission((prev) => ({ ...prev, [missionId]: files }));
      } catch {
        // 실패 시 캐시에 두지 않음 — 다음 펼치기에 재시도. publish CTA를 막지 않는다.
      } finally {
        scaffoldFetchInFlight.current.delete(missionId);
      }
    })();
  }, [expandedMissionId, scaffoldCacheByMission, serverBaseUrl]);

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

  /**
   * Publish flow 단계별 latest entry를 미션 단위로 누적한다.
   *   - GithubPublishPanel.emit이 발행한 trace event를 onContextEvent에서 가로채 파싱.
   *   - branch/file/pr 각각 최신 1건만 보관(재시도 시 최신만 표면).
   *   - 영속화 없음(세션 메모리). 새로고침 시 초기화 — 정직성.
   */
  const [publishHistoryByMission, setPublishHistoryByMission] = useState<Record<string, PublishHistoryByStep>>({});

  /**
   * 부모가 준 publishEnvironment + 컨테이너 scaffold 캐시 + publish history 합성.
   * 추가로 onContextEvent를 감싸 github.publish.*를 누적한 뒤 부모에게도 forward.
   * refreshScaffold는 사용자가 "수정안으로 스캐폴드 다시 생성"을 누른 직후 prefill 갱신용.
   */
  const mergedPublishEnvironment = useMemo<MissionPublishEnvironment | undefined>(() => {
    const withScaffolds = publishEnvironmentWithScaffolds(publishEnvironment, scaffoldCacheByMission);
    if (!withScaffolds) return undefined;
    return {
      ...withScaffolds,
      getPublishHistory: withScaffolds.getPublishHistory ?? ((item) => publishHistoryByMission[item.missionId]),
      refreshScaffold:
        withScaffolds.refreshScaffold ??
        ((missionId: string) => {
          // 캐시에서 해당 missionId 항목 삭제 → useEffect deps 변경 → 다시 fetch.
          // 추측 금지: 응답이 올 때까지 prefill은 비어 있게 둠(이전 값 재사용 X).
          setScaffoldCacheByMission((prev) => {
            if (!(missionId in prev)) return prev;
            const next = { ...prev };
            delete next[missionId];
            return next;
          });
        }),
      onContextEvent: (type, payload) => {
        // 순수 함수에 위임 — 파싱/누적 규칙은 lib에 단언적으로 단위 테스트됨.
        setPublishHistoryByMission((prev) => accumulatePublishHistory(prev, type, payload));
        withScaffolds.onContextEvent?.(type, payload);
      },
    };
  }, [publishEnvironment, scaffoldCacheByMission, publishHistoryByMission]);

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
      expandedMissionId={expandedMissionId}
      onToggleDetail={(item) =>
        setExpandedMissionId((current) => (current === item.missionId ? undefined : item.missionId))
      }
      publishEnvironment={mergedPublishEnvironment}
    />
  );
}
