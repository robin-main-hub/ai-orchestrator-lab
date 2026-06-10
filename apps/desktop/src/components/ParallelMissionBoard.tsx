import { Terminal } from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import { loopStatusBadgeVariant, loopStatusLabel } from "../lib/autonomyRunForm";
import { actionLabel, outcomeLabel } from "../lib/autonomyTimeline";
import type { BoardCardStatus, ParallelBoard, ParallelBoardCard } from "../lib/parallelMissionBoard";
import { summarizeBoard } from "../lib/parallelMissionBoard";

/**
 * Manus/Kimi-style parallel console: one "terminal" card per mission, each
 * streaming its own closed-loop step feed live while all missions run
 * concurrently behind the scenes. Presentational only — the container owns the
 * board state; verified via static markup (no DOM test env).
 */

function cardStatusBadge(card: ParallelBoardCard): { label: string; variant: StatusBadgeVariant } {
  if (card.status === "rejected") {
    return { label: card.rejection === "already_summoned" ? "이미 소환됨" : "빈 pane 없음", variant: "danger" };
  }
  if (card.status === "queued") return { label: "대기열", variant: "muted" };
  if (card.status === "running" || !card.loopStatus) return { label: "실행 중", variant: "primary" };
  return { label: loopStatusLabel(card.loopStatus), variant: loopStatusBadgeVariant(card.loopStatus) };
}

const STATUS_DOT: Record<BoardCardStatus, string> = {
  queued: "parallel-dot-queued",
  running: "parallel-dot-running",
  done: "parallel-dot-done",
  rejected: "parallel-dot-rejected",
};

function MissionTerminal({ card }: { card: ParallelBoardCard }) {
  const badge = cardStatusBadge(card);
  return (
    <article className={`parallel-terminal parallel-terminal--${card.status}`}>
      <header className="parallel-terminal__bar">
        <span className={`parallel-terminal__dot ${STATUS_DOT[card.status]}`} aria-hidden />
        <Terminal size={13} aria-hidden />
        <span className="parallel-terminal__title">{card.personaName}</span>
        <span className="parallel-terminal__role">{card.role}</span>
        {card.paneId ? <span className="parallel-terminal__pane">{card.paneId}</span> : null}
        {card.branch ? (
          <span className="parallel-terminal__branch" title={`worktree 브랜치 ${card.branch}`}>
            ⎇ {card.branch}
          </span>
        ) : null}
        <span className="parallel-terminal__spacer" />
        <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
      </header>
      <p className="parallel-terminal__goal" title={card.goal}>
        $ {card.goal || "(no goal)"}
      </p>
      <ol className="parallel-terminal__feed">
        {card.steps.length === 0 ? (
          <li className="parallel-terminal__feed-empty">
            {card.status === "rejected" ? "pane을 할당받지 못했습니다." : "출력 대기 중…"}
          </li>
        ) : (
          card.steps.map((step, index) => (
            <li key={`${card.id}_${index}`} className="parallel-terminal__line">
              <span className="parallel-terminal__step">#{step.step}</span>
              <span className="parallel-terminal__outcome">{outcomeLabel(step.outcome)}</span>
              <span className="parallel-terminal__arrow">→</span>
              <span className="parallel-terminal__action">{actionLabel(step.action)}</span>
              {step.reason ? <span className="parallel-terminal__reason">{step.reason}</span> : null}
            </li>
          ))
        )}
      </ol>
    </article>
  );
}

export function ParallelMissionBoard({ board }: { board: ParallelBoard }) {
  const summary = summarizeBoard(board);
  return (
    <section className="parallel-board" aria-label="병렬 미션 보드">
      <div className="parallel-board__summary">
        <span className="parallel-board__count">{summary.total}개 미션</span>
        {summary.running > 0 ? <StatusBadge variant="primary">진행 {summary.running}</StatusBadge> : null}
        {summary.completed > 0 ? <StatusBadge variant="success">완료 {summary.completed}</StatusBadge> : null}
        {summary.awaiting > 0 ? <StatusBadge variant="warning">승인대기 {summary.awaiting}</StatusBadge> : null}
        {summary.failed > 0 ? <StatusBadge variant="danger">실패 {summary.failed}</StatusBadge> : null}
        {summary.rejected > 0 ? <StatusBadge variant="muted">거부 {summary.rejected}</StatusBadge> : null}
      </div>
      {board.cards.length === 0 ? (
        <p className="parallel-board__empty">미션을 추가하고 “병렬 실행”을 누르면 각 에이전트가 자기 터미널에서 동시에 작업합니다.</p>
      ) : (
        <div className="parallel-board__grid">
          {board.cards.map((card) => (
            <MissionTerminal key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}
