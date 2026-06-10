import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import { buildForkBrief, forkMissionFromConversation, forkScopeFromMentions } from "./conversationFork";

function msg(role: ConversationMessage["role"], content: string): ConversationMessage {
  return { id: `m_${Math.random()}`, role, content, createdAt: "2026-06-11T00:00:00Z" } as ConversationMessage;
}

describe("buildForkBrief", () => {
  it("드래프트 우선, 없으면 마지막 사용자 메시지로 task", () => {
    const messages = [msg("user", "첫 요청"), msg("assistant", "답"), msg("user", "마지막 요청 내용")];
    expect(buildForkBrief({ messages }).task).toBe("마지막 요청 내용");
    expect(buildForkBrief({ messages, draft: "드래프트 작업" }).task).toBe("드래프트 작업");
  });

  it("@멘션 수집 (드래프트+최근 메시지, 중복 제거)", () => {
    const messages = [msg("user", "@apps/desktop/src/App.tsx 를 봐"), msg("assistant", "@docs/45.md 참고")];
    const brief = buildForkBrief({ messages, draft: "@apps/desktop/src/App.tsx 다시" });
    expect(brief.mentions).toContain("apps/desktop/src/App.tsx");
    expect(brief.mentions).toContain("docs/45.md");
    expect(brief.mentions.filter((m) => m === "apps/desktop/src/App.tsx")).toHaveLength(1);
  });

  it("요약은 마지막 6턴을 화자: 로", () => {
    const brief = buildForkBrief({ messages: [msg("user", "안녕"), msg("assistant", "네")] });
    expect(brief.summary).toContain("사용자: 안녕");
    expect(brief.summary).toContain("에이전트: 네");
  });
});

describe("forkScopeFromMentions", () => {
  it("멘션 디렉터리를 glob 범위로, 없으면 기본", () => {
    expect(forkScopeFromMentions(["apps/desktop/src/App.tsx"])).toEqual(["apps/desktop/src/**"]);
    expect(forkScopeFromMentions([])).toEqual(["apps/desktop/src/**", "docs/**"]);
  });
});

describe("forkMissionFromConversation", () => {
  it("brief를 Mission으로 — 출처/멘션범위/요약 이벤트 포함", () => {
    const brief = buildForkBrief({
      messages: [msg("user", "@docs/45.md 로드맵 정리")],
      draft: "로드맵 Phase B 구현",
    });
    const mission = forkMissionFromConversation({ brief, sessionTitle: "마키마와 대화" });
    expect(mission.title).toBe("로드맵 Phase B 구현");
    expect(mission.status).toBe("blocked");
    expect(mission.origin).toContain("마키마와 대화");
    expect(mission.allowedPaths).toEqual(["docs/**"]);
    expect(mission.events.some((event) => event.text.includes("멘션 범위"))).toBe(true);
    expect(mission.events.some((event) => event.text.includes("컨텍스트"))).toBe(true);
    expect(mission.gates).toContain("diff review before merge");
  });
});
