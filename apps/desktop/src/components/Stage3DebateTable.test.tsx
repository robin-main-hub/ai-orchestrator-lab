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
  it("발언 카드의 공개 작업 로그를 접힌 검토 근거로 격리한다", () => {
    const html = renderToStaticMarkup(
      <Stage3DebateTable
        onCreateCodingPacket={() => undefined}
        session={session}
      />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("검토 근거 보기");
    expect(html).toContain("공개 작업 로그");
    expect(html).toContain("토론 실행 브리핑");
    expect(html).toContain("코딩 영향");
    expect(html).toContain("검토자");
    expect(html).not.toContain("Reviewer");
  });

  it("라운드 탭에 점만 남기지 않고 현재 상태를 한국어로 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <Stage3DebateTable
        onCreateCodingPacket={() => undefined}
        session={{
          ...session,
          rounds: [
            session.rounds[0]!,
            {
              ...session.rounds[0]!,
              id: "round_running",
              status: "running",
              title: "실시간 반론",
            },
            {
              ...session.rounds[0]!,
              id: "round_blocked",
              status: "blocked",
              title: "차단된 검토",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("완료");
    expect(html).toContain("진행 중");
    expect(html).toContain("차단됨");
  });

  it("참여자 이름이 역할명으로 들어와도 캐릭터 표시명을 우선한다", () => {
    const html = renderToStaticMarkup(
      <Stage3DebateTable
        onCreateCodingPacket={() => undefined}
        session={{
          ...session,
          participants: [
            {
              agentId: "agent_orchestrator",
              modelId: "mimo-v2.5-pro",
              name: "Orchestrator",
              providerName: "MiMo",
              role: "orchestrator",
            },
          ],
          rounds: [
            {
              ...session.rounds[0]!,
              utterances: [
                {
                  id: "utterance_orchestrator",
                  agentId: "agent_orchestrator",
                  content: "결정만 남기고 잡음은 Annex로 보낸다.",
                  createdAt: "2026-06-06T00:02:00.000Z",
                  roundId: "round_final",
                  tags: [],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("마키마");
    expect(html).not.toContain("Orchestrator");
  });

  it("보조 근거가 없는 일반 발언에는 검토 근거 접힘을 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <Stage3DebateTable
        onCreateCodingPacket={() => undefined}
        session={{
          ...session,
          rounds: [
            {
              ...session.rounds[0]!,
              utterances: [
                {
                  id: "utterance_plain",
                  agentId: "agent_reviewer",
                  content: "이 발언은 본문만으로 충분하다.",
                  createdAt: "2026-06-06T00:02:00.000Z",
                  roundId: "round_final",
                  tags: [],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).not.toContain("검토 근거 보기");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("aria-label=\"공개 작업 로그\"");
    expect(html).not.toContain("토론 실행 브리핑");
  });

  it("토론 메인 상단에 결정 중심 레일을 표시한다", () => {
    const html = renderToStaticMarkup(
      <Stage3DebateTable
        onCreateCodingPacket={() => undefined}
        session={{
          ...session,
          rounds: [
            {
              ...session.rounds[0]!,
              utterances: [
                {
                  id: "utterance_decision",
                  agentId: "agent_reviewer",
                  content: "지금은 단일 PR로 묶고 Annex 로그는 분리한다.",
                  createdAt: "2026-06-06T00:02:00.000Z",
                  decisionId: "decision_1",
                  evidenceRefIds: ["evidence_1"],
                  roundId: "round_final",
                  tags: ["risk", "coding_impact"],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("결정 레일");
    expect(html).toContain("다음 행동");
    expect(html).toContain("결정 1건");
    expect(html).toContain("리스크 1건");
    expect(html).toContain("근거 1건");
    expect(html).toContain("패킷 만들기");
  });
});
