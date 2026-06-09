import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { seededAgentProfiles } from "../../seeds/agents";
import { agentPrimaryDisplayName } from "../../lib/agentDisplay";
import { getAgentToolBadgeLabels, getAgentToolProfileSummary } from "../../lib/agentToolProfiles";
import { AgentHermesControlCard } from "./AgentHermesControlCard";

describe("AgentHermesControlCard", () => {
  it("선택 에이전트의 대화방, 모델, 기억, 스킬, SOUL/AGENTS 관리入口를 한 카드에 묶는다", () => {
    const html = renderToStaticMarkup(
      <AgentHermesControlCard
        continuityDetail="마키마 전용 방에서 이전 대화와 기억을 이어받습니다."
        displayName="마키마"
        memoryQualityLabel="장기 기억 품질 양호"
        modelLabel="대화 모델 · MiMo V2.5 Pro"
        nextPrompt="지금 승인해야 할 일을 정리해줘"
        personaAgentsMdApplied
        personaSoulApplied
        toolBoundaryLabel="승인 필요 1개"
        toolGroupLabel="지휘 도구"
        toolLabels={["작업 대기열", "승인 확인", "터미널 계획"]}
        workStatusLabel="대기"
      />,
    );

    expect(html).toContain("Hermes 에이전트");
    expect(html).toContain("마키마 운영 카드");
    expect(html).toContain("대화방");
    expect(html).toContain("모델");
    expect(html).toContain("기억");
    expect(html).toContain("스킬");
    expect(html).toContain("SOUL");
    expect(html).toContain("AGENTS");
    expect(html).toContain("초안 적용");
    expect(html).not.toContain("Orchestrator");
  });

  it("시드된 모든 에이전트가 각자 역할 도구와 기억 품질을 가진 Hermes 카드로 렌더링된다", () => {
    expect(seededAgentProfiles.length).toBeGreaterThanOrEqual(17);

    for (const agent of seededAgentProfiles) {
      const summary = getAgentToolProfileSummary(agent.role);
      const tools = getAgentToolBadgeLabels(agent.role).slice(0, 3);
      const displayName = agentPrimaryDisplayName(agent);
      const html = renderToStaticMarkup(
        <AgentHermesControlCard
          continuityDetail={`${displayName} 전용 채널과 기억을 사용합니다.`}
          displayName={displayName}
          memoryQualityLabel="장기 기억 품질 양호"
          modelLabel={`대화 모델 · ${agent.modelId ?? "기본 모델"}`}
          personaAgentsMdApplied
          personaSoulApplied
          toolBoundaryLabel={summary.runtime.boundaryLabel}
          toolGroupLabel={summary.label}
          toolLabels={tools}
          workStatusLabel="대기"
        />,
      );

      expect(html, agent.id).toContain(`${displayName} 운영 카드`);
      expect(html, agent.id).toContain(summary.label);
      expect(html, agent.id).toContain("장기 기억 품질 양호");
      expect(html, agent.id).toContain("대화방");
      expect(html, agent.id).toContain("SOUL 적용");
      expect(html, agent.id).toContain("AGENTS 적용");
    }
  });
});
