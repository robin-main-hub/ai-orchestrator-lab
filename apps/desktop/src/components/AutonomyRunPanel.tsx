import { Bot, Play, Volume2 } from "lucide-react";
import { StatusBadge } from "@/ui/status-badge";
import type { AutonomyMode } from "../lib/autonomousRun";
import {
  loopStatusBadgeVariant,
  loopStatusLabel,
  modeLabel,
  nonAutoApprovableSteps,
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
import { buildRolePaneOptions, type AutonomyRosterSummary } from "../lib/autonomyRoster";
import type { DebateDecisionReadiness } from "../lib/debateDecisionReadiness";
import { RolePaneSelect } from "./RolePaneSelect";
import { resolvePersonaSprite, type PersonaSpriteMap } from "../lib/personaAvatarBundle";
import { buildPersonaCard } from "../lib/personaCard";
import { PersonaCard } from "./PersonaCard";
import { ResultStamp, stampForLoopStatus } from "./ResultStamp";
import type { PersonaTaskOutcome } from "../lib/personaTaskRunner";

const MODES: AutonomyMode[] = ["full_auto", "auto_safe", "human"];

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
  gateDetail,
  onOpenDebate,
  onOpenApprovalQueue,
  approvalWaitNote,
  personaAvatars,
  personaSprites,
  expression,
  onFieldChange,
  onRun,
  onLoadFromPacket,
  onSpeak,
  speaking,
  speakDisabledReason,
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
  /** 실행이 게이트로 막혔을 때 보여줄 구체적 사유/다음 행동 (토론 결정 준비도) */
  gateDetail?: Pick<DebateDecisionReadiness, "blockers" | "nextActionLabel">;
  /** 게이트 콜아웃의 "토론으로 이동" 딥링크 (제공 시 버튼 노출) */
  onOpenDebate?: () => void;
  /** 사람 승인이 필요할 때 승인 드로어를 여는 핸들러 — 탭 이동 없이 제자리에서 승인 */
  onOpenApprovalQueue?: () => void;
  /** 디스패치가 승인 큐에서 대기 중일 때의 실시간 안내 (auto_safe에서 자동승인 불가 명령 등) */
  approvalWaitNote?: string;
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
  /** P2-9: 캐릭터 목소리로 현재 결과를 읽어주는 핸들러 (제공 시 "말하기" 버튼 노출) */
  onSpeak?: () => void;
  /** TTS 합성/재생 진행 중 */
  speaking?: boolean;
  /** 말하기가 불가능한 이유(있으면 버튼 비활성 + 툴팁) */
  speakDisabledReason?: string;
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
        {onSpeak ? (
          <button
            className="rail-icon-button autonomy-speak"
            disabled={speaking || Boolean(speakDisabledReason)}
            onClick={onSpeak}
            title={speakDisabledReason ?? (speaking ? "재생 중…" : "결과를 캐릭터 목소리로 듣기")}
            type="button"
          >
            <Volume2 size={14} />
            {speaking ? "재생 중…" : "말하기"}
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

        <div className="autonomy-run-row">
          <label>
            <span>역할 pane</span>
            <RolePaneSelect
              disabled={running}
              onChange={(role) => onFieldChange({ role })}
              options={buildRolePaneOptions(SELECTABLE_PANE_ROLES, roster)}
              resolveAvatar={(agentId) =>
                resolvePersonaSprite(agentId, "neutral", { sprites: personaSprites, avatars: personaAvatars })
              }
              summary={roster ? `pane 점유 ${roster.busyCount} · 비어있음 ${roster.freeCount}` : undefined}
              value={form.role}
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
        </div>

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
          {(() => {
            const manualSteps = nonAutoApprovableSteps(form);
            return manualSteps.length > 0 ? (
              <p className="autonomy-step-warning">
                자동승인 목록 밖 — 실행 시 사람 승인 필요: {manualSteps.join(", ")}
              </p>
            ) : null;
          })()}
        </label>

        {!runnable.ok && runnable.reason ? (
          <div className="autonomy-gate-callout" role="alert">
            <p className="autonomy-gate-reason">{runnable.reason}</p>
            {gateDetail && gateDetail.blockers.length > 0 ? (
              <ul className="autonomy-gate-blockers">
                {gateDetail.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
            {gateDetail && !gateDetail.blockers.includes(gateDetail.nextActionLabel) ? (
              <p className="autonomy-gate-next">{gateDetail.nextActionLabel}</p>
            ) : null}
            {onOpenDebate ? (
              <button className="rail-icon-button autonomy-open-debate" onClick={onOpenDebate} type="button">
                토론으로 이동
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          className="autonomy-run-button glitch-hover"
          disabled={disabled}
          onClick={onRun}
          title={!runnable.ok ? runnable.reason : undefined}
          type="button"
        >
          <Play size={13} />
          <span>{running ? "실행 중…" : "자율 실행 시작"}</span>
        </button>
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

      {outcome ? <AutonomyRunOutcome outcome={outcome} /> : null}

      {(steps && steps.some((s) => s.action === "escalate_approval")) ||
      (outcome?.ok && outcome.loopStatus === "awaiting_human") ||
      (running && form.mode === "human") ||
      approvalWaitNote ? (
        <div className="autonomy-hud-alarm" role="status">
          <span className="autonomy-hud-beacon" aria-hidden="true" />
          {approvalWaitNote
            ? approvalWaitNote
            : running && form.mode === "human" && !(outcome?.ok && outcome.loopStatus === "awaiting_human")
              ? "사람 승인 모드 — 디스패치마다 승인이 필요합니다"
              : "auth required — 사람 승인 대기"}
          {onOpenApprovalQueue ? (
            <button
              className="rail-icon-button autonomy-open-approvals"
              onClick={onOpenApprovalQueue}
              type="button"
            >
              승인 큐 열기
            </button>
          ) : null}
        </div>
      ) : null}

      {steps && steps.length > 0 ? (
        <ol className="autonomy-run-timeline autonomy-hud">
          {steps.map((row, index) => (
            <li key={`${row.step}-${index}`} className={`hud-step hud-${row.action}`}>
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
  const stamp = stampForLoopStatus(outcome.loopStatus);
  return (
    <div className="autonomy-run-result">
      <ResultStamp label={stamp.label} tone={stamp.tone} />
      <StatusBadge size="sm" variant={loopStatusBadgeVariant(outcome.loopStatus)}>
        {loopStatusLabel(outcome.loopStatus)}
      </StatusBadge>
      <span>
        {outcome.session.agentId} · {outcome.session.role} pane · 점유 pane {busyPanes}개
      </span>
    </div>
  );
}
