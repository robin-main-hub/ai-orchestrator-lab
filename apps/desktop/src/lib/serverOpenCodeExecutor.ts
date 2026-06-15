import { requestTmuxCapture, requestTmuxDispatch } from "../runtime/stage33TmuxServer";
import { parseOpenCodeJsonStream, type OpenCodeExecutor } from "./openCodeRunner";

/**
 * OpenCode adapter의 실제 실행 effect — `opencode run …` argv를 dgx-02의 게이트(dispatch
 * → 승인 → send-keys)로 보내고, pane의 --format json 출력을 capture해 이벤트로 파싱한다.
 *
 * 정직성(H8a serverShellExecutor와 동일선): send-keys 게이트가 꺼져 있거나 dgx-02에
 * opencode가 없으면 dispatch가 "sent"가 아니므로 observed:false + 사유를 그대로 전달한다
 * (가짜 성공 금지). 게이트가 켜지고 opencode가 설치되면 같은 코드가 실제 실행한다.
 */
export function createServerOpenCodeExecutor(input: {
  serverBaseUrl?: string | string[];
  sessionId: string;
  role?: "code" | "qa" | "architect" | "research";
  tmuxSessionName?: string;
  captureLines?: number;
}): OpenCodeExecutor {
  let seq = 0;
  const role = input.role ?? "code";
  const tmuxSessionName = input.tmuxSessionName ?? "ai-swarm";
  return async (exec, onEvent) => {
    seq += 1;
    const command = `opencode ${exec.argv.map(shellQuote).join(" ")}`;
    try {
      const dispatch = await requestTmuxDispatch({
        request: {
          id: `oc_${input.sessionId}_${seq}`,
          sessionId: input.sessionId,
          role,
          commandPreview: command,
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName,
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl: input.serverBaseUrl,
      });
      const status = dispatch.dispatch.status;
      if (status !== "sent") {
        return {
          events: [],
          observed: false,
          blockedReason:
            status === "pending_approval" || status === "recorded"
              ? "승인 대기 — 관제판 큐에서 승인하면 opencode가 실행됩니다."
              : `실행 불가 (${status}): ${dispatch.dispatch.reason}`,
        };
      }
      const capture = await requestTmuxCapture({
        request: {
          id: `occap_${input.sessionId}_${seq}`,
          sessionId: input.sessionId,
          role,
          lines: input.captureLines ?? 400,
          tmuxSessionName,
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl: input.serverBaseUrl,
      });
      if (capture.status === "captured" && capture.payload) {
        const events = parseOpenCodeJsonStream(capture.payload.outputPreview);
        for (const event of events) onEvent(event);
        return { events, observed: true };
      }
      return { events: [], observed: false, blockedReason: `출력 캡처 실패: ${capture.reason ?? "도달 불가"}` };
    } catch (error) {
      return { events: [], observed: false, blockedReason: `서버 도달 불가: ${error instanceof Error ? error.message : String(error)}` };
    }
  };
}

/** 공백/특수문자가 있는 argv 요소만 작은따옴표로 감싼다(가벼운 인용 — arbitrary shell 아님) */
function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
