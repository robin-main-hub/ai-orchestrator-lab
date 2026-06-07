import { describe, expect, it } from "vitest";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";
import { resolveDebateAnnexAgentLabel } from "./DebateAnnexPage";

const session = {
  id: "debate_annex_names",
  problem: "Annex 내부 ID 숨김",
  summary: "로그 표면에는 캐릭터 이름을 보여준다.",
  contextPreview: [],
  humanPeek: [],
  participants: [
    {
      agentId: "agent_reviewer",
      modelId: "claude-opus-4-8",
      name: "시노미야 카구야",
      providerName: "Claude",
      role: "reviewer",
    },
  ],
  promotedAt: "2026-06-06T00:00:00.000Z",
  rounds: [],
  statusHub: [],
} satisfies Stage3DebateSession;

describe("DebateAnnexPage", () => {
  it("Annex 로그에서 내부 agentId 대신 캐릭터 이름을 사용한다", () => {
    expect(resolveDebateAnnexAgentLabel(session, "agent_reviewer")).toBe("시노미야 카구야");
    expect(resolveDebateAnnexAgentLabel(session, "agent_unknown_worker")).toBe("알 수 없는 워커");
  });
});
