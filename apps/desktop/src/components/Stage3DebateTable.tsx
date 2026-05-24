import { Activity, Bot, GitBranch, Send } from "lucide-react";
import type { DebateTag } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { debateRounds } from "../seeds/conversation";
import type { Stage3DebateUtteranceView, WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

function DebateTable() {
  const rows = [
    { agent: "Architect", tag: "근거", text: "패키지 경계가 먼저 잡혀야 DGX와 로컬 폴백이 뒤틀리지 않는다." },
    { agent: "Reviewer", tag: "리스크", text: "API 키 원문 저장과 터미널 실행은 첫 구현에서 명시적으로 막아야 한다." },
    { agent: "Orchestrator", tag: "코딩 영향", text: "결론은 Coding Packet 필드로 바로 내려갈 수 있어야 한다." },
  ];

  return (
    <section className="debate-panel">
      <div className="round-strip">
        {debateRounds.map((round) => (
          <span className={`round-chip ${round.status}`} key={round.id}>
            {round.title}
          </span>
        ))}
      </div>
      <div className="debate-grid">
        {rows.map((row) => (
          <article className="debate-card" key={`${row.agent}-${row.tag}`}>
            <header>
              <Bot size={17} />
              <strong>{row.agent}</strong>
              <span>{row.tag}</span>
            </header>
            <p>{row.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Stage3DebateTable({
  onCreateCodingPacket,
  onSelectUtterance,
  session,
}: {
  onCreateCodingPacket: () => void;
  onSelectUtterance?: (utterance: Stage3DebateUtteranceView) => void;
  session: Stage3DebateSession;
}) {
  const utterances: Stage3DebateUtteranceView[] = session.rounds.flatMap((round) =>
    round.utterances.map((utterance) => ({
      ...utterance,
      roundTitle: round.title,
      agentName: session.participants.find((participant) => participant.agentId === utterance.agentId)?.name ?? utterance.agentId,
    })),
  );
  const auditItems: WindowAuditItem[] = [
    {
      id: "rounds",
      label: "토론 라운드",
      status: session.rounds.length >= 6 ? "ready" : "partial",
      detail: "문제 정의, 제안, 비판, 요약, 보완, 최종 결정 흐름을 유지합니다.",
    },
    {
      id: "tags",
      label: "발언 태그",
      status: utterances.every((utterance) => utterance.tags.length > 0) ? "ready" : "partial",
      detail: "합의/반대/근거/리스크/코딩 영향 태그로 말싸움이 아니라 의사결정을 만듭니다.",
    },
    {
      id: "peek",
      label: "Human Peek",
      status: session.humanPeek.length > 0 ? "ready" : "partial",
      detail: "비공개 에이전트 흐름을 사용자가 감시할 수 있게 남깁니다.",
    },
    {
      id: "coding-packet",
      label: "패킷 반영",
      status: "ready",
      detail: "토론은 요약으로 끝나지 않고 Coding Packet 갱신 버튼으로 이어집니다.",
    },
  ];

  return (
    <section className="debate-panel stage3">
      <header className="debate-context">
        <div>
          <span>Debate Context</span>
          <strong>{session.problem}</strong>
          <p>{session.summary}</p>
        </div>
        <button className="primary-button" onClick={onCreateCodingPacket} type="button">
          <Send size={15} />
          패킷 반영
        </button>
      </header>
      <div className="round-strip">
        {session.rounds.map((round) => (
          <span className={`round-chip ${round.status}`} key={round.id}>
            {round.title}
          </span>
        ))}
      </div>
      <div className="roundtable-mode-strip">
        <span>Roundtable</span>
        <strong>Branch 확장 모델</strong>
        <em>Sequential</em>
        <em>Deliberative</em>
        <small>토론 transcript 전체가 아니라 채택 요약만 main context로 돌아옵니다.</small>
      </div>
      <WindowChecklist items={auditItems} title="토론 창 점검" />
      <div className="debate-workspace">
        <div className="debate-grid">
          {utterances.map((utterance) => (
            <article
              className={`debate-card ${onSelectUtterance ? "selectable" : ""}`}
              key={utterance.id}
              onClick={() => onSelectUtterance?.(utterance)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectUtterance?.(utterance);
                }
              }}
              role={onSelectUtterance ? "button" : undefined}
              tabIndex={onSelectUtterance ? 0 : undefined}
              title="이 발언자와 Conversation에서 이어서 대화"
            >
              <header>
                <Bot size={16} />
                <strong>{utterance.agentName}</strong>
                <span>{utterance.roundTitle}</span>
              </header>
              <div className="debate-tags">
                {utterance.tags.map((tag) => (
                  <em className={`debate-tag ${tag}`} key={tag}>
                    {debateTagLabel(tag)}
                  </em>
                ))}
              </div>
              <p>{utterance.content}</p>
            </article>
          ))}
        </div>
        <aside className="human-peek-panel">
          <section>
            <header>
              <Activity size={15} />
              <strong>Status Hub</strong>
            </header>
            <div className="status-hub-grid">
              {session.statusHub.map((item) => (
                <div className={`status-hub-cell ${item.tone}`} key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
          <section>
            <header>
              <GitBranch size={15} />
              <strong>Human Peek</strong>
            </header>
            <div className="peek-list">
              {session.humanPeek.map((entry) => (
                <article className={`peek-row ${entry.state}`} key={entry.id}>
                  <span>{entry.kind}</span>
                  <strong>
                    {entry.actor} → {entry.target}
                  </strong>
                  <p>{entry.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function debateTagLabel(tag: DebateTag) {
  const labels: Record<DebateTag, string> = {
    agreement: "합의",
    objection: "반대",
    evidence: "근거",
    risk: "리스크",
    coding_impact: "코딩 영향",
  };

  return labels[tag];
}
