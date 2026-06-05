import { useEffect, useState } from "react";
import { Bot, LayoutDashboard, Play, Send } from "lucide-react";
import type { BranchExperiment, CodingPacket, InsightFinding, ReviewMode } from "@ai-orchestrator/protocol";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import type { Stage4AgentRun } from "../runtime/stage4Runtime";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import { branchStatusLabel, insightCategoryLabel, reviewModeLabel } from "../lib/uiLabels";
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
    <section className="mini-panel rail-panel project-rail-panel flex flex-col h-full overflow-hidden">
      <header className="mb-2 shrink-0">
        <LayoutDashboard size={16} />
        <span>Project</span>
        <div className="rail-action-row">
          <button className="rail-icon-button" onClick={onCreateCodingPacket} title="Coding Packet 생성" type="button">
            <Send size={13} />
          </button>
          <button className="rail-icon-button" onClick={onCreateAgentRun} title="Agent Run 준비" type="button">
            <Play size={13} />
          </button>
        </div>
      </header>

      {/* Mini Tabs Header */}
      <div className="rail-tabs mb-2 shrink-0">
        <button
          className={activeTab === "overview" ? "active" : ""}
          onClick={() => setActiveTab("overview")}
          type="button"
        >
          Overview
        </button>
        <button
          className={activeTab === "run" ? "active" : ""}
          onClick={() => setActiveTab("run")}
          type="button"
        >
          Run {isRunning && <span className="tab-status-dot warning" />}
        </button>
        <button
          className={activeTab === "insights" ? "active" : ""}
          onClick={() => setActiveTab("insights")}
          type="button"
        >
          Insights {insightCount > 0 && <span className="tab-count-badge">{displayInsightCount}</span>}
        </button>
      </div>

      {/* Scrollable Tab Content Area */}
      <div className="rail-tab-content flex-1 overflow-y-auto pr-0.5 space-y-2">
        {activeTab === "overview" && (
          <>
            <div className="rail-hero-card">
              <span>활성 세션</span>
              <strong>{sessionId}</strong>
              <p>{packet.goal}</p>
            </div>
            <div className="rail-stat-list">
              <div>
                <span>events</span>
                <strong>{eventCount}</strong>
              </div>
              <div>
                <span>decisions</span>
                <strong>{packet.decisions.length}</strong>
              </div>
              <div>
                <span>memory recall</span>
                <strong>{memoryInspector.trace.results.length}</strong>
              </div>
              <div>
                <span>run status</span>
                <strong>
                  <StatusBadge size="sm" variant={railRuntimeBadgeVariant(agentRun.status)}>
                    {agentRun.status}
                  </StatusBadge>
                </strong>
              </div>
            </div>
            <div className="rail-split-list">
              <section>
                <strong>inspect</strong>
                {visibleFiles.length > 0 ? visibleFiles.map((file) => <span key={file}>{file}</span>) : <span>대상 없음</span>}
              </section>
              <section>
                <strong>verify</strong>
                {visibleChecks.length > 0 ? visibleChecks.map((check) => <span key={check}>{check}</span>) : <span>대상 없음</span>}
              </section>
            </div>
          </>
        )}

        {activeTab === "run" && (
          <>
            <div className="rail-card-list">
              {visibleSteps.length > 0 ? (
                visibleSteps.map((step) => (
                  <article key={step.id}>
                    <strong>{step.title}</strong>
                    <span>
                      <StatusBadge size="sm" variant={railRuntimeBadgeVariant(step.status)}>
                        {step.status}
                      </StatusBadge>{" "}
                      /{" "}
                      <StatusBadge size="sm" variant={railApprovalBadgeVariant(step.permissionState)}>
                        {step.permissionState}
                      </StatusBadge>
                    </span>
                    <p>{step.summary}</p>
                  </article>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-muted-foreground">에이전트 실행 단계가 없습니다.</div>
              )}
            </div>
            <div className="rail-card-list compact">
              {visibleBranches.map((branch) => (
                <article key={branch.id}>
                  <strong>{branch.title}</strong>
                  <span>{branchStatusLabel(branch.status)} / {branch.agentName}</span>
                </article>
              ))}
            </div>
          </>
        )}

        {activeTab === "insights" && (
          <div className="rail-insight-list">
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

      {/* Meta Agent Onboarding Box - Statically fixed at the bottom of the panel per PM guidelines */}
      <div className="meta-onboarding-box border-t border-border/40 pt-2 mt-2 shrink-0">
        <button className="rail-icon-button" onClick={onRunMetaOnboarding} title="Meta Agent Onboarding" type="button">
          <Bot size={13} />
        </button>
        <div>
          <strong>Meta Agent Onboarding</strong>
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
