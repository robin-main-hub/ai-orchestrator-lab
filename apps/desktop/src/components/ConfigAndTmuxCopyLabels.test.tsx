import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodingPacket, ConversationMessage } from "@ai-orchestrator/protocol";
import { ConfigLibraryPanel } from "./ConfigLibraryPanel";
import { defaultTmuxCommandForRole, tmuxBoardCopyLabels } from "./TmuxSwarmBoard";
import type { AgentConfigFile, AgentProfilePack } from "../types";

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
    updatedAt: "2026-06-06T00:00:00.000Z",
    version: 1,
  },
  {
    body: "# Memory",
    id: "config_memory",
    kind: "memory_policy",
    label: "마키마 기억 정책",
    linkedAgentIds: ["agent_orchestrator"],
    path: "agents/makima/memory.md",
    scope: "agent",
    tags: ["memory"],
    updatedAt: "2026-06-06T00:00:00.000Z",
    version: 1,
  },
  {
    body: "# Prompt",
    id: "config_prompt",
    kind: "prompt_template",
    label: "마키마 프롬프트",
    linkedAgentIds: ["agent_orchestrator"],
    path: "agents/makima/prompt.md",
    scope: "agent",
    tags: ["prompt"],
    updatedAt: "2026-06-06T00:00:00.000Z",
    version: 1,
  },
];

const profilePacks: AgentProfilePack[] = [
  {
    agentRole: "orchestrator",
    configFileIds: ["config_soul", "config_memory", "config_prompt"],
    description: "마키마 기본 팩",
    id: "pack_orchestrator",
    label: "마키마 팩",
    tags: ["orchestrator"],
  },
];

const packet: CodingPacket = {
  constraints: ["한국어 표면 유지"],
  context: ["tmux 워커 명령"],
  decisions: ["명령 초안은 한국어 의도로 보인다"],
  filesToInspect: ["apps/desktop/src/components/TmuxSwarmBoard.tsx"],
  goal: "Tmux 명령 라벨 한국어화",
  implementationPlan: ["라벨 정리"],
  rejectedOptions: ["영어 초안 유지"],
  reviewerNotes: ["사용자 화면 기준"],
  verificationPlan: ["typecheck", "test"],
};

const messages: ConversationMessage[] = [
  {
    content: "작업자에게 일을 나눠줘",
    createdAt: "2026-06-06T00:00:00.000Z",
    id: "message_1",
    role: "user",
    sessionId: "session_desktop_001",
  },
];

describe("config library and tmux copy labels", () => {
  it("uses Korean labels for config library tabs and accessibility name", () => {
    const html = renderToStaticMarkup(
      <ConfigLibraryPanel
        configFiles={configFiles}
        onCreateConfigFile={vi.fn()}
        onDuplicateConfigFile={vi.fn()}
        onImportConfigFile={vi.fn()}
        onSaveConfigFile={vi.fn()}
        onSelectConfigFile={vi.fn()}
        onUpdateConfigFile={vi.fn()}
        profilePacks={profilePacks}
        selectedConfigFileId="config_memory"
      />,
    );

    expect(html).toContain("기억 정책");
    expect(html).toContain("프롬프트 템플릿");
    expect(html).toContain("에이전트 설정파일 라이브러리");
    expect(html).toContain("프로필 팩");
    expect(html).toContain("지휘자 / 설정파일 3개");
    expect(html).not.toContain("Memory Policy");
    expect(html).not.toContain("Prompt Template");
    expect(html).not.toContain("agent config file library");
    expect(html).not.toContain("Profile Packs");
    expect(html).not.toContain("orchestrator / 3 files");
  });

  it("uses Korean labels for tmux fallback approvals and default command drafts", () => {
    const labels = Object.values(tmuxBoardCopyLabels).join("\n");
    const commands = [
      defaultTmuxCommandForRole("discussion"),
      defaultTmuxCommandForRole("orchestrator"),
      defaultTmuxCommandForRole("code"),
      defaultTmuxCommandForRole("architect"),
      defaultTmuxCommandForRole("frontend"),
      defaultTmuxCommandForRole("backend"),
      defaultTmuxCommandForRole("research"),
      defaultTmuxCommandForRole("memory"),
    ].join("\n");

    expect(labels).toContain("승인 대기");
    expect(labels).toContain("승인 대기열");
    expect(commands).toContain("현재 요청을 역할별 작업으로 나눠라");
    expect(commands).toContain("현재 코딩 패킷을 검토하고 구현 단계를 제안하라");
    expect(commands).toContain("Memento에 남길 지속 결정");
    expect(labels + commands).not.toContain("approval 대기");
    expect(labels + commands).not.toContain("Control Queue");
    expect(labels + commands).not.toContain("Discuss requirement");
    expect(labels + commands).not.toContain("Break down the current request");
    expect(labels + commands).not.toContain("Inspect the current Coding Packet");
  });
});
