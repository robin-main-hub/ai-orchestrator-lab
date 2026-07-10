import { useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  ListChecks,
  Search,
  TerminalSquare,
} from "lucide-react";
import type { ResearchAgentRun, ResearchStep, ResearchStepKind } from "../../lib/researchSwarm";

/**
 * Agent's Computer — Kimi 우측 패널. 선택된 요원의 활동 타임라인을 스텝 행으로
 * 렌더한다 (Think / Write Todo / Search N results / Browsing / Execute
 * Terminal / Creating file), 각 행은 접고 펼쳐 본문을 본다. Presentational.
 */

const STEP_ICON: Record<ResearchStepKind, typeof Brain> = {
  think: Brain,
  todo: ListChecks,
  search: Search,
  browse: Globe,
  terminal: TerminalSquare,
  write_file: FileText,
};

const STEP_VERB: Record<ResearchStepKind, string> = {
  think: "Think",
  todo: "Write Todo",
  search: "Search",
  browse: "Browsing",
  terminal: "Execute Terminal",
  write_file: "Creating file",
};

function StepRow({ step }: { step: ResearchStep }) {
  const [open, setOpen] = useState(false);
  const Icon = STEP_ICON[step.kind];
  const hasBody = Boolean(step.output);
  return (
    <li className={`research-step research-step--${step.status}`}>
      <button
        className="research-step__row"
        disabled={!hasBody}
        onClick={() => hasBody && setOpen((value) => !value)}
        type="button"
        aria-expanded={hasBody ? open : undefined}
      >
        <Icon size={14} aria-hidden className="research-step__icon" />
        <span className="research-step__verb">{STEP_VERB[step.kind]}</span>
        <span className="research-step__title" title={step.title}>
          {step.title}
        </span>
        {typeof step.resultCount === "number" && step.kind === "search" ? (
          <span className="research-step__count">{step.resultCount} results</span>
        ) : null}
        {step.status === "running" ? <span className="research-step__spin os-breathe" aria-hidden /> : null}
        {hasBody ? (
          open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />
        ) : (
          <ChevronRight size={13} aria-hidden className="research-step__chevron-muted" />
        )}
      </button>
      {open && step.output ? <pre className="research-step__output">{step.output}</pre> : null}
    </li>
  );
}

export function ResearchAgentComputer({
  run,
  index,
  atLatest,
  onBackToLatest,
}: {
  run: ResearchAgentRun | null;
  /** 1-based 표시 번호 */
  index: number;
  atLatest: boolean;
  onBackToLatest?: () => void;
}) {
  if (!run) {
    return <div className="research-computer research-computer--empty">요원을 선택하면 작업 내역이 표시됩니다.</div>;
  }
  return (
    <div className="research-computer">
      <header className="research-computer__bar">
        <span className="research-computer__agent">Agent {String(index).padStart(2, "0")}</span>
        <span className="research-computer__name">{run.displayName}</span>
        <span className="research-computer__spacer" />
        <span className="research-computer__task-link">Agent's Window</span>
      </header>
      <ol className="research-computer__feed">
        {run.steps.length === 0 ? (
          <li className="research-computer__idle">{run.statusVerb}…</li>
        ) : (
          run.steps.map((step) => <StepRow key={step.id} step={step} />)
        )}
      </ol>
      {run.conclusion ? (
        <div className="research-computer__conclusion">
          <h4>결론</h4>
          <p>{run.conclusion}</p>
        </div>
      ) : null}
      {!atLatest && onBackToLatest ? (
        <button className="research-computer__back" onClick={onBackToLatest} type="button">
          <ChevronDown size={12} aria-hidden /> Back to latest
        </button>
      ) : null}
    </div>
  );
}
