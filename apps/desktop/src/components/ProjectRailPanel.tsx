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
  const visibleSteps = agentRun.steps.slice(0, 4);
  const visibleFiles = packet.filesToInspect.slice(0, 3);
  const visibleChecks = packet.verificationPlan.slice(0, 3);
  const visibleBranches = branchExperiments.slice(0, 3);
  const visibleInsights = insightFindings.slice(0, 4);
  const visibleMetaSignals = metaOnboardingSignals.slice(0, 3);

  return (
    <section className="mini-panel rail-panel project-rail-panel">
      <header>
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
      <div className="rail-hero-card">
        <span>active session</span>
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
      <div className="rail-card-list">
        {visibleSteps.map((step) => (
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
        ))}
      </div>
      <div className="rail-card-list compact">
        {visibleBranches.map((branch) => (
          <article key={branch.id}>
            <strong>{branch.title}</strong>
            <span>{branchStatusLabel(branch.status)} / {branch.agentName}</span>
          </article>
        ))}
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
      <div className="rail-insight-list">
        {visibleInsights.map((finding) => (
          <article className={finding.status} key={finding.id}>
            <strong>{insightCategoryLabel(finding.category)}</strong>
            <span>{finding.label}</span>
          </article>
        ))}
      </div>
      <div className="meta-onboarding-box">
        <button className="rail-icon-button" onClick={onRunMetaOnboarding} title="Meta Agent Onboarding" type="button">
          <Bot size={13} />
        </button>
        <div>
          <strong>Meta Agent Onboarding</strong>
          {visibleMetaSignals.map((signal) => (
            <span className={signal.status} key={signal.id}>
              {signal.label}: {signal.suggestion}
            </span>
          ))}
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
