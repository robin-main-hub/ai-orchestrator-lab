import { Bot, Play } from "lucide-react";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import type { AutonomyMode } from "../lib/autonomousRun";
import {
  loopStatusBadgeVariant,
  loopStatusLabel,
  modeLabel,
  SELECTABLE_PANE_ROLES,
  type AutonomyRunForm,
  type RunnableVerdict,
} from "../lib/autonomyRunForm";
import type { PersonaTaskOutcome } from "../lib/personaTaskRunner";

const MODES: AutonomyMode[] = ["human", "auto_safe"];

/**
 * Presentational panel for starting an autonomous persona run. Stateless: the
 * container owns form state and the run lifecycle. Verified via static markup
 * (the desktop has no DOM test environment).
 */
export function AutonomyRunPanel({
  form,
  runnable,
  running,
  outcome,
  error,
  onFieldChange,
  onRun,
}: {
  form: AutonomyRunForm;
  runnable: RunnableVerdict;
  running: boolean;
  outcome?: PersonaTaskOutcome | null;
  error?: string | null;
  onFieldChange: (patch: Partial<AutonomyRunForm>) => void;
  onRun: () => void;
}) {
  const disabled = running || !runnable.ok;

  return (
    <section className="mini-panel autonomy-run-panel">
      <header>
        <Bot size={16} />
        <span>자율 실행</span>
        <StatusBadge size="sm" variant={running ? "primary" : "muted"}>
          {running ? "실행 중" : "대기"}
        </StatusBadge>
      </header>

      <div className="autonomy-run-form">
        <label>
          <span>페르소나</span>
          <input
            disabled={running}
            onChange={(event) => onFieldChange({ personaName: event.target.value })}
            placeholder="예: makise"
            type="text"
            value={form.personaName}
          />
        </label>

        <label>
          <span>역할 pane</span>
          <select
            disabled={running}
            onChange={(event) => onFieldChange({ role: event.target.value as TmuxPaneRole })}
            value={form.role}
          >
            {SELECTABLE_PANE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>목표 (goal)</span>
          <input
            disabled={running}
            onChange={(event) => onFieldChange({ goal: event.target.value })}
            placeholder="이 작업으로 달성할 것"
            type="text"
            value={form.goal}
          />
        </label>

        <label>
          <span>검증 단계 (한 줄에 하나)</span>
          <textarea
            disabled={running}
            onChange={(event) => onFieldChange({ verificationStepsText: event.target.value })}
            placeholder={"pnpm test\npnpm lint"}
            rows={4}
            value={form.verificationStepsText}
          />
        </label>

        <label>
          <span>승인 모드</span>
          <select
            disabled={running}
            onChange={(event) => onFieldChange({ mode: event.target.value as AutonomyMode })}
            value={form.mode}
          >
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>
        </label>

        <button className="autonomy-run-button" disabled={disabled} onClick={onRun} type="button">
          <Play size={13} />
          <span>{running ? "실행 중…" : "자율 실행 시작"}</span>
        </button>
        {!runnable.ok && runnable.reason ? <p className="autonomy-run-hint">{runnable.reason}</p> : null}
      </div>

      {error ? (
        <div className="autonomy-run-result error">
          <StatusBadge size="sm" variant="danger">
            오류
          </StatusBadge>
          <span>{error}</span>
        </div>
      ) : null}

      {outcome ? <AutonomyRunOutcome outcome={outcome} /> : null}
    </section>
  );
}

function AutonomyRunOutcome({ outcome }: { outcome: PersonaTaskOutcome }) {
  if (!outcome.ok) {
    return (
      <div className="autonomy-run-result">
        <StatusBadge size="sm" variant="warning">
          소환 불가
        </StatusBadge>
        <span>{outcome.reason === "no_free_pane" ? "비어 있는 pane이 없습니다" : "이미 소환된 페르소나입니다"}</span>
      </div>
    );
  }

  const busyPanes = outcome.registry.panes.filter((pane) => pane.status === "busy").length;
  return (
    <div className="autonomy-run-result">
      <StatusBadge size="sm" variant={loopStatusBadgeVariant(outcome.loopStatus)}>
        {loopStatusLabel(outcome.loopStatus)}
      </StatusBadge>
      <span>
        {outcome.session.agentId} · {outcome.session.role} pane · 점유 pane {busyPanes}개
      </span>
    </div>
  );
}
