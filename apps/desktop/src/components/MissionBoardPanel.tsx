import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileEdit,
  GitBranch,
  Github,
  GitMerge,
  GitPullRequest,
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
import { MultiFilePlanCard } from "./publish/MultiFilePlanCard";
import { PreviewRunCard } from "./PreviewRunCard";
import { CodingRunnerCard } from "./appbuild/CodingRunnerCard";
import { useRunnerPatchApprovalQueueController } from "../hooks/useRunnerPatchApprovalQueueController";
import { RunnerPatchApprovalPanel } from "./RunnerPatchApprovalPanel";
import { routeHandoffToControlQueue } from "../lib/runnerPatchToControlQueue";
import { VisualQaCard } from "./VisualQaCard";
import { MissionWorkspaceStatusBar } from "./MissionWorkspaceStatusBar";
import { AppBuildProgressRail } from "./AppBuildProgressRail";
import { MissionWorkspaceSummary } from "./MissionWorkspaceSummary";
import { GeneratedFilesPanel } from "./GeneratedFilesPanel";
import { EditTimelineCard } from "./EditTimelineCard";
import { SearchReplaceEditCard } from "./SearchReplaceEditCard";
import { TurboEditDraftCard } from "./TurboEditDraftCard";
import { buildAppFixDraftFromVisualQa } from "../lib/appFixDraft";
import type { TurboEditGenerator } from "../lib/turboEditGenerator";
import {
  buildEditTimeline,
  editHistoryEventFromContext,
  type EditHistoryEvent,
} from "../lib/editTimeline";
import { PreviewAnnotatePanel } from "./PreviewAnnotatePanel";
import {
  addAnnotation,
  annotationsToTurboEditIssues,
  type PreviewAnnotation,
  type PreviewAnnotationDraft,
} from "../lib/previewAnnotations";
import { postDgxMissionScaffoldOverlay } from "../runtime/stage47MissionServer";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "../lib/visualQaDiff";
import { resolvePreviewRef, type ActivePreviewRef, type ActivePreviewRefMap } from "../lib/activePreviewRef";
import { MissionRecordSync } from "./MissionRecordSync";
import type { ProjectRecordController } from "../hooks/useProjectRecordController";
import { useProjectRecordSync } from "../hooks/useProjectRecordSync";
import {
  builtinMissionPrefill,
  computeNextPublishStep,
  pickFirstSafeScaffoldFile,
  type MissionPublishPrefillResolver,
  type MissionScaffoldFile,
  type PublishHistoryByStep,
  type PublishNextAction,
  type PublishStep,
} from "../lib/missionPublishPrefill";
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
  /**
   * Mission 컨텍스트를 Publish Panel 입력 필드로 변환하는 resolver.
   * 주지 않으면 builtinMissionPrefill(mission.title/goal/missionId 기반)이 적용된다.
   * 호출자가 scaffold 파일/repo 매핑을 알고 있다면 직접 override 권장.
   *
   * 정직성: prefill은 "draft/planned" 값일 뿐, 자동 실행하지 않는다.
   */
  resolvePrefill?: MissionPublishPrefillResolver;
  /**
   * App Builder가 만든 scaffold/file change artifact 목록을 반환한다.
   * 없으면 publish panel은 file path/content를 비워둔다(추측 금지).
   * binary/대용량/시크릿 의심은 builtinMissionPrefill이 자동으로 거른다.
   */
  getScaffoldFiles?: (item: MissionBoardItem) => ReadonlyArray<MissionScaffoldFile> | undefined;
  /**
   * OSS-H6 — Turbo Edits "AI 수정 초안 생성"용 in-app generator. App.tsx가 active provider/model을
   * 알고 있고 requestCompletion 경로가 살아있을 때만 제공한다. 미제공이면 카드는 외부 LLM 복붙 경로만 노출.
   * 자동 overlay/Preview 0 — generator는 텍스트만 반환.
   */
  getTurboEditGenerator?: (item: MissionBoardItem) => {
    generator: TurboEditGenerator;
    providerLabel?: string;
  } | undefined;
  /**
   * PreviewRunCard가 observed preview URL을 받으면 부모로 lift — App.tsx의 activePreviewRef state
   * 갱신을 거쳐 ChatSidePanel "미리보기" 탭에 같은 URL이 임베드된다.
   * preview_not_running / error 분기에서는 절대 호출되지 않는다(정직성).
   */
  onPreviewObserved?: (ref: { missionId: string; url: string; observedAt: string }) => void;
  /**
   * 현재 세션에서 누적된 publish flow trace의 단계별 latest entry. branch/file/pr 각각 최신 1건.
   * 컨테이너가 onContextEvent에서 github.publish.*를 가로채 누적한 결과를 노출한다.
   * 영속화 없음: 페이지 새로고침 시 빈 상태로 시작(정직성).
   */
  getPublishHistory?: (item: MissionBoardItem) => PublishHistoryByStep | undefined;
  /**
   * Publish Panel prefill을 새 scaffold로 갱신하고 싶을 때 호출한다.
   *   - missionId 별 scaffold 캐시를 무효화 → useEffect가 fetchMissionScaffoldLatest 재호출.
   *   - GitHub write 호출 없음. Mission/file 자동 실행 없음.
   *   - 사용자가 "수정안으로 스캐폴드 다시 생성"을 누른 직후 같은 mission의 prefill을 갱신할 때 사용.
   */
  refreshScaffold?: (missionId: string) => void;
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
  onPreviewObserved,
  previewAnnotationDraft,
  projectRecordController,
  activePreviewRefByMissionId,
  publishHistoryByMission,
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
  /** PreviewRunCard가 observed URL을 받았을 때 부모(App)까지 전달한다. 실패 outcome은 호출하지 않는다. */
  onPreviewObserved?: (ref: ActivePreviewRef) => void;
  /** ChatSidePanel preview 좌표 annotation을 Workspace Turbo prompt에 합류시킨다. */
  previewAnnotationDraft?: PreviewAnnotationDraft | null;
  /** OSS-H10 — ProjectRecord index에 missionId별 상태를 영속화하는 controller. 없으면 sync 0(기본 동작 그대로). */
  projectRecordController?: ProjectRecordController;
  /** App.tsx가 들고 있는 가장 최근 observed preview ref. 다른 미션이면 sync는 무시. */
  activePreviewRefByMissionId?: ActivePreviewRefMap;
  /** Container가 누적한 단계별 publish history(missionId → branch/file/pr latest). hasDraft 판정용. */
  publishHistoryByMission?: Record<string, PublishHistoryByStep>;
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
                    {expandedMissionId === item.missionId ? (
                      <MissionWorkspaceDetail
                        item={item}
                        publishEnvironment={publishEnvironment}
                        onPreviewObserved={onPreviewObserved}
                        previewAnnotationDraft={previewAnnotationDraft}
                        projectRecordController={projectRecordController}
                      />
                    ) : null}
                  </div>
                ) : null}
                {projectRecordController ? (
                  <MissionRecordSync
                    controller={projectRecordController}
                    item={item}
                    activePreviewRef={resolvePreviewRef(activePreviewRefByMissionId ?? {}, item.missionId) ?? null}
                    publishHistory={publishHistoryByMission?.[item.missionId]}
                    scaffoldFileCount={publishEnvironment?.getScaffoldFiles?.(item)?.length}
                  />
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
  onPreviewObserved,
  previewAnnotationDraft,
  projectRecordController,
}: {
  item: MissionBoardItem;
  publishEnvironment?: MissionPublishEnvironment;
  onPreviewObserved?: (ref: ActivePreviewRef) => void;
  previewAnnotationDraft?: PreviewAnnotationDraft | null;
  projectRecordController?: ProjectRecordController;
}) {
  // 기본 접힘 — 사용자 명시 클릭으로만 GithubPublishPanel을 마운트한다.
  // (publishEnvironment가 없으면 CTA 자체를 그리지 않아 부모가 opt-in한 경우에만 노출.)
  const [publishOpen, setPublishOpen] = useState(false);
  // H8e — per-mission runner-patch approval queue (client-side, server route 0).
  // CodingRunnerCard.onHandoff가 enqueue, 같은 detail 안 RunnerPatchApprovalPanel이 결재 UI.
  const patchApprovalController = useRunnerPatchApprovalQueueController();
  /**
   * 직전 Visual QA + verify 결과를 StatusBar 계산기에 흘리기 위한 가벼운 mirror.
   * VisualQaCard가 onReport/onVerify로 알린다. 자동 실행 0 — 단순 상태 표시용.
   */
  const [latestQaReport, setLatestQaReport] = useState<VisualQaReport | undefined>(undefined);
  const [latestVerifyDiff, setLatestVerifyDiff] = useState<VisualQaDiff | undefined>(undefined);
  const [latestVerifyFailedStep, setLatestVerifyFailedStep] = useState<"preview" | "qa" | undefined>(undefined);
  const [fixApplied, setFixApplied] = useState(false);
  /**
   * "다음 할 일" CTA가 어떤 step을 가리키는지 — 사용자가 CTA를 누르면 publishOpen=true가 되고
   * 마운트 직후 그 step section으로 scrollIntoView 한다. 사용자가 그냥 GitHub로 내보내기 토글로
   * 열면 undefined로 두어 첫 step부터 보인다(자동 스크롤 없음).
   */
  const [targetStep, setTargetStep] = useState<PublishStep | undefined>();
  // Publish Flow 다음 할 일 — history에서 계산. publishEnvironment 없으면 undefined.
  const publishHistory = publishEnvironment?.getPublishHistory?.(item);
  const nextPublishAction: PublishNextAction | undefined = useMemo(
    () => (publishEnvironment ? computeNextPublishStep(publishHistory) : undefined),
    [publishEnvironment, publishHistory],
  );

  // publishOpen + targetStep 조합이 set되면 다음 paint 후 해당 step section을 화면에 스크롤.
  // 같은 mission에서만 동작하도록 mission-publish-<id> 컨테이너 안에서 querySelector.
  useEffect(() => {
    if (!publishOpen || !targetStep) return;
    const id = `mission-publish-${item.missionId}`;
    const handle = window.requestAnimationFrame(() => {
      const root = document.getElementById(id);
      const section = root?.querySelector<HTMLElement>(`[data-testid="publish-step-${targetStep}"]`);
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [publishOpen, targetStep, item.missionId]);

  /** scaffold 파일이 한 개 이상 있는지 — StatusBar phase 계산에 필요. */
  const hasScaffoldFiles = (publishEnvironment?.getScaffoldFiles?.(item)?.length ?? 0) > 0;

  /**
   * Evidence readiness → next action 라우터.
   *   - publish: publishOpen=true + 다음 paint에 publish-multifile-card로 scrollIntoView/focus.
   *   - fix: visual-qa-patch / draft / draft-cta 중 첫 매칭으로 scroll/focus.
   *   - preview: mission-preview-run-{id} 카드로 scroll/focus.
   *   - qa: visual-qa-run-{id} CTA로 scroll/focus.
   * 자동 실행 0 — 이동/강조만. trace는 호출자 측 onContextEvent에서 이미 발생.
   */
  const onNavigate = useCallback((target: "publish" | "fix" | "preview" | "qa") => {
    if (target === "publish") {
      if (!publishOpen) setPublishOpen(true);
      // mount/페인트 후 scroll. requestAnimationFrame 두 번으로 안전.
      const scrollToPublish = () => {
        const el =
          document.querySelector<HTMLElement>(`#mission-publish-${item.missionId} [data-testid="publish-multifile-card"]`)
          ?? document.getElementById(`mission-publish-${item.missionId}`);
        el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        if (el && typeof (el as HTMLElement).focus === "function") (el as HTMLElement).focus();
      };
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToPublish));
      } else {
        scrollToPublish();
      }
      return;
    }
    let el: HTMLElement | null = null;
    if (target === "fix") {
      el =
        document.querySelector<HTMLElement>(`[data-testid="visual-qa-patch-${item.missionId}"]`)
        ?? document.querySelector<HTMLElement>(`[data-testid="visual-qa-draft-${item.missionId}"]`)
        ?? document.querySelector<HTMLElement>(`[data-testid="visual-qa-draft-cta-${item.missionId}"]`);
    } else if (target === "preview") {
      el = document.querySelector<HTMLElement>(`[data-testid="mission-preview-run-${item.missionId}"]`);
    } else if (target === "qa") {
      el = document.querySelector<HTMLElement>(`[data-testid="visual-qa-run-${item.missionId}"]`);
    }
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    if (el && typeof el.focus === "function") el.focus();
  }, [publishOpen, item.missionId]);

  /** VisualQaCard가 상태 변화를 mirror하는 단일 콜백. read-only — 자동 실행 0. */
  const onVisualQaStateChange = useCallback((s: {
    qaReport?: VisualQaReport;
    verifyDiff?: VisualQaDiff;
    verifyFailedStep?: "preview" | "qa";
    fixApplied?: boolean;
  }) => {
    setLatestQaReport(s.qaReport);
    setLatestVerifyDiff(s.verifyDiff);
    setLatestVerifyFailedStep(s.verifyFailedStep);
    setFixApplied(!!s.fixApplied);
  }, []);
  // CTA polish — scaffold 유무에 따른 정직한 신호:
  //   - ready    : safeCount > 0 → "1개 자동 채움 준비"(실제 prefill은 항상 첫 안전 파일 1개)
  //   - blocked  : skipped > 0, safeCount == 0 → "모두 가드에 막힘 — 직접 입력 필요"
  //   - none     : 캐시 미스 또는 빈 배열 → 기본 보조 문구
  // useMemo로 매 렌더 재계산 방지(큰 scaffold 응답에서 가드 평가가 반복되지 않게).
  const scaffoldEval = useMemo(() => {
    if (!publishEnvironment) return undefined;
    const files = publishEnvironment.getScaffoldFiles?.(item);
    if (!files || files.length === 0) return undefined;
    return pickFirstSafeScaffoldFile(files);
  }, [publishEnvironment, item]);
  const scaffoldMode: "ready" | "blocked" | "none" = !scaffoldEval
    ? "none"
    : scaffoldEval.safeCount > 0
      ? "ready"
      : "blocked";

  // Turbo Edits → SearchReplaceEditCard 다리. text 상태를 부모가 들고 있다가
  // Turbo Edits Draft가 "초안으로 보내기" 클릭 시 textarea에 주입.
  const [searchReplaceText, setSearchReplaceText] = useState("");
  // H9 — edit loop event mirror. 서버 route 없이 Mission Workspace 세션 안에서만 보관한다.
  const [editHistoryEvents, setEditHistoryEvents] = useState<ReadonlyArray<EditHistoryEvent>>([]);
  const appendEditHistoryEvent = useCallback((event: EditHistoryEvent) => {
    setEditHistoryEvents((prev) => {
      const id = prev.some((existing) => existing.id === event.id)
        ? `${event.id}-${prev.length + 1}`
        : event.id;
      return [...prev, { ...event, id }];
    });
  }, []);
  const emitWorkspaceContextEvent = useCallback((type: string, payload: Record<string, unknown>) => {
    const enriched = { ...payload, missionId: item.missionId };
    publishEnvironment?.onContextEvent?.(type, enriched);
    const editEvent = editHistoryEventFromContext(type, enriched);
    if (editEvent) appendEditHistoryEvent(editEvent);
  }, [appendEditHistoryEvent, item.missionId, publishEnvironment]);
  const editTimeline = useMemo(
    () => buildEditTimeline(editHistoryEvents),
    [editHistoryEvents],
  );
  // OSS-H10 — MWD가 펼쳐졌을 때만 editTimeline raw items를 ProjectRecord로 흘린다.
  // controller가 없으면 noopController가 흡수해서 부수효과 0.
  useProjectRecordSync({
    controller: projectRecordController ?? noopProjectRecordController,
    missionId: item.missionId,
    title: item.title,
    goal: item.goal,
    editTimelineItems: editTimeline,
  });
  // AppFixDraft는 latestQaReport에서 결정적으로 빌드(추가 호출 0).
  const appFixDraftForTurbo = useMemo(
    () => (latestQaReport ? buildAppFixDraftFromVisualQa(latestQaReport) : undefined),
    [latestQaReport],
  );

  // OSS-H7 — preview annotations 상태. PreviewAnnotatePanel이 add/remove하고
  // TurboEditDraftCard로는 extraIssues로 흘려보낸다. 자동 적용 0.
  const [previewAnnotations, setPreviewAnnotations] = useState<ReadonlyArray<PreviewAnnotation>>([]);
  useEffect(() => {
    if (!previewAnnotationDraft || previewAnnotationDraft.missionId !== item.missionId) return;
    const annotation = previewAnnotationDraft.annotation;
    setPreviewAnnotations((prev) => addAnnotation(prev, annotation));
    appendEditHistoryEvent({
      id: `preview-annotation-${annotation.id}`,
      kind: "preview_annotation_captured",
      source: "preview",
      status: "captured",
      timestamp: annotation.viewportClick?.capturedAt ?? annotation.createdAt ?? previewAnnotationDraft.sentAt,
      affectedFiles: annotation.targetFile ? [annotation.targetFile] : [],
      summary: annotation.description,
    });
  }, [appendEditHistoryEvent, previewAnnotationDraft, item.missionId]);
  const annotationIssues = useMemo(
    () => annotationsToTurboEditIssues(previewAnnotations),
    [previewAnnotations],
  );
  // OSS-H7 P2 — PreviewIframe 주석 모드 click → pendingCoords로 stash → Annotate Panel에서 description 입력 후 합쳐 저장.
  const [pendingAnnotationCoords, setPendingAnnotationCoords] = useState<
    { xPct: number; yPct: number } | undefined
  >(undefined);
  const turboEditGeneratorHandle = useMemo(
    () => publishEnvironment?.getTurboEditGenerator?.(item),
    [publishEnvironment, item],
  );
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
            {/* preview URL은 실제 observed가 있을 때만 클릭 가능 링크로 노출. 없으면 fake 텍스트 X. */}
            {item.workspace.previewUrl ? (
              <a
                href={item.workspace.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`mission-workspace-preview-link-${item.missionId}`}
                className="mission-workspace-url"
                title="새 창에서 preview 열기"
              >
                {item.workspace.previewUrl}
              </a>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* Mission Workspace 헤더 — 전체 흐름(ProgressRail) → 요약(Summary) → 다음 액션(StatusBar). */}
      <AppBuildProgressRail
        missionId={item.missionId}
        missionExists={true /* 이 패널은 mission item 단위이므로 missionExists=true. */}
        hasScaffoldFiles={hasScaffoldFiles}
        previewObserved={!!item.workspace?.previewUrl}
        qaReport={latestQaReport ? { status: latestQaReport.status, issueCount: latestQaReport.issues.length } : undefined}
        fixApplied={fixApplied}
        verifyDiff={latestVerifyDiff ? { status: latestVerifyDiff.status } : undefined}
        verifyFailedStep={latestVerifyFailedStep}
      />
      <MissionWorkspaceSummary
        missionId={item.missionId}
        title={item.title}
        previewUrl={item.workspace?.previewUrl}
        qaReport={latestQaReport}
        fixApplied={fixApplied}
        verifyDiff={latestVerifyDiff}
        verifyFailedStep={latestVerifyFailedStep}
      />
      <MissionWorkspaceStatusBar
        missionId={item.missionId}
        hasScaffoldFiles={hasScaffoldFiles}
        previewObserved={!!item.workspace?.previewUrl}
        qaReport={latestQaReport}
        fixApplied={fixApplied}
        verifyDiff={latestVerifyDiff}
        verifyFailedStep={latestVerifyFailedStep}
        onNavigate={onNavigate}
      />

      {/* Generated Files Inspector — "이 앱이 어떤 파일들로 구성되어 있는지" 트리+내용으로 검토.
          read-only — 편집/실행 0. scaffold/latest 캐시 재사용(별도 fetch 0). */}
      <GeneratedFilesPanel
        missionId={item.missionId}
        files={publishEnvironment?.getScaffoldFiles?.(item)}
      />

      {/* Preview Annotator (OSS-H7) — 텍스트 주석 + iframe 좌표.
          PreviewRunCard PreviewIframe overlay 좌표는 pendingAnnotationCoords로 stash,
          ChatSidePanel iframe viewport 좌표는 previewAnnotationDraft로 합류 — 둘 다 같은 extraIssues 경로.
          iframe 내부 DOM selector/text는 cross-origin 경계 때문에 unknown으로 둔다(가짜 dom 정보 X). */}
      <PreviewAnnotatePanel
        missionId={item.missionId}
        files={publishEnvironment?.getScaffoldFiles?.(item)}
        annotations={previewAnnotations}
        onChange={setPreviewAnnotations}
        onContextEvent={emitWorkspaceContextEvent}
        pendingCoords={pendingAnnotationCoords}
        onClearPendingCoords={() => setPendingAnnotationCoords(undefined)}
      />

      {/* Turbo Edits Draft (OSS-H5/H6/H7) — LLM이 SEARCH/REPLACE 블록을 만들도록 prompt를 빌드.
          H8: onGenerate가 주입되면 앱 안에서 provider 호출까지 가능(외부 LLM 복붙 경로는 유지).
          H7: PreviewAnnotatePanel의 annotation들이 extraIssues로 합류.
          자동 overlay/Preview 0 — 응답 valid면 SearchReplaceEditCard에만 자동 주입. */}
      <TurboEditDraftCard
        missionId={item.missionId}
        appName={item.title}
        files={publishEnvironment?.getScaffoldFiles?.(item)}
        appFixDraft={appFixDraftForTurbo}
        extraIssues={annotationIssues.length > 0 ? annotationIssues : undefined}
        onSendDraft={setSearchReplaceText}
        onContextEvent={emitWorkspaceContextEvent}
        onGenerate={turboEditGeneratorHandle?.generator}
        providerLabel={turboEditGeneratorHandle?.providerLabel}
      />

      {/* Search/Replace Edit (OSS-H4) — Aider 스타일 좁은 편집을 그대로 ScaffoldOverlay로.
          자동 실행 0: 사용자가 Apply 클릭한 경우에만 scaffold/overlay POST.
          text는 부모가 들고 — Turbo Edits Draft에서 주입될 수 있게(controlled). */}
      <SearchReplaceEditCard
        missionId={item.missionId}
        files={publishEnvironment?.getScaffoldFiles?.(item)}
        text={searchReplaceText}
        onTextChange={setSearchReplaceText}
        onApply={async (overlayFiles) => {
          const response = await postDgxMissionScaffoldOverlay({
            missionId: item.missionId,
            request: {
              source: "manual",
              files: overlayFiles.map((f) => ({ path: f.path, content: f.content })),
            },
            serverBaseUrl: publishEnvironment?.serverBaseUrl,
            fetchImpl: publishEnvironment?.fetchImpl,
          });
          if (response.outcome === "recorded") {
            const paths = overlayFiles.map((file) => file.path);
            emitWorkspaceContextEvent("mission.search_replace.applied", {
              paths,
              fileCount: paths.length,
              overlayId: response.overlay?.id,
              patchText: searchReplaceText,
              ts: new Date().toISOString(),
            });
            publishEnvironment?.refreshScaffold?.(item.missionId);
          }
          return response;
        }}
        onContextEvent={emitWorkspaceContextEvent}
      />

      <EditTimelineCard
        missionId={item.missionId}
        items={editTimeline}
        onRestorePatch={setSearchReplaceText}
      />

      {/* Preview Run vertical CTA — scaffold가 있으면 한 번 클릭으로 materialize+preview 실행.
          fake preview URL 금지: 서버가 observed로 반환할 때만 링크가 살아난다.
          observed면 App.tsx의 activePreviewRef로 lift → ChatSidePanel "미리보기" 탭과 공유. */}
      <PreviewRunCard
        missionId={item.missionId}
        hasScaffoldFiles={(publishEnvironment?.getScaffoldFiles?.(item)?.length ?? 0) > 0}
        serverBaseUrl={publishEnvironment?.serverBaseUrl}
        fetchImpl={publishEnvironment?.fetchImpl}
        onPreviewObserved={onPreviewObserved}
        onContextEvent={emitWorkspaceContextEvent}
        onIframeAnnotate={(point) => {
          setPendingAnnotationCoords(point);
          emitWorkspaceContextEvent("mission.preview_annotation.coords_captured", {
            xPct: point.xPct,
            yPct: point.yPct,
            ts: new Date().toISOString(),
          });
        }}
      />

      {/* H8 Coding Runner — OpenCode 스타일 코딩 run을 워크스페이스에서 직접 (mock 기본).
          변경 *제안*만 — 적용/커밋/PR은 별도 승인. repo 워크스페이스가 있을 때만 의미. */}
      <CodingRunnerCard
        missionId={item.missionId}
        repoRoot={item.workspace?.repoRootRef}
        defaultPrompt={item.goal}
        sessionId={item.missionId}
        serverBaseUrl={publishEnvironment?.serverBaseUrl}
        onHandoff={(handoff) => {
          // H8e — patch approval queue (client-side)
          patchApprovalController.enqueue({
            handoff,
            result: { testResult: handoff.testResult },
            pathPolicy: { allow: ["apps/desktop/", "packages/"] },
          });
          // Route to unified control queue — runner dispatch는 승인 전 절대 실행되지 않는다
          routeHandoffToControlQueue(handoff);
        }}
      />

      {/* H8e — Runner Patch 결재함. 위 CodingRunnerCard.onHandoff가 큐에 넣고, 사용자가
          여기서 승인/거절. 승인은 "다음 적용 단계 후보"로 상태만 표시 — apply 호출 0. */}
      <RunnerPatchApprovalPanel
        items={patchApprovalController.items}
        onApprove={(id) => patchApprovalController.approve(id)}
        onReject={(id, reason) => patchApprovalController.reject(id, reason)}
      />

      {/* Visual QA vertical — preview observed running일 때만 CTA 활성. issues_found/failed면
          "수정안 초안 만들기" + 파일별 patch preview + 적용 CTA. 자동 파일 수정/자동 PR 0.
          내부에 mount된 VisualEvidenceCard의 readiness CTA가 onNavigate를 통해 Mission Workspace
          행동(publish/fix/preview/qa)으로 라우팅된다. */}
      <VisualQaCard
        missionId={item.missionId}
        workspaceId={item.workspace?.id}
        previewUrl={item.workspace?.previewUrl}
        latestSummary={item.latestVisualQa}
        currentScaffoldFiles={publishEnvironment?.getScaffoldFiles?.(item)?.map((f) => ({ path: f.path, content: f.newContent }))}
        serverBaseUrl={publishEnvironment?.serverBaseUrl}
        fetchImpl={publishEnvironment?.fetchImpl}
        onContextEvent={emitWorkspaceContextEvent}
        onRefreshScaffold={publishEnvironment?.refreshScaffold}
        onNavigate={onNavigate}
        onStateChange={onVisualQaStateChange}
      />

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

      {/* Publish Flow 상태 요약 + "다음 할 일" CTA — 현재 세션의 github.publish.* trace 기반.
          CTA를 누르면 publishOpen=true + targetStep 으로 해당 step section에 자동 스크롤. */}
      {publishEnvironment ? (
        <PublishFlowSummary
          history={publishHistory}
          nextAction={nextPublishAction}
          onActivateNext={(step) => {
            setTargetStep(step);
            if (!publishOpen) {
              setPublishOpen(true);
              publishEnvironment.onContextEvent?.("mission.publish.opened", {
                missionId: item.missionId,
                ts: new Date().toISOString(),
                via: "next_action_cta",
                targetStep: step,
              });
            }
          }}
        />
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
          {/* 보조 텍스트(접힘 상태에서도 보임) — 사용자에게 단계별 승인임을 명시.
              scaffoldMode에 따라 정직한 추가 신호를 한 줄로 노출(추측 없음). */}
          <p
            className="mission-workspace-publish-hint"
            data-scaffold={scaffoldMode}
            data-testid="mission-workspace-publish-hint"
          >
            {scaffoldMode === "ready" ? (
              <>
                scaffold {scaffoldEval!.total}개 중 1개 자동 채움 준비됨 — 나머지는 별도 plan.
                (merge/review/label/assignee 없음)
              </>
            ) : scaffoldMode === "blocked" ? (
              <>
                scaffold {scaffoldEval!.total}개 모두 가드(binary/대용량/시크릿)에 막혀 자동 채움 없음 —
                파일 경로/내용은 직접 입력 필요. (merge/review/label/assignee 없음)
              </>
            ) : (
              <>
                브랜치 생성 · 파일 변경 · PR 생성을 단계별 승인으로 진행합니다. (merge/review/label/assignee 없음)
              </>
            )}
          </p>
          {publishOpen ? (
            <div id={`mission-publish-${item.missionId}`} className="mission-workspace-publish-body">
              <GithubPublishPanel
                key={item.missionId}
                serverBaseUrl={publishEnvironment.serverBaseUrl}
                defaultRepoFullName={publishEnvironment.defaultRepoFullName}
                initial={(publishEnvironment.resolvePrefill ?? builtinMissionPrefill)(
                  item,
                  publishEnvironment.getScaffoldFiles?.(item),
                )}
                onContextEvent={(type, payload) =>
                  // Mission 컨텍스트(missionId)를 trace event에 자동 첨부 — provenance.
                  publishEnvironment.onContextEvent?.(type, { ...payload, missionId: item.missionId })
                }
                fetchImpl={publishEnvironment.fetchImpl}
              />
              {/* W5a: Multi-file plan(client-side aggregation). publishOpen일 때만 마운트.
                   scaffold 파일이 있을 때만 자체 노출 — execute는 W5b로 별도. */}
              {(() => {
                const scaffoldFiles = publishEnvironment.getScaffoldFiles?.(item);
                if (!scaffoldFiles || scaffoldFiles.length === 0) return null;
                return (
                  <MultiFilePlanCard
                    item={item}
                    files={scaffoldFiles}
                    defaultRepoFullName={publishEnvironment.defaultRepoFullName}
                    serverBaseUrl={publishEnvironment.serverBaseUrl}
                    fetchImpl={publishEnvironment.fetchImpl}
                    onContextEvent={(type, payload) =>
                      publishEnvironment.onContextEvent?.(type, { ...payload, missionId: item.missionId })
                    }
                  />
                );
              })()}
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

const PUBLISH_STEP_LABEL: Record<"branch" | "file" | "pr", string> = {
  branch: "Branch",
  file: "File",
  pr: "PR",
};

const PUBLISH_STATUS_LABEL: Record<string, string> = {
  planned: "계획됨",
  observed: "관측 완료",
  blocked: "차단됨",
  failed: "실패",
  already_exists: "이미 존재",
  approval_required: "승인 필요",
};

function publishStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "observed":
    case "already_exists":
      return "success";
    case "planned":
    case "approval_required":
      return "primary";
    case "blocked":
    case "failed":
      return "danger";
    default:
      return "muted";
  }
}

/**
 * Mission Workspace 안의 Publish Flow 상태 한눈 요약 + "다음 할 일" CTA.
 *   - 현재 세션의 github.publish.* trace 기반(영속화 없음 — 새로고침 시 초기화, 정직 표기).
 *   - Branch / File / PR 단계 각각 latest 상태만(재시도 시 최신만 노출).
 *   - history가 비어 있고 nextAction이 'start_step branch'면 처음 진입을 안내하는 CTA를 보여준다.
 *   - history에 단계가 하나라도 있으면 상태 행을 그린다.
 *   - 추측 금지: summary 텍스트는 GithubPublishPanel.emit이 만든 짧은 한 줄을 그대로 보여준다.
 *   - 위험 액션(merge/review/label/...)은 절대 노출하지 않는다 — 단계는 항상 branch/file/pr 3개.
 */
function PublishFlowSummary({
  history,
  nextAction,
  onActivateNext,
}: {
  history?: PublishHistoryByStep;
  nextAction?: PublishNextAction;
  onActivateNext?: (step: PublishStep) => void;
}) {
  const steps: ReadonlyArray<PublishStep> = ["branch", "file", "pr"];
  const hasAny = !!history && steps.some((s) => history[s]);
  // history도 nextAction도 없으면 그릴 게 없다.
  if (!hasAny && !nextAction) return null;
  return (
    <div
      className="mission-workspace-publish-summary"
      data-testid="mission-workspace-publish-summary"
    >
      {/* 단계별 상태 행 — history가 있을 때만(빈 공간 방지). */}
      {hasAny
        ? steps.map((step) => {
            const entry = history![step];
            const StepIcon = step === "branch" ? GitBranch : step === "file" ? FileEdit : GitPullRequest;
            // 상태별 보조 아이콘 — observed면 체크, blocked/failed면 경고. 다른 상태는 무.
            const StatusIcon =
              entry && (entry.status === "observed" || entry.status === "already_exists")
                ? CheckCircle2
                : entry && (entry.status === "blocked" || entry.status === "failed")
                  ? AlertTriangle
                  : null;
            return (
              <div
                key={step}
                className="mission-workspace-row"
                data-testid={`mission-publish-row-${step}`}
                data-step={step}
                data-status={entry?.status ?? "not_started"}
              >
                <span className="mission-workspace-row-label">
                  <StepIcon size={12} /> Publish {PUBLISH_STEP_LABEL[step]}
                </span>
                <span className="mission-workspace-row-body">
                  {entry ? (
                    <>
                      {StatusIcon ? <StatusIcon size={12} aria-hidden /> : null}{" "}
                      <StatusBadge size="sm" variant={publishStatusVariant(entry.status)}>
                        {PUBLISH_STATUS_LABEL[entry.status] ?? entry.status}
                      </StatusBadge>{" "}
                      {/* observed + htmlUrl이면 GitHub로 직접 이동하는 링크, 아니면 summary 텍스트만. */}
                      {entry.htmlUrl &&
                      (entry.status === "observed" || entry.status === "already_exists") ? (
                        <a
                          href={entry.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mission-workspace-url"
                          data-testid={`mission-publish-link-${step}`}
                        >
                          {entry.summary || entry.htmlUrl}
                        </a>
                      ) : entry.summary ? (
                        <span className="mission-workspace-url">{entry.summary}</span>
                      ) : null}
                    </>
                  ) : (
                    <StatusBadge size="sm" variant="muted">
                      아직 진행 없음
                    </StatusBadge>
                  )}
                </span>
              </div>
            );
          })
        : null}
      {/* "다음 할 일" CTA — done이면 완주 표식(+ PR URL 직접 이동 링크), 아니면 step CTA. */}
      {nextAction ? (
        nextAction.kind === "done" ? (
          history?.pr?.htmlUrl ? (
            <a
              href={history.pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mission-workspace-publish-next mission-workspace-publish-next--done"
              data-testid="mission-workspace-publish-next"
              data-kind="done"
            >
              <CheckCircle2 size={13} /> {nextAction.label} — PR 열기
            </a>
          ) : (
            <div
              className="mission-workspace-publish-next mission-workspace-publish-next--done"
              data-testid="mission-workspace-publish-next"
              data-kind="done"
            >
              <CheckCircle2 size={13} /> {nextAction.label}
            </div>
          )
        ) : (
          <button
            type="button"
            className="mission-workspace-publish-next-cta"
            data-testid="mission-workspace-publish-next"
            data-kind={nextAction.kind}
            data-step={nextAction.step}
            onClick={() => onActivateNext?.(nextAction.step)}
          >
            <span>다음: {nextAction.label}</span>
            {nextAction.kind === "retry_step" ? (
              <span className="mission-workspace-publish-next-reason"> — {nextAction.reason}</span>
            ) : null}
            <ArrowRight size={13} />
          </button>
        )
      ) : null}
    </div>
  );
}

// OSS-H10 — controller 미제공 시 사용하는 noop singleton. 같은 reference를 돌려줘
// useProjectRecordSync 의존성 비교가 안정적이게 유지한다. 부수효과 0.
const noopProjectRecordController: ProjectRecordController = {
  records: [],
  find: () => undefined,
  ensureRecord: () => ({
    missionId: "",
    title: "",
    scaffold: "unknown",
    editTimeline: { totalEvents: 0, hasRestorablePatch: false },
    createdAt: "",
    updatedAt: "",
  }),
  recordPreview: () => {},
  recordVisualQa: () => {},
  recordScaffold: () => {},
  recordEditTimeline: () => {},
  recordPublishStatus: () => {},
  remove: () => {},
};
