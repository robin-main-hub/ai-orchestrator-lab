import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentPersonaSettings, WorkbenchAgent } from "../types";
import { AgentConfigDrawer } from "./AgentConfigDrawer";

const agent: WorkbenchAgent = {
  configSource: "internal",
  enabled: true,
  id: "agent_orchestrator",
  kind: "virtual",
  name: "마키마",
  permissionLevel: "read_only",
  role: "orchestrator",
  soulMode: "retrieved",
};

const persona: AgentPersonaSettings = {
  agentsInstruction: "한국어로 보고한다.",
  agentsMdPath: "AGENTS.md",
  creativityLevel: "balanced",
  forbiddenStyle: "차가운 안내문",
  soulExampleDialogue: "사용자: 안녕",
  soulMdPath: "SOUL.md",
  soulSummary: "침착한 지휘자",
  voicePreset: "direct",
};

function renderDrawer(activeTab: Parameters<typeof AgentConfigDrawer>[0]["activeTab"]) {
  return renderToStaticMarkup(
    <AgentConfigDrawer
      activeTab={activeTab}
      agent={agent}
      configFiles={[]}
      memoryMode="검색된 기억"
      onClose={vi.fn()}
      onUpdateAgentConfig={vi.fn()}
      onUpdatePersona={vi.fn()}
      persona={persona}
    />,
  );
}

describe("AgentConfigDrawer", () => {
  it("uses Korean labels for profile and injection controls", () => {
    expect(renderDrawer("profile")).toContain("에이전트 프로필 설정");
    expect(renderDrawer("profile")).toContain("프로바이더");
    const injectionHtml = renderDrawer("injection");
    expect(injectionHtml).toContain("설정 소스");
    expect(injectionHtml).toContain("소울 모드");
    expect(injectionHtml).toContain("검색된 기억");
    expect(injectionHtml).not.toContain("Config Source");
    expect(injectionHtml).not.toContain("Soul Mode");
  });

  it("uses Korean keys in the prompt preview", () => {
    const html = renderDrawer("preview");
    expect(html).toContain("소스:");
    expect(html).toContain("소울 모드:");
    expect(html).toContain("대체 소울:");
    expect(html).toContain("주입 안 됨");
    expect(html).not.toContain("source:");
    expect(html).not.toContain("not injected");
  });

  it("shows save and load controls on the SOUL tab", () => {
    const html = renderDrawer("soul");
    expect(html).toContain("SOUL 저장본");
    expect(html).toContain("현재 Soul 저장");
    expect(html).toContain("저장본 선택");
    expect(html).toContain("불러와 적용");
  });
});
