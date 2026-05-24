import { Bot, LayoutDashboard, Play, Send } from "lucide-react";
import type { BranchExperiment, CodingPacket, InsightFinding, ReviewMode } from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "../runtime/stage4Runtime";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import { branchStatusLabel, insightCategoryLabel, reviewModeLabel } from "../lib/uiLabels";
import type { MetaOnboardingSignal, WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

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
  const auditItems: WindowAuditItem[] = [
    {
      id: "packet",
      label: "Coding Packet",
      status: packet.goal ? "ready" : "partial",
      detail: "대화/토론 결과를 goal, decisions, constraints, verification으로 구조화합니다.",
    },
    {
      id: "files",
      label: "파일 후보",
      status: packet.filesToInspect.length > 0 ? "ready" : "partial",
      detail: packet.filesToInspect.length > 0 ? `${packet.filesToInspect.length}개 inspect 후보가 있습니다.` : "아직 inspect 후보가 없습니다.",
    },
    {
      id: "run",
      label: "실행 기록",
      status: agentRun.steps.some((step) => step.status === "blocked") ? "blocked" : "ready",
      detail: "실행은 바로 터미널로 보내지 않고 run intent와 권한 상태를 먼저 남깁니다.",
    },
    {
      id: "verify",
      label: "검증 계획",
      status: reviewMode === "deep" ? "ready" : "partial",
      detail: `${reviewModeLabel(reviewMode)} 리뷰와 4D rubric/invariant checks를 함께 표시합니다.`,
    },
    {
      id: "branch-adopt",
      label: "Branch/Adopt",
      status: branchExperiments.some((branch) => branch.status === "adopted") ? "ready" : "partial",
      detail: "shadow conversation은 요약만 메인 세션에 채택하도록 분리합니다.",
    },
    {
      id: "meta-onboarding",
      label: "Meta Onboarding",
      status: metaOnboardingSignals.every((signal) => signal.status === "ready") ? "ready" : "partial",
      detail: "프로젝트 스택과 현재 provider/agent를 보고 빠진 역할을 추천합니다.",
    },
  ];

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
          <strong>{agentRun.status}</strong>
        </div>
      </div>
      <div className="rail-card-list">
        {visibleSteps.map((step) => (
          <article key={step.id}>
            <strong>{step.title}</strong>
            <span>{step.status} / {step.permissionState}</span>
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
      <WindowChecklist items={auditItems} title="프로젝트 창 점검" />
    </section>
  );
}
