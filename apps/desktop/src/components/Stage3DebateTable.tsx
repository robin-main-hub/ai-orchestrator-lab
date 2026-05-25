import { useMemo } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  CornerDownRight,
  GitBranch,
  GitMerge,
  Link2,
  Send,
  XCircle,
} from "lucide-react";
import type { DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { debateRounds } from "../seeds/conversation";
import type { Stage3DebateUtteranceView } from "../types";
import { cn } from "../lib/utils";

/**
 * Stage 3 Debate Table — Stage 2-6 provenance UI.
 *
 * Renders the new optional provenance fields from
 * `debateUtteranceSchema` (PR #125, see `packages/protocol/src/index.ts:344`):
 *
 *   - parentUtteranceId  : 이 발언이 어떤 발언에 대한 응답/반박인지
 *   - acceptedBy         : 이 발언을 수용한 후속 발언 ids
 *   - rejectedBy         : 이 발언을 기각한 후속 발언 ids
 *   - decisionId         : 이 발언이 최종 결정에 연결됐다면 결정 id
 *   - evidenceRefIds     : 근거가 된 외부 reference (docs / packets / events)
 *   - codingImpactRefs   : coding packet / file change 참조
 *
 * 모든 필드 optional 이라 데이터 없는 발언은 footer 미렌더. seed 가
 * 점진적으로 채워지면 footer 가 자연스럽게 자랑.
 *
 * 또한 docs/design-decisions.md §1 에 따라 WindowChecklist 의존 제거 —
 * production UI 는 dev-only audit 항목 표시 안 함.
 */
export function Stage3DebateTable({
  onCreateCodingPacket,
  onSelectUtterance,
  session,
}: {
  onCreateCodingPacket: () => void;
  onSelectUtterance?: (utterance: Stage3DebateUtteranceView) => void;
  session: Stage3DebateSession;
}) {
  const utterances: Stage3DebateUtteranceView[] = useMemo(
    () =>
      session.rounds.flatMap((round) =>
        round.utterances.map((utterance) => ({
          ...utterance,
          roundTitle: round.title,
          agentName:
            session.participants.find((p) => p.agentId === utterance.agentId)?.name ??
            utterance.agentId,
        })),
      ),
    [session.rounds, session.participants],
  );

  // O(1) lookup: id → utterance (for parent / acceptedBy / rejectedBy chip text)
  const utteranceById = useMemo(() => {
    const map = new Map<string, Stage3DebateUtteranceView>();
    for (const u of utterances) map.set(u.id, u);
    return map;
  }, [utterances]);

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
      <div className="debate-workspace">
        <div className="debate-grid">
          {utterances.map((utterance) => (
            <DebateCard
              key={utterance.id}
              onSelect={onSelectUtterance}
              utterance={utterance}
              utteranceById={utteranceById}
            />
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

function DebateCard({
  utterance,
  utteranceById,
  onSelect,
}: {
  utterance: Stage3DebateUtteranceView;
  utteranceById: Map<string, Stage3DebateUtteranceView>;
  onSelect?: (utterance: Stage3DebateUtteranceView) => void;
}) {
  const parent = utterance.parentUtteranceId
    ? utteranceById.get(utterance.parentUtteranceId)
    : undefined;
  const acceptedCount = utterance.acceptedBy?.length ?? 0;
  const rejectedCount = utterance.rejectedBy?.length ?? 0;
  const evidenceCount = utterance.evidenceRefIds?.length ?? 0;
  const codingCount = utterance.codingImpactRefs?.length ?? 0;
  const isDecision = Boolean(utterance.decisionId);

  const hasProvenance =
    parent ||
    acceptedCount > 0 ||
    rejectedCount > 0 ||
    evidenceCount > 0 ||
    codingCount > 0 ||
    isDecision;

  return (
    <article
      className={cn(
        "debate-card",
        onSelect && "selectable",
        isDecision && "debate-card--decision",
      )}
      onClick={() => onSelect?.(utterance)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(utterance);
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      title="이 발언자와 Conversation에서 이어서 대화"
    >
      <header>
        <Bot size={16} />
        <strong>{utterance.agentName}</strong>
        <span>{utterance.roundTitle}</span>
        {isDecision ? (
          <span className="debate-card__decision-badge" title="최종 결정에 연결됨">
            <GitMerge size={11} />
            DECISION
          </span>
        ) : null}
      </header>

      {parent ? (
        <div className="debate-card__parent-ref">
          <CornerDownRight size={11} />
          <span>
            <em>{parent.agentName}</em>의 {parent.roundTitle} 발언에 응답
          </span>
        </div>
      ) : null}

      <div className="debate-tags">
        {utterance.tags.map((tag) => (
          <em className={`debate-tag ${tag}`} key={tag}>
            {debateTagLabel(tag)}
          </em>
        ))}
      </div>
      <p>{utterance.content}</p>

      {hasProvenance ? (
        <footer className="debate-card__provenance">
          {acceptedCount > 0 ? (
            <ProvenancePill
              icon={<CheckCircle2 size={10} />}
              label={`수용 ${acceptedCount}`}
              tone="ok"
              tooltip={resolveNameList(utterance.acceptedBy, utteranceById)}
            />
          ) : null}
          {rejectedCount > 0 ? (
            <ProvenancePill
              icon={<XCircle size={10} />}
              label={`기각 ${rejectedCount}`}
              tone="bad"
              tooltip={resolveNameList(utterance.rejectedBy, utteranceById)}
            />
          ) : null}
          {evidenceCount > 0 ? (
            <ProvenancePill
              icon={<Link2 size={10} />}
              label={`근거 ${evidenceCount}`}
              tone="neutral"
              tooltip={utterance.evidenceRefIds?.join(" · ")}
            />
          ) : null}
          {codingCount > 0 ? (
            <ProvenancePill
              icon={<Send size={10} />}
              label={`코딩 ${codingCount}`}
              tone="cyan"
              tooltip={utterance.codingImpactRefs?.join(" · ")}
            />
          ) : null}
          {isDecision ? (
            <ProvenancePill
              icon={<GitMerge size={10} />}
              label={utterance.decisionId ?? "decision"}
              tone="cyan"
              tooltip="이 발언이 최종 결정 노드로 채택됨"
            />
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function ProvenancePill({
  icon,
  label,
  tone,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "ok" | "bad" | "neutral" | "cyan";
  tooltip?: string;
}) {
  return (
    <span
      className={cn("debate-card__pill", `debate-card__pill--${tone}`)}
      title={tooltip}
    >
      {icon}
      {label}
    </span>
  );
}

function resolveNameList(
  ids: DebateUtterance["acceptedBy"] | DebateUtterance["rejectedBy"],
  utteranceById: Map<string, Stage3DebateUtteranceView>,
): string | undefined {
  if (!ids || ids.length === 0) return undefined;
  return ids
    .map((id) => {
      const u = utteranceById.get(id);
      return u ? `${u.agentName} (${u.roundTitle})` : id;
    })
    .join(" · ");
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

// Legacy preview helper retained but unused (kept for backward compat with
// debugging / story imports). Safe to delete in a future cleanup.
export function _DebateTablePreview() {
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
