import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Github,
  GitMerge,
  Monitor,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import { GithubPublishPanel } from "./coding/GithubPublishPanel";
import {
  DESIGN_ISSUE_KIND_LABEL,
  MISSION_SOURCE_LABEL,
  MISSION_STATUS_LABEL,
  MISSION_TRUTH_LABEL,
  PREVIEW_STATUS_LABEL,
  VISUAL_QA_STATUS_LABEL,
  type MissionBoardItem,
  type MissionBoardSnapshot,
} from "../lib/missionBoardModel";

/** 카드에 펼쳐 보일 D2~D8 차원이 하나라도 있는지 — 없으면 "상세" 토글을 숨긴다(죽은 토글 방지). */
function hasWorkspaceDetail(item: MissionBoardItem): boolean {
  return Boolean(
    item.workspace ||
      item.latestVisualQa ||
      item.designIssues.length > 0 ||
      item.errorCards.length > 0 ||
      item.selfCorrections.length > 0,
  );
}

/**
 * Mission Board — 서버 event storage에서 복원된 미션과 로컬 임시 항목을 한
 * 보드로 보여주는 프레젠테이션 패널. 원칙: 멋있게 보이되 거짓말하지 않는다 —
 * 모든 카드에 출처(DGX 저장됨/로컬 임시)와 truth status가 그대로 드러난다.
 */
/**
 * GitHub Publish 통합 환경 — Workspace 상세 안의 "GitHub로 내보내기" CTA가 가리키는 진입점.
 * 부모(App)에서 직접 채워 넣지 않으면 CTA 자체가 표시되지 않는다(opt-in).
 *  - serverBaseUrl: 코딩 서버 주소(/integrations/github/write/* 라우트가 있는 곳)
 *  - defaultRepoFullName: Mission이 어떤 repo로 publish될지 사전 추측(틀려도 사용자가 수정)
 *  - onContextEvent: panel이 emit하는 trace를 Mission trace에 적재
 *  - fetchImpl: 테스트에서 fetch 주입
 */
export type MissionPublishEnvironment = {
  serverBaseUrl?: string | string[];
  defaultRepoFullName?: string;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
  fetchImpl?: typeof fetch;
};

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
  expandedMissionId,
  onToggleDetail,
  publishEnvironment,
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
  /** 펼쳐진 미션 id — Workspace/Preview/VisualQA/ErrorCard 상세를 보여줄 카드 */
  expandedMissionId?: string;
  /** 제공 시 detail이 있는 카드에 "상세" 토글 노출 */
  onToggleDetail?: (item: MissionBoardItem) => void;
  /** 제공 시 Workspace 상세에 "GitHub로 내보내기" CTA + GithubPublishPanel을 노출(접힘 기본). */
  publishEnvironment?: MissionPublishEnvironment;
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
                {/* D2~D8 차원(Workspace/Preview/VisualQA/ErrorCard/SelfCorrection) — 펼쳐서 관측 */}
                {onToggleDetail && hasWorkspaceDetail(item) ? (
                  <div className="mission-board-detail">
                    <button
                      className="mission-board-detail-toggle"
                      onClick={() => onToggleDetail(item)}
                      type="button"
                      aria-expanded={expandedMissionId === item.missionId}
                    >
                      {expandedMissionId === item.missionId ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <Monitor size={13} />
                      Workspace 상세
                      <span className="mission-board-detail-counts">{detailCountLabel(item)}</span>
                    </button>
                    {expandedMissionId === item.missionId ? <MissionWorkspaceDetail item={item} publishEnvironment={publishEnvironment} /> : null}
                  </div>
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

/** 펼치기 전에 한눈에 — 어떤 차원이 몇 개 있는지(가짜 0 표시 안 함). */
function detailCountLabel(item: MissionBoardItem): string {
  const parts: string[] = [];
  if (item.workspaceCount > 0) parts.push(`workspace ${item.workspaceCount}`);
  if (item.designIssues.length > 0) parts.push(`design ${item.designIssues.length}`);
  if (item.errorCards.length > 0) parts.push(`error ${item.errorCards.length}`);
  if (item.selfCorrections.length > 0) parts.push(`자가수정 ${item.selfCorrections.length}`);
  return parts.join(" · ");
}

function previewVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "running":
      return "success";
    case "failed":
    case "blocked":
      return "danger";
    case "starting":
      return "primary";
    default:
      return "muted";
  }
}

function qaVariant(status: "passed" | "warning" | "failed" | "blocked"): StatusBadgeVariant {
  switch (status) {
    case "passed":
      return "success";
    case "warning":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "muted";
  }
}

function severityVariant(severity: "low" | "medium" | "high"): StatusBadgeVariant {
  return severity === "high" ? "danger" : severity === "medium" ? "warning" : "muted";
}

/**
 * Mission Workspace 상세 — 서버에 이미 있는 D2~D8 차원을 **읽기 전용**으로 펼쳐 보인다.
 * 새 fetch·새 상태 없음(보드 snapshot에서 파생). preview url은 observed running일 때만,
 * 디자인 이슈/에러 카드는 관측분만 — 화면에 안 본 걸 지어내지 않는다.
 */
function MissionWorkspaceDetail({
  item,
  publishEnvironment,
}: {
  item: MissionBoardItem;
  publishEnvironment?: MissionPublishEnvironment;
}) {
  // 기본 접힘 — 사용자 명시 클릭으로만 GithubPublishPanel을 마운트한다.
  // (publishEnvironment가 없으면 CTA 자체를 그리지 않아 부모가 opt-in한 경우에만 노출.)
  const [publishOpen, setPublishOpen] = useState(false);
  return (
    <div className="mission-workspace-detail">
      {/* AppWorkspace + preview (D2/D4/D5a) */}
      {item.workspace ? (
        <div className="mission-workspace-row">
          <span className="mission-workspace-row-label">
            <Monitor size={12} /> Workspace
          </span>
          <span className="mission-workspace-row-body">
            {item.workspace.name} <em>({item.workspace.appType})</em>
            {" · preview "}
            <StatusBadge size="sm" variant={previewVariant(item.workspace.previewStatus)}>
              {PREVIEW_STATUS_LABEL[item.workspace.previewStatus] ?? item.workspace.previewStatus}
            </StatusBadge>{" "}
            <span className="mission-board-truth">{item.workspace.previewTruth}</span>
            {item.workspace.previewUrl ? (
              <span className="mission-workspace-url"> {item.workspace.previewUrl}</span>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* Visual QA 종합 (D5b) */}
      {item.latestVisualQa ? (
        <div className="mission-workspace-row">
          <span className="mission-workspace-row-label">
            <Sparkles size={12} /> Visual QA
          </span>
          <span className="mission-workspace-row-body">
            <StatusBadge size="sm" variant={qaVariant(item.latestVisualQa.status)}>
              {VISUAL_QA_STATUS_LABEL[item.latestVisualQa.status]}
            </StatusBadge>{" "}
            <span className="mission-board-truth">{item.latestVisualQa.truthStatus}</span>
            {item.latestVisualQa.issueCount > 0 ? ` · 이슈 ${item.latestVisualQa.issueCount}건` : " · 이슈 없음"}
          </span>
        </div>
      ) : null}

      {/* DesignIssueCard 목록 (D5b) — observed 관측분만 */}
      {item.designIssues.length > 0 ? (
        <ul className="mission-workspace-issues">
          {item.designIssues.map((issue) => (
            <li key={issue.id} className="mission-workspace-issue">
              <StatusBadge size="sm" variant={severityVariant(issue.severity)}>
                {DESIGN_ISSUE_KIND_LABEL[issue.kind] ?? issue.kind}
              </StatusBadge>{" "}
              {issue.summary}
              <span className="mission-workspace-issue-fix"> → {issue.recommendation}</span>
              {issue.evidenceRef ? <span className="mission-workspace-evidence"> · 증거 {shorten(issue.evidenceRef)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ErrorCard (L4) → SelfCorrection (L5) */}
      {item.errorCards.length > 0 ? (
        <ul className="mission-workspace-errors">
          {item.errorCards.map((card) => (
            <li key={card.id} className="mission-workspace-error">
              <span className="mission-workspace-row-label">
                <AlertTriangle size={12} /> {card.status}
              </span>
              <span className="mission-workspace-row-body">
                {card.rootCause}
                {card.targetFile ? <em> ({card.targetFile})</em> : null}
                <span className="mission-workspace-issue-fix"> → {card.directive}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {item.selfCorrections.length > 0 ? (
        <ul className="mission-workspace-corrections">
          {item.selfCorrections.map((correction) => (
            <li key={correction.id} className="mission-workspace-correction">
              <span className="mission-workspace-row-label">
                <Wrench size={12} /> 시도 {correction.attempt} · {correction.action}
              </span>
              <span className="mission-workspace-row-body">{correction.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* GitHub로 내보내기 — opt-in CTA. 부모가 publishEnvironment를 줘야 보인다. */}
      {publishEnvironment ? (
        <div className="mission-workspace-publish" data-testid="mission-workspace-publish-section">
          <button
            type="button"
            className="mission-workspace-publish-toggle rail-icon-button"
            aria-expanded={publishOpen}
            aria-controls={`mission-publish-${item.missionId}`}
            onClick={() => {
              const next = !publishOpen;
              setPublishOpen(next);
              publishEnvironment.onContextEvent?.(
                next ? "mission.publish.opened" : "mission.publish.closed",
                { missionId: item.missionId, ts: new Date().toISOString() },
              );
            }}
          >
            <Github size={13} />
            {publishOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            GitHub로 내보내기
            <span className="mission-board-truth">planned</span>
          </button>
          {publishOpen ? (
            <div id={`mission-publish-${item.missionId}`} className="mission-workspace-publish-body">
              <GithubPublishPanel
                serverBaseUrl={publishEnvironment.serverBaseUrl}
                defaultRepoFullName={publishEnvironment.defaultRepoFullName}
                onContextEvent={(type, payload) =>
                  // Mission 컨텍스트(missionId)를 trace event에 자동 첨부 — provenance.
                  publishEnvironment.onContextEvent?.(type, { ...payload, missionId: item.missionId })
                }
                fetchImpl={publishEnvironment.fetchImpl}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function shorten(ref: string, max = 36): string {
  return ref.length > max ? `…${ref.slice(ref.length - max + 1)}` : ref;
}
