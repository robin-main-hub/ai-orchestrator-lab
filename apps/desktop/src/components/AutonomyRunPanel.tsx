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
import {
  actionBadgeVariant,
  actionLabel,
  outcomeLabel,
  type AutonomyStepRow,
} from "../lib/autonomyTimeline";
import {
  runHistoryStatusLabel,
  runHistoryStatusVariant,
  type AutonomyRunSummary,
} from "../lib/autonomyRunHistory";
import { rosterRowLabel, rosterRowVariant, type AutonomyRosterSummary } from "../lib/autonomyRoster";
import { resolvePersonaSprite, type PersonaSpriteMap } from "../lib/personaAvatarBundle";
import { buildPersonaCard } from "../lib/personaCard";
import { PersonaCard } from "./PersonaCard";
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
  personaOptions,
  steps,
  history,
  roster,
  notice,
  personaAvatars,
  personaSprites,
  expression,
  onFieldChange,
  onRun,
  onLoadFromPacket,
}: {
  form: AutonomyRunForm;
  runnable: RunnableVerdict;
  running: boolean;
  outcome?: PersonaTaskOutcome | null;
  error?: string | null;
  personaOptions?: ReadonlyArray<string>;
  steps?: ReadonlyArray<AutonomyStepRow>;
  history?: ReadonlyArray<AutonomyRunSummary>;
  roster?: AutonomyRosterSummary;
  /** advisory notice shown near the run button (e.g. mode downgraded by a gate) */
  notice?: string;
  /** persona slug -> avatar image url (from imported character cards) */
  personaAvatars?: Record<string, string>;
  /** persona slug -> { expression -> sprite url } */
  personaSprites?: PersonaSpriteMap;
  /** current expression key for the selected persona's portrait */
  expression?: string;
  onFieldChange: (patch: Partial<AutonomyRunForm>) => void;
  onRun: () => void;
  /** when provided, shows a button to (re)load the form from the current CodingPacket */
  onLoadFromPacket?: () => void;
}) {
  const disabled = running || !runnable.ok;
  const personaPortrait = resolvePersonaSprite(form.personaName.trim(), expression ?? "neutral", {
    sprites: personaSprites,
    avatars: personaAvatars,
  });

  return (
    <section className="mini-panel autonomy-run-panel">
      <header>
        {personaPortrait ? (
          <img
            className="autonomy-persona-avatar"
            src={personaPortrait}
            alt=""
            title={expression ? `표정: ${expression}` : undefined}
            width={18}
            height={18}
          />
        ) : (
          <Bot size={16} />
        )}
        <span>자율 실행</span>
        <StatusBadge size="sm" variant={running ? "primary" : "muted"}>
          {running ? "실행 중" : "대기"}
        </StatusBadge>
        {onLoadFromPacket ? (
          <button
            className="rail-icon-button autonomy-load-packet"
            disabled={running}
            onClick={onLoadFromPacket}
            title="현재 CodingPacket에서 불러오기"
            type="button"
          >
            패킷 불러오기
          </button>
        ) : null}
      </header>

      <div className="autonomy-run-form">
        <label>
          <span>페르소나</span>
          <input
            disabled={running}
            list={personaOptions && personaOptions.length > 0 ? "autonomy-persona-options" : undefined}
            onChange={(event) => onFieldChange({ personaName: event.target.value })}
            placeholder="예: architect"
            type="text"
            value={form.personaName}
          />
          {personaOptions && personaOptions.length > 0 ? (
            <datalist id="autonomy-persona-options">
              {personaOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}
        </label>

        {form.personaName.trim() ? (
          <PersonaCard
            compact
            card={buildPersonaCard({
              personaName: form.personaName.trim(),
              role: form.role,
              avatarUrl: personaPortrait,
            })}
          />
        ) : null}

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
        {runnable.ok && notice ? <p className="autonomy-run-notice">{notice}</p> : null}
      </div>

      {error ? (
        <div className="autonomy-run-result error">
          <StatusBadge size="sm" variant="danger">
            오류
          </StatusBadge>
          <span>{error}</span>
        </div>
      ) : null}

      {roster && roster.rows.length > 0 ? (
        <div className="autonomy-run-roster">
          <h4>pane 로스터 · 점유 {roster.busyCount} / 비어있음 {roster.freeCount}</h4>
          <ul>
            {roster.rows.map((row) => {
              const avatar = row.agentId
                ? resolvePersonaSprite(row.agentId, "neutral", { sprites: personaSprites, avatars: personaAvatars })
                : undefined;
              return (
                <li key={row.paneId}>
                  {avatar ? (
                    <img className="autonomy-roster-avatar" src={avatar} alt="" width={16} height={16} />
                  ) : null}
                  <StatusBadge size="sm" variant={rosterRowVariant(row.busy)}>
                    {row.role}
                  </StatusBadge>
                  <span className="autonomy-roster-meta">
                    {row.paneId} · {rosterRowLabel(row)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {outcome ? <AutonomyRunOutcome outcome={outcome} /> : null}

      {steps && steps.length > 0 ? (
        <ol className="autonomy-run-timeline">
          {steps.map((row, index) => (
            <li key={`${row.step}-${index}`}>
              <StatusBadge size="sm" variant={actionBadgeVariant(row.action)}>
                {actionLabel(row.action)}
              </StatusBadge>
              <span className="autonomy-step-outcome">
                #{row.step} · {outcomeLabel(row.outcome)}
              </span>
              <span className="autonomy-step-reason">{row.reason}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {history && history.length > 0 ? (
        <div className="autonomy-run-history">
          <h4>실행 기록</h4>
          <ul>
            {history.slice(-8).reverse().map((run) => (
              <li key={run.runId}>
                <StatusBadge size="sm" variant={runHistoryStatusVariant(run.status)}>
                  {runHistoryStatusLabel(run.status)}
                </StatusBadge>
                <span className="autonomy-history-meta">
                  {(run.personaName || "?")}
                  {run.role ? ` · ${run.role}` : ""} · {run.stepCount}단계
                </span>
                {run.goal ? <span className="autonomy-history-goal">{run.goal}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
