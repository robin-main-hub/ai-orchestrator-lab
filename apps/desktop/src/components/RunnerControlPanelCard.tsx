import { ShieldCheck, ShieldX, Eye, EyeOff, Lock, PlugZap, Unplug } from "lucide-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  RUNNER_SAFE_PRESETS,
  deriveRunnerGateStatus,
  type RunnerGateMode,
} from "../lib/runnerGateStatus";

/**
 * LINE G — Runner Control Panel Card (presentational).
 *
 * 게이트/모드/관측/승인 상태를 *표시*만 한다. 실행을 켜는 버튼은 없다.
 * 모드 토글은 display-only(onModeSelect는 표시 선택만 — 실행/게이트와 무관).
 * disabled/executor 부재를 명확히 보여준다(정직). 렌더 시 어떤 enable 액션도 트리거하지 않는다.
 */

const MODE_ORDER: RunnerGateMode[] = [
  "mock",
  "local_read_only",
  "opencode_read_only",
  "dgx_disabled",
];

export function RunnerControlPanelCard({
  mode,
  dgxExecutionEnabled = false,
  executorPresent = false,
  onModeSelect,
}: {
  mode: RunnerGateMode;
  /** dgx 게이트 상태(주입). 기본 false — 카드는 절대 켜지 않는다. */
  dgxExecutionEnabled?: boolean;
  executorPresent?: boolean;
  /** display-only 모드 선택. 실행/게이트와 무관. */
  onModeSelect?: (mode: RunnerGateMode) => void;
}) {
  const status = deriveRunnerGateStatus({ mode, dgxExecutionEnabled, executorPresent });
  const preset = RUNNER_SAFE_PRESETS[mode];

  return (
    <Card data-testid="runner-control-panel" data-mode={status.mode} data-observed={status.observed}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4 text-cyan-300/80" />
          Runner 운영 컨트롤
          <Badge
            variant={status.dgxExecutionEnabled ? "default" : "outline"}
            data-testid="runner-control-gate-badge"
            data-gate={status.dgxExecutionEnabled ? "on" : "off"}
          >
            {status.dgxExecutionEnabled ? (
              <ShieldCheck className="mr-1 inline h-3 w-3" />
            ) : (
              <ShieldX className="mr-1 inline h-3 w-3" />
            )}
            dgx 실행 {status.dgxExecutionEnabled ? "ON" : "OFF"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 모드 토글 — display only, 실행/게이트 변경 0 */}
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
          data-testid="runner-control-mode-toggle"
          role="group"
          aria-label="runner mode (display only)"
        >
          {MODE_ORDER.map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={m === mode ? "default" : "ghost"}
              aria-pressed={m === mode}
              data-testid={`runner-control-mode-${m}`}
              onClick={() => onModeSelect?.(m)}
              title={RUNNER_SAFE_PRESETS[m].description}
            >
              {RUNNER_SAFE_PRESETS[m].label}
            </Button>
          ))}
        </div>

        {/* observed 상태 */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge
            variant={status.observed ? "default" : "destructive"}
            data-testid="runner-control-observed-badge"
            data-observed={status.observed}
          >
            {status.observed ? (
              <Eye className="mr-1 inline h-3 w-3" />
            ) : (
              <EyeOff className="mr-1 inline h-3 w-3" />
            )}
            observed: {status.observed ? "true" : "false"}
          </Badge>

          <Badge
            variant={status.executorPresent ? "outline" : "destructive"}
            data-testid="runner-control-executor-badge"
            data-executor={status.executorPresent ? "present" : "missing"}
          >
            {status.executorPresent ? (
              <PlugZap className="mr-1 inline h-3 w-3" />
            ) : (
              <Unplug className="mr-1 inline h-3 w-3" />
            )}
            executor: {status.executorPresent ? "연결됨" : "없음"}
          </Badge>

          <Badge
            variant={status.approvalRequired ? "outline" : "secondary"}
            data-testid="runner-control-approval-badge"
            data-approval-required={status.approvalRequired}
          >
            승인 {status.approvalRequired ? "필요" : "불필요 (read-only)"}
          </Badge>

          {preset.readOnly ? (
            <Badge variant="secondary" data-testid="runner-control-readonly-badge">
              read-only 프리셋
            </Badge>
          ) : null}
        </div>

        {/* 사람이 읽는 사유 — disabled/missing executor 정직하게 표시 */}
        <p className="text-[11px] text-muted-foreground" data-testid="runner-control-reason">
          {status.reason}
        </p>
        <p className="text-[11px] text-muted-foreground" data-testid="runner-control-mode-desc">
          {preset.description}
        </p>

        {!status.observed ? (
          <p
            className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200"
            data-testid="runner-control-disabled-notice"
          >
            {status.dgxExecutionEnabled
              ? "executor 미연결 — 관측 불가. 가짜 성공을 보고하지 않습니다."
              : "dgx 실행 게이트 비활성 (기본값) — 관측·실행 없음. 활성화는 운영 승인 영역."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
