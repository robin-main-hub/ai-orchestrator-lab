import {
  resolveControlStrip,
  type ControlStripAvailability,
  type ControlStripState,
  type SandboxRunnerKind,
} from "@ai-orchestrator/protocol";

/**
 * ControlStrip (D8) — Model / Mode / Thinking / Tool permission / Runner를 한 줄에서 통제하는
 * 최소 프레젠테이션 컴포넌트. 권한의 단일 진실이 아니다 — resolveControlStrip이 강제하는
 * 불변식(thinking≠권한, build≠우회, unavailable runner=blocked)을 그대로 보여준다.
 *
 * 레이아웃 통합은 UI 트랙. 여기서는 자체 완결 컴포넌트 + 정직한 유효 상태 표시만.
 */

const MODES: ControlStripState["mode"][] = ["plan", "build", "review"];
const THINKING: ControlStripState["thinking"][] = ["low", "medium", "high", "auto"];
const PERMISSIONS: ControlStripState["toolPermission"][] = ["read_only", "verify", "build", "approval_required"];
const ALL_RUNNERS: SandboxRunnerKind[] = ["local", "docker", "gvisor", "tmux_observation"];

export type ControlStripProps = {
  state: ControlStripState;
  availability: ControlStripAvailability;
  onChange?: (next: ControlStripState) => void;
};

export function ControlStrip({ state, availability, onChange }: ControlStripProps) {
  const resolved = resolveControlStrip(state, availability);
  const set = (patch: Partial<ControlStripState>) => onChange?.({ ...state, ...patch });

  return (
    <div className="control-strip" role="group" aria-label="모델·모드·도구·러너 컨트롤">
      <label className="control-strip__field">
        <span>모델</span>
        <select value={state.modelId} onChange={(e) => set({ modelId: e.target.value })}>
          {(availability.models.length ? availability.models : [state.modelId]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="control-strip__field">
        <span>모드</span>
        <select value={state.mode} onChange={(e) => set({ mode: e.target.value as ControlStripState["mode"] })}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="control-strip__field">
        <span>사고</span>
        <select value={state.thinking} onChange={(e) => set({ thinking: e.target.value as ControlStripState["thinking"] })}>
          {THINKING.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="control-strip__field">
        <span>도구 권한</span>
        <select value={state.toolPermission} onChange={(e) => set({ toolPermission: e.target.value as ControlStripState["toolPermission"] })}>
          {PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="control-strip__field">
        <span>러너</span>
        <select value={state.runner} onChange={(e) => set({ runner: e.target.value as SandboxRunnerKind })}>
          {ALL_RUNNERS.map((r) => {
            const available = availability.runners.includes(r);
            return (
              <option key={r} value={r} disabled={!available}>
                {r}
                {available ? "" : " (사용 불가)"}
              </option>
            );
          })}
        </select>
      </label>

      <output className="control-strip__effective" aria-live="polite">
        <span className={`control-strip__exec control-strip__exec--${resolved.executionMode}`}>
          {resolved.executionMode === "sandboxed" ? "샌드박스 실행" : "실행 안 함"}
        </span>
        <span className="control-strip__perm">권한 {resolved.effectiveToolPermission}</span>
        <span className={`control-strip__runner${resolved.runnerAvailable ? "" : " control-strip__runner--blocked"}`}>
          러너 {resolved.effectiveRunner}
        </span>
      </output>

      <ul className="control-strip__invariants">
        {resolved.invariants.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
