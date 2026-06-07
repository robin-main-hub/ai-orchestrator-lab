import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OperatorCockpitMemoryRecall, OperatorCockpitProviderRouting } from "@ai-orchestrator/protocol";
import { WorkerFleetCard } from "./WorkerFleetCard";

const memory: OperatorCockpitMemoryRecall = {
  contextReasons: ["대화 기억 후보", "최근 승인 기록"],
  contradictionWarnings: [],
  dgxMirrorHealth: "healthy",
  macBookAuthorityEnabled: true,
};

const routing: OperatorCockpitProviderRouting = {
  costBadge: "medium",
  fallbackStatus: "available",
  providerLabel: "provider_mimo_token_openai",
  selectedModelId: "mimo-v2.5-pro",
  speedBadge: "fast",
  trustBadge: "limited",
};

describe("WorkerFleetCard", () => {
  it("선택 워커의 역할, 스킬, 기억, 모델, 최근 상태를 읽기 전용 상세로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <WorkerFleetCard
        fleet={[
          {
            branch: "feature/operator-detail",
            role: "orchestrator",
            status: "working",
            statusRingColor: "green",
            workerId: "agent_orchestrator",
            worktree: "/repo/worktrees/operator-detail",
          },
        ]}
        memory={memory}
        routing={routing}
      />,
    );

    expect(html).toContain("선택 워커 상세");
    expect(html).toContain("마키마");
    expect(html).toContain("작업 우선순위");
    expect(html).toContain("지휘 도구");
    expect(html).toContain("관제 기억");
    expect(html).toContain("현재 대화 모델");
    expect(html).toContain("MacBook 기준 기억");
    expect(html).toContain("MiMo V2.5 Pro");
    expect(html).toContain("최근 상태");
    expect(html).toContain("작업공간 operator-detail");
    expect(html).not.toContain("/repo/worktrees");
    expect(html).not.toContain("mimo-v2.5-pro");
    expect(html).not.toContain("provider_mimo_token_openai");
  });
});
