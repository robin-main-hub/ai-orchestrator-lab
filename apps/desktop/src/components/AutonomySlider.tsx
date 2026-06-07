import { useState } from "react";
import { Eye, FileEdit, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { PermissionLevel } from "@ai-orchestrator/protocol";
import { cn } from "../lib/utils";

/**
 * Stage 2 AutonomySlider — design-decisions.md §8 (AI 자율성 5단계).
 *
 * 5-step slider mapping a single, human-readable autonomy level to the
 * combination of `permissionLevel` + approval-gate behaviour that the
 * runtime layer enforces.
 *
 * The §8 table:
 *
 *   1 제안만                  — read_only
 *   2 초안                    — read_only + draft 권한
 *   3 승인 후 실행            — write_files + approval gate ON
 *   4 저위험 자동             — write_files + auto-approve low-risk
 *   5 신뢰 실행자 자동        — run_safe_commands + trust-bound
 *
 * Status (§8 보류 마크 🟡): the `permissionLevel` enum has 7 values
 * (read_only / write_files / run_safe_commands / run_dangerous_commands
 * / network_access / remote_workspace / secret_access). The autonomy
 * slider is a *different axis* — it bundles a permission tier with an
 * approval-gate policy. The two axes are kept independent for now and
 * the runtime mapping lands in a follow-up PR (after Codex's
 * permission-gate work). This component is therefore presentation-only
 * at v1: it owns its own local state and surfaces the chosen level so
 * the user can preview the §8 vocabulary in the UI.
 *
 * Controlled / uncontrolled:
 *   - If `value` + `onChange` are passed, the component is controlled.
 *   - Otherwise it manages local state seeded from `initialLevel`
 *     (default 3 — "승인 후 실행", matches §8 's recommended
 *     companion default).
 */

export type AutonomyLevel = 1 | 2 | 3 | 4 | 5;

export type AutonomySliderProps = {
  value?: AutonomyLevel;
  onChange?: (level: AutonomyLevel) => void;
  initialLevel?: AutonomyLevel;
  /** Hint to display below the level label (e.g., "현재 permission: write_files"). */
  hint?: string;
  /** Disable interaction (e.g., persona that hard-pins to a level). */
  disabled?: boolean;
};

type LevelDef = {
  level: AutonomyLevel;
  shortLabel: string;
  fullLabel: string;
  description: string;
  permissionHint: PermissionLevel;
  approvalHint: string;
  icon: React.ReactNode;
};

const LEVELS: LevelDef[] = [
  {
    level: 1,
    shortLabel: "제안",
    fullLabel: "제안만",
    description: "제안만, 사용자가 직접 모든 적용. 읽기 전용.",
    permissionHint: "read_only",
    approvalHint: "모든 액션 수동",
    icon: <Eye size={12} />,
  },
  {
    level: 2,
    shortLabel: "초안",
    fullLabel: "초안 작성",
    description: "초안을 작성하고 사용자 검토 후 적용.",
    permissionHint: "read_only",
    approvalHint: "초안 → 검토",
    icon: <FileEdit size={12} />,
  },
  {
    level: 3,
    shortLabel: "승인",
    fullLabel: "승인 후 실행",
    description: "매 작업마다 사용자 승인. 채아린(companion) 기본값.",
    permissionHint: "write_files",
    approvalHint: "매 action 승인 필요",
    icon: <ShieldCheck size={12} />,
  },
  {
    level: 4,
    shortLabel: "저위험 자동",
    fullLabel: "저위험 자동 실행",
    description: "저위험 읽기/검색/포맷은 자동, 위험 작업은 승인.",
    permissionHint: "write_files",
    approvalHint: "고위험만 승인",
    icon: <Sparkles size={12} />,
  },
  {
    level: 5,
    shortLabel: "신뢰 자동",
    fullLabel: "신뢰 실행자 자동",
    description: "신뢰 프로바이더(DGX local)에서만 높은 자율성을 허용.",
    permissionHint: "run_safe_commands",
    approvalHint: "신뢰 범위 안에서 자동",
    icon: <Zap size={12} />,
  },
];

export function AutonomySlider({
  value,
  onChange,
  initialLevel = 3,
  hint,
  disabled,
}: AutonomySliderProps) {
  const [localLevel, setLocalLevel] = useState<AutonomyLevel>(initialLevel);
  const current: AutonomyLevel = value ?? localLevel;
  // LEVELS is a static 5-entry array indexed 0..4 → current is 1..5.
  // Non-null assertion is safe: the find always hits one of the LEVELS rows.
  const currentDef = (LEVELS.find((l) => l.level === current) ?? LEVELS[2])!;

  function select(level: AutonomyLevel) {
    if (disabled) return;
    if (value === undefined) setLocalLevel(level);
    onChange?.(level);
  }

  return (
    <div
      className={cn("autonomy-slider", disabled && "autonomy-slider--disabled")}
      role="group"
      aria-label="AI 자율성 수준"
    >
      <header className="autonomy-slider__head">
        <span className="autonomy-slider__label">자율성</span>
        <strong className="autonomy-slider__value">
          {currentDef.icon}
          L{currentDef.level} · {currentDef.fullLabel}
        </strong>
      </header>

      <div className="autonomy-slider__track" role="radiogroup">
        {LEVELS.map((def) => {
          const isActive = def.level === current;
          const isPassed = def.level < current;
          return (
            <button
              aria-checked={isActive}
              className={cn(
                "autonomy-slider__step",
                `autonomy-slider__step--l${def.level}`,
                isActive && "autonomy-slider__step--active",
                isPassed && "autonomy-slider__step--passed",
              )}
              disabled={disabled}
              key={def.level}
              onClick={() => select(def.level)}
              role="radio"
              title={`L${def.level} ${def.fullLabel} — ${def.description}`}
              type="button"
            >
              <span className="autonomy-slider__step-num">{def.level}</span>
              <span className="autonomy-slider__step-label">{def.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <p className="autonomy-slider__description">{currentDef.description}</p>

      <div className="autonomy-slider__meta">
        <span>
          권한 <em>{currentDef.permissionHint}</em>
        </span>
        <span>
          승인 <em>{currentDef.approvalHint}</em>
        </span>
      </div>

      {hint ? <p className="autonomy-slider__hint">{hint}</p> : null}
    </div>
  );
}
