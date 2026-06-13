import { ClipboardList, GitMerge, RefreshCw, ShieldCheck } from "lucide-react";
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
  verifyingMissionId,
  queueingMissionId,
  notice,
  onRefresh,
  onVerify,
  onQueueMerge,
  verifyAvailable,
}: {
  snapshot: MissionBoardSnapshot;
  loading?: boolean;
  /** 검증 실행 중인 미션 id (버튼 스피너/비활성용) */
  verifyingMissionId?: string;
  /** 머지 큐 등록 중인 미션 id */
  queueingMissionId?: string;
  /** 마지막 동작 결과 안내 한 줄 */
  notice?: string;
  onRefresh: () => void;
  /** 제공 시 검증 가능 미션 카드에 "검증 실행" 버튼 노출 */
  onVerify?: (item: MissionBoardItem) => void;
  /** 제공 시 observed+passed 검증이 있는 카드에 "병합 대기열" 버튼 노출 */
  onQueueMerge?: (item: MissionBoardItem) => void;
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
            ? "저장된 미션이 없습니다. 토론에서 패킷을 만들어 미션으로 승격하세요."
            : "서버 미연결 — 로컬 임시 미션도 없습니다."}
        </p>
      ) : (
        <ul className="mission-board-list">
          {snapshot.items.map((item) => {
            const verifiable = Boolean(
              onVerify && item.source === "server_observed" && item.workers.some((w) => w.capabilityMode === "sandbox_verify"),
            );
            const queueable = Boolean(
              onQueueMerge &&
                item.source === "server_observed" &&
                item.latestVerification?.observed &&
                item.latestVerification.status === "passed" &&
                item.mergeQueueCount === 0,
            );
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
                {(verifiable || queueable) && (
                  <div className="mission-board-actions">
                    {verifiable ? (
                      verifyAvailable ? (
                        <button
                          className="rail-icon-button mission-board-verify"
                          disabled={verifyingMissionId === item.missionId}
                          onClick={() => onVerify?.(item)}
                          type="button"
                        >
                          <ShieldCheck size={13} />
                          {verifyingMissionId === item.missionId ? "검증 중…" : "검증 실행"}
                        </button>
                      ) : (
                        <span className="mission-board-hint">검증 명령 없음 — 패킷의 검증 계획이 필요합니다</span>
                      )
                    ) : null}
                    {queueable ? (
                      <button
                        className="rail-icon-button mission-board-queue"
                        disabled={queueingMissionId === item.missionId}
                        onClick={() => onQueueMerge?.(item)}
                        type="button"
                      >
                        <GitMerge size={13} />
                        {queueingMissionId === item.missionId ? "등록 중…" : "병합 대기열 등록"}
                      </button>
                    ) : null}
                  </div>
                )}
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
