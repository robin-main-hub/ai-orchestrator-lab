/**
 * LINE G — Runner Gate Status (PURE model).
 *
 * 운영 런너의 게이트/모드/관측/승인 상태를 *기술*만 한다. 실행을 켜지 않는다.
 *
 * 불변식(invariants):
 *  - dgx 실행은 DEFAULT로 비활성(dgxExecutionEnabled 기본 false).
 *  - opencode/local 프리셋은 읽기 전용(read-only) — 변경 도구 없음.
 *  - `--dangerously-skip-permissions`는 어디에도 표현/허용되지 않는다.
 *  - 게이트 off거나 executor 부재면 observed:false + 명확한 reason (가짜 성공 금지).
 */

export type RunnerGateMode =
  | "mock"
  | "local_read_only"
  | "opencode_read_only"
  | "dgx_disabled";

export type RunnerGateStatus = {
  mode: RunnerGateMode;
  /** dgx-02 게이트(ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS 등) 실행 활성 여부. 기본 false. */
  dgxExecutionEnabled: boolean;
  /** 실제 executor(서버 세션 등)가 연결되어 있는지. */
  executorPresent: boolean;
  /** 관측된 실제 상태인지 — 게이트 off거나 executor 부재면 false. */
  observed: boolean;
  /** 이 모드가 변경(쓰기)을 제안할 수 있어 승인 단계가 필요한지. read-only 프리셋은 false. */
  approvalRequired: boolean;
  /** 사용자에게 보이는 명확한 사유. */
  reason: string;
};

export type SafePreset = {
  mode: RunnerGateMode;
  label: string;
  /** 사람이 읽는 모드 설명. */
  description: string;
  /** 읽기 전용 프리셋인지(변경 도구 없음). */
  readOnly: boolean;
  /** 이 프리셋이 dgx 실행 게이트를 요구하는지(요구해도 기본은 off). */
  requiresDgxGate: boolean;
};

/**
 * 안전 모드 프리셋 — 모두 read-only. dgx 실행을 켜는 프리셋은 없다.
 * `--dangerously-skip-permissions`는 어떤 프리셋에도 존재하지 않는다.
 */
export const RUNNER_SAFE_PRESETS: Readonly<Record<RunnerGateMode, SafePreset>> = {
  mock: {
    mode: "mock",
    label: "Mock",
    description: "시뮬레이션 — 실제 실행 없음.",
    readOnly: true,
    requiresDgxGate: false,
  },
  local_read_only: {
    mode: "local_read_only",
    label: "Local (read-only)",
    description: "local shell 읽기전용 진단(status/diff/typecheck) — 변경 제안 없음.",
    readOnly: true,
    requiresDgxGate: true,
  },
  opencode_read_only: {
    mode: "opencode_read_only",
    label: "OpenCode (read-only)",
    description: "opencode 읽기전용 코딩 에이전트 — 변경 제안 없음.",
    readOnly: true,
    requiresDgxGate: true,
  },
  dgx_disabled: {
    mode: "dgx_disabled",
    label: "dgx (disabled)",
    description: "dgx 실행 게이트는 기본 비활성 — 운영 승인 영역.",
    readOnly: true,
    requiresDgxGate: true,
  },
} as const;

export type DeriveRunnerGateStatusInput = {
  mode: RunnerGateMode;
  /** 호출자가 명시적으로 dgx 게이트 상태를 주입(누락 시 false). */
  dgxExecutionEnabled?: boolean;
  /** executor(서버 세션 등) 연결 여부(누락 시 false). */
  executorPresent?: boolean;
};

/**
 * 게이트 상태 파생 — PURE. 부작용 0, 실행 0.
 *
 * 규칙:
 *  - dgxExecutionEnabled 기본 false.
 *  - mock은 executor 불필요 → 항상 관측 가능(observed:true).
 *  - read-only 프리셋(local/opencode)은 게이트 ON + executor 있을 때만 observed:true.
 *  - dgx_disabled는 (기본적으로) 게이트 off → observed:false.
 *  - 게이트 off거나 executor 부재면 observed:false + 명확한 reason.
 */
export function deriveRunnerGateStatus(
  input: DeriveRunnerGateStatusInput,
): RunnerGateStatus {
  const preset = RUNNER_SAFE_PRESETS[input.mode];
  const dgxExecutionEnabled = input.dgxExecutionEnabled ?? false;
  const executorPresent = input.executorPresent ?? false;
  // read-only 프리셋만 — 어떤 경우에도 변경(쓰기) 자동 적용 없음.
  const approvalRequired = !preset.readOnly;

  // mock: executor/게이트 불필요. 항상 관측(시뮬레이션이지만 결정적).
  if (input.mode === "mock") {
    return {
      mode: "mock",
      dgxExecutionEnabled,
      executorPresent,
      observed: true,
      approvalRequired,
      reason: "Mock 모드 — 시뮬레이션, 실제 실행 없음.",
    };
  }

  // dgx 게이트가 필요한 모드인데 꺼져 있으면 → 관측 불가, 정직하게 보고.
  if (!dgxExecutionEnabled) {
    return {
      mode: input.mode,
      dgxExecutionEnabled: false,
      executorPresent,
      observed: false,
      approvalRequired,
      reason: "dgx 실행 게이트가 비활성 상태입니다 (기본값) — 운영 승인 전까지 실행되지 않습니다.",
    };
  }

  // 게이트는 켜졌지만 executor가 없으면 → 관측 불가.
  if (!executorPresent) {
    return {
      mode: input.mode,
      dgxExecutionEnabled: true,
      executorPresent: false,
      observed: false,
      approvalRequired,
      reason: "executor(세션)가 연결되지 않았습니다 — 관측 불가.",
    };
  }

  // 게이트 ON + executor 있음 → read-only 프리셋만 관측 가능.
  return {
    mode: input.mode,
    dgxExecutionEnabled: true,
    executorPresent: true,
    observed: true,
    approvalRequired,
    reason: `${preset.label} 읽기전용 프리셋 활성 — 변경 제안 없음, 적용은 별도 승인 단계.`,
  };
}
