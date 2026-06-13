import { ClipboardList, GitMerge, Plus, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import {
  MISSION_SOURCE_LABEL,
  MISSION_STATUS_LABEL,
  MISSION_TRUTH_LABEL,
  type MissionBoardItem,
  type MissionBoardSnapshot,
} from "../lib/missionBoardModel";

/**
 * Mission Board — 서버 event storage에서 복원된 미션과 로컬 임시 항목을 한
 * 보드로 보여주는 프레젠테이션 패널. 원칙: 멋있게 보이되 거짓말하지 않는다 —
 * 모든 카드에 출처(DGX 저장됨/로컬 임시)와 truth status가 그대로 드러난다.
 */
export function MissionBoardPanel({
  snapshot,
  loading,
  creating,
  busyMissionId,
  busyKind,
  notice,
  onRefresh,
  onCreateMission,
  onVerify,
  onQueueMerge,
  onMerge,
  verifyAvailable,
}: {
  snapshot: MissionBoardSnapshot;
  loading?: boolean;
  /** 미션 생성 중 */
  creating?: boolean;
  /** 동작 진행 중인 미션 id */
  busyMissionId?: string;
  /** 진행 중인 동작 종류 */
  busyKind?: "verify" | "queue" | "merge";
  /** 마지막 동작 결과 안내 한 줄 */
  notice?: string;
  onRefresh: () => void;
  /** 제공 시 헤더에 "패킷→미션 생성" 버튼 노출 */
  onCreateMission?: () => void;
  /** 제공 시 검증 가능 미션 카드에 "검증 실행" 버튼 노출 */
  onVerify?: (item: MissionBoardItem) => void;
  /** 제공 시 observed+passed 검증이 있는 카드에 "병합 대기열" 버튼 노출 */
  onQueueMerge?: (item: MissionBoardItem) => void;
  /** 제공 시 머지 대기열 항목이 있는 카드에 "머지 실행" 버튼 노출 */
  onMerge?: (item: MissionBoardItem) => void;
  /** 검증 명령 소스(CodingPacket)가 준비됐는지 — 없으면 버튼 대신 사유 표시 */
  verifyAvailable?: boolean;
}) {
  return (
    <section className="mini-panel mission-board-panel">
      <header>
        <ClipboardList size={16} />
        <span>미션 보드</span>
        <StatusBadge size="sm" variant={snapshot.serverReachable ? "success" : "warning"}>
          {snapshot.serverReachable ? "DGX 연결됨" : "서버 미연결"}
        </StatusBadge>
        {onCreateMission ? (
          <button className="rail-icon-button mission-board-create" disabled={creating} onClick={onCreateMission} type="button">
            <Plus size={13} />
            {creating ? "생성 중…" : "패킷→미션 생성"}
          </button>
        ) : null}
        <button className="rail-icon-button mission-board-refresh" disabled={loading} onClick={onRefresh} type="button">
          <RefreshCw size={13} />
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </header>

      {!snapshot.serverReachable && snapshot.serverError ? (
        <p className="mission-board-error">서버 인덱스를 불러오지 못했습니다: {snapshot.serverError}</p>
      ) : null}
      {notice ? <p className="mission-board-notice">{notice}</p> : null}

      {snapshot.items.length === 0 ? (
        <p className="mission-board-empty">
          {snapshot.serverReachable
            ? "저장된 미션이 없습니다. 패킷을 만든 뒤 위 '패킷→미션 생성'으로 승격하세요. (실제 페르소나 실행은 자율·병렬 탭, 미션 보드는 서버에 영속되는 검증·머지 기록입니다.)"
            : "서버 미연결 — 로컬 임시 미션도 없습니다."}
        </p>
      ) : (
        <ul className="mission-board-list">
          {snapshot.items.map((item) => {
            const verifiable = Boolean(
              onVerify && item.source === "server_observed" && item.workers.some((w) => w.capabilityMode === "sandbox_verify"),
            );
            const verified = Boolean(
              item.source === "server_observed" &&
                item.latestVerification?.observed &&
                item.latestVerification.status === "passed",
            );
            const queueable = Boolean(onQueueMerge && verified && item.mergeQueueCount === 0);
            const mergeable = Boolean(onMerge && verified && item.mergeQueueCount > 0 && item.status !== "merged");
            return (
              <li className="mission-board-card" key={`${item.source}:${item.missionId}`}>
                <div className="mission-board-card-head">
                  <strong>{item.title}</strong>
                  <StatusBadge size="sm" variant={statusVariant(item.status)}>
                    {MISSION_STATUS_LABEL[item.status]}
                  </StatusBadge>
                  <StatusBadge size="sm" variant={item.source === "server_observed" ? "primary" : "muted"}>
                    {MISSION_SOURCE_LABEL[item.source]}
                  </StatusBadge>
                  <span className="mission-board-truth">{MISSION_TRUTH_LABEL[item.truthStatus]}</span>
                </div>
                <p className="mission-board-goal">{item.goal}</p>
                {item.workers.length > 0 ? (
                  <p className="mission-board-workers">
                    {item.workers
                      .map((worker) => `${worker.displayName} (${worker.capabilityMode} · ${worker.hermesSlotId})`)
                      .join(" · ")}
                  </p>
                ) : null}
                <p className="mission-board-meta">
                  workers {item.workers.length} · artifacts {item.artifactCount} · verification {item.verificationCount}
                  {item.latestVerification
                    ? ` (최신 ${item.latestVerification.status}${item.latestVerification.observed ? " · observed" : " · 미관측"})`
                    : ""}
                  {" · merge queue "}
                  {item.mergeQueueCount}
                </p>
                {/* 검증 실패 사유 — 무엇이 왜 깨졌는지 카드에서 바로 보이게 */}
                {item.latestVerification?.status === "failed" && item.latestVerification.failedCheck ? (
                  <p className="mission-board-fail">검증 실패: {item.latestVerification.failedCheck} — 명령을 고치고 다시 검증하세요</p>
                ) : null}
                {/* 머지 결과 정직 표시 — merged sha / conflict / dry_run */}
                {item.latestMerge ? (
                  <p className="mission-board-mergestate">
                    {item.latestMerge.status === "merged"
                      ? `머지됨 · ${item.latestMerge.sha?.slice(0, 10) ?? "sha 없음"}`
                      : item.latestMerge.status === "conflict"
                        ? `머지 충돌 · ${item.latestMerge.conflictCount}개 파일 (abort됨 — 미션 미완료)`
                        : item.latestMerge.status === "dry_run"
                          ? "dry_run · 실제 머지 안 함 (repoRoot가 서버 allowlist에 없음)"
                          : `머지 ${item.latestMerge.status}`}
                  </p>
                ) : null}
                {(verifiable || queueable || mergeable) && (
                  <div className="mission-board-actions">
                    {verifiable ? (
                      verifyAvailable ? (
                        <button
                          className="rail-icon-button mission-board-verify"
                          disabled={Boolean(busyMissionId)}
                          onClick={() => onVerify?.(item)}
                          type="button"
                        >
                          <ShieldCheck size={13} />
                          {busyMissionId === item.missionId && busyKind === "verify" ? "검증 중… (최대 3분)" : "검증 실행"}
                        </button>
                      ) : (
                        <span className="mission-board-hint">검증 명령 없음 — 패킷의 검증 계획이 필요합니다</span>
                      )
                    ) : null}
                    {queueable ? (
                      <button
                        className="rail-icon-button mission-board-queue"
                        disabled={busyMissionId === item.missionId}
                        onClick={() => onQueueMerge?.(item)}
                        type="button"
                      >
                        <GitMerge size={13} />
                        {busyMissionId === item.missionId && busyKind === "queue" ? "등록 중…" : "병합 대기열 등록"}
                      </button>
                    ) : null}
                    {mergeable ? (
                      <button
                        className="rail-icon-button mission-board-merge"
                        disabled={Boolean(busyMissionId)}
                        onClick={() => onMerge?.(item)}
                        type="button"
                      >
                        <Rocket size={13} />
                        {busyMissionId === item.missionId && busyKind === "merge" ? "머지 중…" : "머지 실행"}
                      </button>
                    ) : null}
                    {Boolean(busyMissionId) && busyMissionId !== item.missionId ? (
                      <span className="mission-board-hint">다른 미션 작업 중 — 잠시 후 다시 시도하세요</span>
                    ) : null}
                  </div>
                )}
                {/* 액션이 하나도 없는 server 미션엔 그 사유를 표시 (죽은 카드 방지) */}
                {item.source === "server_observed" && !verifiable && !queueable && !mergeable ? (
                  <p className="mission-board-hint">
                    {item.workers.some((w) => w.capabilityMode === "sandbox_verify")
                      ? "검증 후 병합 대기열·머지가 열립니다"
                      : "검증 가능한 워커(verifier/reviewer)가 없습니다"}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function statusVariant(status: MissionBoardItem["status"]): StatusBadgeVariant {
  switch (status) {
    case "merged":
    case "ready_to_merge":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "running":
    case "verifying":
      return "primary";
    case "waiting_approval":
      return "warning";
    default:
      return "muted";
  }
}
