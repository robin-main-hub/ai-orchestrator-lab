import { z } from "zod";
import { sandboxRunnerKindSchema, type SandboxRunnerKind } from "./appWorkspace.js";

/**
 * Unified Control Strip (D8) — Model / Mode / Thinking / Tool permission / Runner를 한 줄에서
 * 통제한다. 단 이건 **권한의 단일 진실이 아니다** — capability/SandboxRunner/approval이
 * 그대로 권한 경계다. 컨트롤 스트립은 그 위의 힌트/선택일 뿐.
 *
 * 절대 불변식(resolveControlStrip이 강제):
 *   - **thinking effort는 품질/비용 힌트일 뿐 권한을 올리지 않는다.**
 *   - **Build 모드여도 approval/sandbox를 우회하지 않는다** — 실행은 여전히 toolPermission +
 *     runner + approval 경계 안.
 *   - **runner가 unavailable이면 blocked/configured** — 가짜로 사용 가능 표시 금지.
 */

export const controlModeSchema = z.enum(["plan", "build", "review"]);
export type ControlMode = z.infer<typeof controlModeSchema>;

export const thinkingEffortSchema = z.enum(["low", "medium", "high", "auto"]);
export type ThinkingEffort = z.infer<typeof thinkingEffortSchema>;

export const toolPermissionSchema = z.enum(["read_only", "verify", "build", "approval_required"]);
export type ToolPermission = z.infer<typeof toolPermissionSchema>;

export const controlStripStateSchema = z.object({
  modelId: z.string(),
  mode: controlModeSchema,
  thinking: thinkingEffortSchema,
  toolPermission: toolPermissionSchema,
  runner: sandboxRunnerKindSchema,
});
export type ControlStripState = z.infer<typeof controlStripStateSchema>;

export type ControlStripAvailability = {
  models: ReadonlyArray<string>;
  runners: ReadonlyArray<SandboxRunnerKind>;
};

export type ResolvedControlStrip = {
  modelId: string;
  mode: ControlMode;
  thinking: ThinkingEffort;
  /** mode는 권한을 올리지 않는다 — toolPermission이 그대로 유효 권한. */
  effectiveToolPermission: ToolPermission;
  /** runner가 available일 때만 그 runner, 아니면 "blocked". */
  effectiveRunner: SandboxRunnerKind | "blocked";
  runnerAvailable: boolean;
  /** 실행 가능 형태: build + runner available일 때만 sandboxed, 그래도 approval 경계는 유효. */
  executionMode: "none" | "sandboxed";
  /** 적용된 불변식 설명(UI/감사용). */
  invariants: string[];
};

/**
 * 컨트롤 스트립 상태 + 가용성 → 유효 상태(순수, 정직성 단일 지점). 권한을 절대 올리지 않고,
 * unavailable runner는 blocked로 떨어뜨린다.
 */
export function resolveControlStrip(
  state: ControlStripState,
  availability: ControlStripAvailability,
): ResolvedControlStrip {
  const runnerAvailable = availability.runners.includes(state.runner);
  const effectiveRunner: SandboxRunnerKind | "blocked" = runnerAvailable ? state.runner : "blocked";
  // 실행은 build 모드 + 사용 가능 runner일 때만 시도된다. 그래도 approval/sandbox는 우회 안 함.
  const executionMode: "none" | "sandboxed" = state.mode === "build" && runnerAvailable ? "sandboxed" : "none";

  const invariants: string[] = [
    "thinking effort는 품질/비용 힌트일 뿐 권한을 올리지 않는다",
    "Build 모드여도 approval/sandbox를 우회하지 않는다",
  ];
  if (!runnerAvailable) invariants.push(`runner '${state.runner}'가 사용 불가 → blocked`);
  if (state.mode !== "build") invariants.push(`${state.mode} 모드 — 실행하지 않는다(관측/계획)`);

  return {
    modelId: state.modelId,
    mode: state.mode,
    thinking: state.thinking,
    // 핵심: mode/thinking과 무관하게 toolPermission이 그대로 유효 권한이다(에스컬레이션 없음).
    effectiveToolPermission: state.toolPermission,
    effectiveRunner,
    runnerAvailable,
    executionMode,
    invariants,
  };
}
