import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { Stage3DebateTable } from "./Stage3DebateTable";

const session: Stage3DebateSession = {
  id: "debate_session_trace",
  problem: "Debate 화면 공개 작업 로그 표시",
  summary: "발언 카드마다 요약 단계와 근거만 보인다.",
  contextPreview: [],
  humanPeek: [],
  participants: [
    {
      agentId: "agent_reviewer",
      modelId: "mimo-v2.5-pro",
      name: "시노미야 카구야",
      providerName: "MiMo",
      role: "reviewer",
    },
  ],
  promotedAt: "2026-06-06T00:00:00.000Z",
  rounds: [
    {
      id: "round_final",
      debateId: "debate_session_trace",
      kind: "final_decision",
      status: "completed",
      title: "최종 결정",
      utterances: [
        {
          id: "utterance_trace",
          agentId: "agent_reviewer",
          content: "근거는 충분하고 코딩 영향도 명확하다.",
          codingImpactRefs: ["packet_candidate_1"],
          createdAt: "2026-06-06T00:01:00.000Z",
          evidenceRefIds: ["evidence_design"],
          roundId: "round_final",
          tags: ["evidence", "coding_impact"],
        },
      ],
    },
  ],
  statusHub: [],
};

describe("Stage3DebateTable", () => {
  it("발언 카드 안에 공개 작업 로그를 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <Stage3DebateTable
        onCreateCodingPacket={() => undefined}
        session={session}
      />,
    );

    expect(html).toContain("공개 작업 로그");
    expect(html).toContain("토론 실행 영수증");
    expect(html).toContain("코딩 영향");
    expect(html).toContain("검토자");
    expect(html).not.toContain("Reviewer");
  });
});
