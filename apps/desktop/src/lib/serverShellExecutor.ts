import { requestTmuxCapture, requestTmuxDispatch } from "../runtime/stage33TmuxServer";
import type { ShellExecutor } from "./localShellRunner";

/**
 * Local Shell Runner의 실제 실행 effect — preset 명령을 dgx-02의 게이트(dispatch →
 * 승인 → send-keys)로 보내고 pane 출력을 capture한다.
 *
 * 정직성: send-keys 실행 게이트(ENABLE_TMUX_SEND_KEYS)가 꺼져 있으면 dispatch가
 * "sent"가 아니라 blocked/recorded/dry_run을 돌려주므로, 여기서 observed:false +
 * 사유를 그대로 전달한다(가짜 성공 금지). 게이트가 켜지면 같은 코드가 실제 실행한다.
 */
export function createServerShellExecutor(input: {
  serverBaseUrl?: string | string[];
  sessionId: string;
  /** 명령을 보낼 swarm pane 역할 (기본 code) */
  role?: "code" | "qa" | "architect" | "research";
  tmuxSessionName?: string;
  captureLines?: number;
}): ShellExecutor {
  let seq = 0;
  const role = input.role ?? "code";
  const tmuxSessionName = input.tmuxSessionName ?? "ai-swarm";
  return async (exec, onLog) => {
    seq += 1;
    try {
      const dispatch = await requestTmuxDispatch({
        request: {
          id: `runner_${input.sessionId}_${seq}`,
          sessionId: input.sessionId,
          role,
          commandPreview: exec.command,
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName,
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl: input.serverBaseUrl,
      });
      const status = dispatch.dispatch.status;
      if (status !== "sent") {
        // 게이트 off / 승인 대기 / 차단 — 정직하게 미관측
        return {
          exitCode: -1,
          stdout: "",
          stderr: "",
          observed: false,
          blockedReason:
            status === "pending_approval" || status === "recorded"
              ? "승인 대기 — 관제판 큐에서 승인하면 실행됩니다."
              : `실행 불가 (${status}): ${dispatch.dispatch.reason}`,
        };
      }
      // 실행됨 — pane 출력 capture (best-effort). exit code는 pane으로 정확히 못 읽어 0으로 둔다.
      const capture = await requestTmuxCapture({
        request: {
          id: `runnercap_${input.sessionId}_${seq}`,
          sessionId: input.sessionId,
          role,
          lines: input.captureLines ?? 200,
          tmuxSessionName,
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl: input.serverBaseUrl,
      });
      if (capture.status === "captured" && capture.payload) {
        onLog("stdout", capture.payload.outputPreview);
        return { exitCode: 0, stdout: capture.payload.outputPreview, stderr: "", observed: true };
      }
      return {
        exitCode: -1,
        stdout: "",
        stderr: "",
        observed: false,
        blockedReason: `출력 캡처 실패: ${capture.reason ?? "도달 불가"}`,
      };
    } catch (error) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "",
        observed: false,
        blockedReason: `서버 도달 불가: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };
}
