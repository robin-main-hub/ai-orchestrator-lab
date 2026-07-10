// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ConfigLibraryPanel } from "./ConfigLibraryPanel";
import type { AgentConfigFile, AgentProfilePack, WorkbenchAgent } from "../types";

afterEach(() => cleanup());

const orchestrator: WorkbenchAgent = {
  id: "agent_orchestrator",
  name: "Orchestrator",
  kind: "virtual",
  role: "orchestrator",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
};

const architect: WorkbenchAgent = {
  id: "agent_architect",
  name: "Architect",
  kind: "virtual",
  role: "architect",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
};

const agents = [orchestrator, architect];

// soul 1건만 — skill/agents/기억정책/프롬프트 템플릿은 비어 있는 픽스처.
const configFiles: AgentConfigFile[] = [
  {
    body: "# SOUL",
    id: "config_soul",
    kind: "soul",
    label: "마키마 SOUL",
    linkedAgentIds: ["agent_orchestrator"],
    path: "agents/makima/SOUL.md",
    scope: "agent",
    tags: ["identity"],
    updatedAt: "2026-07-10T00:00:00.000Z",
    version: 3,
  },
];

const profilePacks: AgentProfilePack[] = [
  {
    agentRole: "orchestrator",
    configFileIds: ["config_soul"],
    description: "마키마 기본 팩",
    id: "pack_orchestrator",
    label: "마키마 팩",
    tags: ["orchestrator"],
  },
];

function renderPanel(overrides: Partial<Parameters<typeof ConfigLibraryPanel>[0]> = {}) {
  const handlers = {
    onCreateConfigFile: vi.fn(),
    onDuplicateConfigFile: vi.fn(),
    onImportConfigFile: vi.fn(),
    onSaveConfigFile: vi.fn(),
    onSelectConfigFile: vi.fn(),
    onUpdateConfigFile: vi.fn(),
  };
  const utils = render(
    <ConfigLibraryPanel
      agents={agents}
      configFiles={configFiles}
      profilePacks={profilePacks}
      selectedConfigFileId="config_soul"
      {...handlers}
      {...overrides}
    />,
  );
  return { ...utils, handlers };
}

describe("ConfigLibraryPanel — CFG-D/E semantics", () => {
  it("empty kind tab navigates only: no create side effect, empty state CTA instead", () => {
    const { handlers, getByText, container } = renderPanel();

    // SKILL.md 탭은 비어 있다 — 클릭해도 생성 부수효과가 없어야 한다.
    fireEvent.click(getByText("SKILL.md"));
    expect(handlers.onCreateConfigFile).not.toHaveBeenCalled();
    expect(handlers.onSelectConfigFile).not.toHaveBeenCalled();

    // 단일 중앙 빈 상태 + CTA.
    expect(container.textContent).toContain("SKILL.md 파일이 없습니다");
    const cta = getByText(/새 SKILL.md 만들기/);
    fireEvent.click(cta);
    expect(handlers.onCreateConfigFile).toHaveBeenCalledTimes(1);
    expect(handlers.onCreateConfigFile).toHaveBeenCalledWith("skill");
  });

  it("checkpoint button reports success feedback (role=status) and calls save once", () => {
    const { handlers, getByTitle, container } = renderPanel();

    fireEvent.click(getByTitle("체크포인트 기록"));
    expect(handlers.onSaveConfigFile).toHaveBeenCalledTimes(1);
    expect(handlers.onSaveConfigFile).toHaveBeenCalledWith("config_soul");

    const notice = container.querySelector('[role="status"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain("체크포인트 기록됨");
    expect(notice!.textContent).toContain("v4");
  });

  it("version is read-only mono display (no manual version input)", () => {
    const { container } = renderPanel();
    expect(container.querySelector('input[type="number"]')).toBeNull();
    expect(container.querySelector(".config-v2__version")!.textContent).toBe("v3");
  });

  it("pack apply links the picked agent to every pack file via linkedAgentIds", () => {
    const { handlers, getByTitle, getByText } = renderPanel();

    fireEvent.click(getByTitle("팩 적용: 마키마 팩"));
    // architect(오시노 시노부) 선택 → 팩의 config_soul 에 착용 추가.
    fireEvent.click(getByText("오시노 시노부"));

    expect(handlers.onUpdateConfigFile).toHaveBeenCalledWith("config_soul", {
      linkedAgentIds: ["agent_orchestrator", "agent_architect"],
    });
  });

  it("renders the activity feed with a persona signature derived from configFiles only", () => {
    const { container } = renderPanel();
    const feed = container.querySelector(".config-v2__activity")!;
    expect(feed.textContent).toContain("최근 활동");
    expect(feed.textContent).toContain("마키마 SOUL");
    expect(feed.textContent).toContain("v3");
    expect(feed.textContent).toContain("갱신됨");
    // 서명 아바타는 실제 초상 img.
    expect(feed.querySelectorAll("img.aol-persona-avatar").length).toBeGreaterThan(0);
  });
});
