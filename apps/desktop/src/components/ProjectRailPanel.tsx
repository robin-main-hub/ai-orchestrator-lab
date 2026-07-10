import { useEffect, useState } from "react";
import { Bot, LayoutDashboard, Play, Send } from "lucide-react";
import type { BranchExperiment, CodingPacket, InsightFinding, ReviewMode } from "@ai-orchestrator/protocol";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import type { Stage4AgentRun } from "../runtime/stage4Runtime";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import { branchAgentNameLabel, branchStatusLabel, insightCategoryLabel, reviewModeLabel } from "../lib/uiLabels";
import type { MetaOnboardingSignal } from "../types";

export function ProjectRailPanel({
  agentRun,
  branchExperiments,
  eventCount,
  insightFindings,
  metaOnboardingSignals,
  memoryInspector,
  onCreateAgentRun,
  onCreateCodingPacket,
  onRunMetaOnboarding,
  packet,
  reviewMode,
  sessionId,
}: {
  agentRun: Stage4AgentRun;
  branchExperiments: BranchExperiment[];
  eventCount: number;
  insightFindings: InsightFinding[];
  metaOnboardingSignals: MetaOnboardingSignal[];
  memoryInspector: Stage6MemoryInspector;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onRunMetaOnboarding: () => void;
  packet: CodingPacket;
  reviewMode: ReviewMode;
  sessionId: string;
}) {
  // Persistence key: session-based tab state
  const storageKey = `ai-orchestrator:rail-tab:${sessionId}`;
  
  const [activeTab, setActiveTabState] = useState<"overview" | "run" | "insights">(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "overview" || saved === "run" || saved === "insights") {
        return saved;
      }
    } catch (e) {
      console.warn("로컬 스토리지 로드 실패:", e);
    }
    return "overview";
  });

  // Sync tab state when switching sessions
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ai-orchestrator:rail-tab:${sessionId}`);
      if (saved === "overview" || saved === "run" || saved === "insights") {
        setActiveTabState(saved);
      } else {
        setActiveTabState("overview");
      }
    } catch (e) {
      setActiveTabState("overview");
    }
  }, [sessionId]);

  const setActiveTab = (tab: "overview" | "run" | "insights") => {
    setActiveTabState(tab);
    try {
      localStorage.setItem(storageKey, tab);
    } catch (e) {
      console.warn("로컬 스토리지 저장 실패:", e);
    }
  };

  const visibleSteps = agentRun.steps.slice(0, 4);
  const visibleFiles = packet.filesToInspect.slice(0, 3);
  const visibleChecks = packet.verificationPlan.slice(0, 3);
  const visibleBranches = branchExperiments.slice(0, 3);
  const visibleInsights = insightFindings.slice(0, 4);
  const visibleMetaSignals = metaOnboardingSignals.slice(0, 3);

  const isRunning = agentRun.status === "planned" || agentRun.status === "ready_for_approval";
  const insightCount = insightFindings.length;
  // Cap the insight count badge text to 9+ per PM guidelines
  const displayInsightCount = insightCount > 9 ? "9+" : String(insightCount);

  return (
    <section className="mgmt-mini-panel mgmt-panel project-rail-panel flex flex-col h-full overflow-hidden">
      <header className="mb-2 shrink-0">
        <LayoutDashboard size={16} />
        <span>프로젝트</span>
        <div className="mgmt-action-row">
          <button className="mgmt-icon-button" onClick={onCreateCodingPacket} aria-label="코딩 패킷 생성" title="코딩 패킷 생성" type="button">
            <Send size={13} />
          </button>
          <button className="mgmt-icon-button" onClick={onCreateAgentRun} aria-label="에이전트 실행 준비" title="에이전트 실행 준비" type="button">
            <Play size={13} />
          </button>
        </div>
      </header>

      {/* Mini Tabs Header */}
      <div className="mgmt-tabs mb-2 shrink-0">
        <button
          className={activeTab === "overview" ? "active" : ""}
          onClick={() => setActiveTab("overview")}
          type="button"
        >
          개요
        </button>
        <button
          className={activeTab === "run" ? "active" : ""}
          onClick={() => setActiveTab("run")}
          type="button"
        >
          실행 {isRunning && <span className="mgmt-tab-status-dot warning" />}
        </button>
        <button
          className={activeTab === "insights" ? "active" : ""}
          onClick={() => setActiveTab("insights")}
          type="button"
        >
          인사이트 {insightCount > 0 && <span className="mgmt-tab-count-badge">{displayInsightCount}</span>}
        </button>
      </div>

      {/* Scrollable Tab Content Area */}
      <div className="mgmt-tab-content flex-1 overflow-y-auto pr-0.5 space-y-2">
        {activeTab === "overview" && (
          <>
            <div className="mgmt-hero-card">
              <span>활성 세션</span>
              <strong>{sessionId}</strong>
              <p>{packet.goal}</p>
            </div>
            <div className="mgmt-stat-list">
              <div>
                <span>이벤트</span>
                <strong>{eventCount}</strong>
              </div>
              <div>
                <span>결정</span>
                <strong>{packet.decisions.length}</strong>
              </div>
              <div>
                <span>기억 조회</span>
                <strong>{memoryInspector.trace.results.length}</strong>
              </div>
              <div>
                <span>실행 상태</span>
                <strong>
                  <StatusBadge size="sm" variant={railRuntimeBadgeVariant(agentRun.status)}>
                    {railRuntimeStatusLabel(agentRun.status)}
                  </StatusBadge>
                </strong>
              </div>
            </div>
            <div className="mgmt-split-list">
              <section>
                <strong>검토 파일</strong>
                {visibleFiles.length > 0 ? visibleFiles.map((file) => <span key={file}>{file}</span>) : <span>대상 없음</span>}
              </section>
              <section>
                <strong>검증</strong>
                {visibleChecks.length > 0 ? visibleChecks.map((check) => <span key={check}>{check}</span>) : <span>대상 없음</span>}
              </section>
            </div>
          </>
        )}

        {activeTab === "run" && (
          <>
            <div className="mgmt-card-list">
              {visibleSteps.length > 0 ? (
                visibleSteps.map((step) => (
                  <article key={step.id}>
                    <strong>{step.title}</strong>
                    <span>
                      <StatusBadge size="sm" variant={railRuntimeBadgeVariant(step.status)}>
                        {railRuntimeStatusLabel(step.status)}
                      </StatusBadge>{" "}
                      /{" "}
                      <StatusBadge size="sm" variant={railApprovalBadgeVariant(step.permissionState)}>
                        {railApprovalStateLabel(step.permissionState)}
                      </StatusBadge>
                    </span>
                    <p>{step.summary}</p>
                  </article>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-muted-foreground">에이전트 실행 단계가 없습니다.</div>
              )}
            </div>
            <div className="mgmt-card-list compact">
              {visibleBranches.map((branch) => (
                <article key={branch.id}>
                  <strong>{branch.title}</strong>
                  <span>
                    {branchStatusLabel(branch.status)} / {branchAgentNameLabel(branch.agentName)}
                  </span>
                </article>
              ))}
            </div>
          </>
        )}

        {activeTab === "insights" && (
          <div className="mgmt-insight-list">
            {visibleInsights.length > 0 ? (
              visibleInsights.map((finding) => (
                <article className={finding.status} key={finding.id}>
                  <strong>{insightCategoryLabel(finding.category)}</strong>
                  <span>{finding.label}</span>
                </article>
              ))
            ) : (
              <div className="col-span-2 text-center py-4 text-xs text-muted-foreground">감지된 인사이트가 없습니다.</div>
            )}
          </div>
        )}
      </div>

      {/* 메타 에이전트 온보딩 박스: PM 지침에 따라 패널 하단에 고정 */}
      <div className="meta-onboarding-box border-t border-border/40 pt-2 mt-2 shrink-0">
        <button className="mgmt-icon-button" onClick={onRunMetaOnboarding} aria-label="메타 에이전트 온보딩" title="메타 에이전트 온보딩" type="button">
          <Bot size={13} />
        </button>
        <div>
          <strong>메타 에이전트 온보딩</strong>
          {visibleMetaSignals.length > 0 ? (
            visibleMetaSignals.map((signal) => (
              <span className={signal.status} key={signal.id}>
                {signal.label}: {signal.suggestion}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">대기 중인 온보딩 신호가 없습니다.</span>
          )}
        </div>
      </div>
    </section>
  );
}

function railRuntimeBadgeVariant(status: string): StatusBadgeVariant {
  if (status === "completed" || status === "ready" || status === "ready_for_approval") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  if (status === "running" || status === "planned") return "warning";
  return "muted";
}

function railApprovalBadgeVariant(status: string): StatusBadgeVariant {
  if (status === "approved") return "success";
  if (status === "required") return "warning";
  if (status === "rejected" || status === "expired") return "danger";
  return "muted";
}

function railRuntimeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    blocked: "차단",
    completed: "완료",
    failed: "실패",
    planned: "계획됨",
    ready: "준비됨",
    ready_for_approval: "승인 대기",
    running: "실행 중",
  };
  return labels[status] ?? status;
}

function railApprovalStateLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: "승인됨",
    expired: "만료됨",
    rejected: "거부됨",
    required: "승인 필요",
  };
  return labels[status] ?? status;
}
