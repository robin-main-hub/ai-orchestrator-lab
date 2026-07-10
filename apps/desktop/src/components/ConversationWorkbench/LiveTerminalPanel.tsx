import { useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw, SendHorizontal } from "lucide-react";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import { requestTmuxCapture, requestTmuxDispatch } from "../../runtime/stage33TmuxServer";
import {
  applyCapture,
  createLiveTerminalState,
  setPolling,
  setRole,
  startLiveCaptureLoop,
  SWARM_ROLE_LABEL,
  SWARM_ROLES,
  type LiveTerminalState,
} from "../../lib/liveTerminal";

/**
 * 진짜 터미널 — ai-swarm tmux pane의 실제 출력을 capture-pane으로 폴링해 보여준다
 * (읽기 전용, 승인 게이트 불필요). 명령 전송은 기존 dispatch 게이트(승인→replay→
 * send-keys)를 그대로 탄다. 서버가 unreachable이거나 send-keys 게이트가 꺼져
 * 있으면 상태로 정직하게 표시한다.
 */
export function LiveTerminalPanel({
  sessionId,
  serverBaseUrl,
  tmuxSessionName = "ai-swarm",
}: {
  sessionId: string;
  serverBaseUrl?: string | string[];
  tmuxSessionName?: string;
}) {
  const [state, setState] = useState<LiveTerminalState>(() =>
    createLiveTerminalState({ role: "orchestrator", sessionName: tmuxSessionName }),
  );
  const [auto, setAuto] = useState(true);
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const idSeq = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const captureOnce = async () => {
    const current = stateRef.current;
    setState((prev) => setPolling(prev));
    try {
      const response = await requestTmuxCapture({
        request: {
          id: `term_${sessionId}_${idSeq.current++}`,
          sessionId,
          role: current.role,
          lines: 200,
          tmuxSessionName: current.sessionName,
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl,
      });
      const now = new Date().toISOString();
      if (response.status === "captured" && response.payload) {
        setState((prev) =>
          applyCapture(
            prev,
            {
              status: "captured",
              output: response.payload!.outputPreview,
              paneId: response.payload!.paneId,
              lineCount: response.payload!.lineCount,
            },
            now,
          ),
        );
      } else if (response.status === "disabled") {
        setState((prev) => applyCapture(prev, { status: "disabled", reason: response.reason }, now));
      } else {
        setState((prev) => applyCapture(prev, { status: "failed", reason: response.reason ?? "capture 실패" }, now));
      }
    } catch (error) {
      setState((prev) =>
        applyCapture(
          prev,
          { status: "failed", reason: error instanceof Error ? error.message : String(error) },
          new Date().toISOString(),
        ),
      );
    }
  };

  // 자동 폴링 (2초). 역할/세션/auto 변경 시 재시작.
  useEffect(() => {
    if (!auto) return;
    const loop = startLiveCaptureLoop({ intervalMs: 2000, tick: captureOnce });
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, state.role, state.sessionName]);

  // 출력 갱신 시 맨 아래로 스크롤
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.output]);

  const onSend = async () => {
    const text = command.trim();
    if (!text || sending) return;
    setSending(true);
    setSendNote("게이트로 전송 중…");
    try {
      const response = await requestTmuxDispatch({
        request: {
          id: `termcmd_${sessionId}_${idSeq.current++}`,
          sessionId,
          role: state.role,
          commandPreview: text,
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: state.sessionName,
          createdAt: new Date().toISOString(),
        },
        serverBaseUrl,
      });
      const status = response.dispatch.status;
      if (status === "sent" || status === "dry_run") {
        setSendNote(status === "sent" ? "전송됨 — 출력은 곧 위에 나타납니다." : "기록됨 (서버 dry-run).");
        setCommand("");
      } else if (status === "pending_approval" || status === "recorded") {
        setSendNote("승인 대기 — 관제판 큐에서 승인하면 실행됩니다.");
        setCommand("");
      } else {
        setSendNote(`전송 실패: ${response.dispatch.reason}`);
      }
    } catch (error) {
      setSendNote(`전송 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSending(false);
    }
  };

  const statusBadge = {
    idle: { label: "대기", tone: "text-muted-foreground" },
    polling: { label: "갱신 중", tone: "text-primary" },
    live: { label: "● LIVE", tone: "text-primary" },
    disabled: { label: "send-keys 비활성", tone: "text-warning" },
    error: { label: "오프라인", tone: "text-destructive" },
  }[state.status];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <select
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-foreground"
          onChange={(event) => setState((prev) => setRole(prev, event.target.value as TmuxPaneRole))}
          value={state.role}
        >
          {SWARM_ROLES.map((role) => (
            <option key={role} value={role}>
              {SWARM_ROLE_LABEL[role]} pane
            </option>
          ))}
        </select>
        <span className={`text-[10px] font-semibold ${statusBadge.tone}`}>{statusBadge.label}</span>
        {state.paneId ? <span className="font-mono text-[10px] text-muted-foreground">{state.paneId}</span> : null}
        <span className="flex-1" />
        <button
          aria-label={auto ? "자동 갱신 끄기" : "자동 갱신 켜기"}
          className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          onClick={() => setAuto((value) => !value)}
          title={auto ? "자동 갱신 중 (2초)" : "자동 갱신 꺼짐"}
          type="button"
        >
          {auto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          aria-label="지금 갱신"
          className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          onClick={() => void captureOnce()}
          title="지금 갱신"
          type="button"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <pre
        className="min-h-0 flex-1 overflow-auto bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed text-foreground"
        ref={scrollRef}
      >
        {state.status === "error"
          ? `서버에 연결할 수 없습니다.\n${state.error ?? ""}\n\n(dgx-02 오케스트레이터 서버와 tmux 세션이 떠 있어야 합니다.)`
          : state.output || (state.status === "disabled" ? state.error ?? "" : "출력 대기 중…")}
      </pre>

      <div className="shrink-0 border-t border-white/10 p-2">
        <div className="flex items-end gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-foreground outline-none focus-visible:border-primary/40"
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void onSend();
              }
            }}
            placeholder={`${SWARM_ROLE_LABEL[state.role]} pane에 명령 전송 (게이트 통과)`}
            value={command}
          />
          <button
            className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary disabled:opacity-40"
            disabled={sending || !command.trim()}
            onClick={() => void onSend()}
            type="button"
          >
            <SendHorizontal className="h-3.5 w-3.5" /> 전송
          </button>
        </div>
        {sendNote ? <p className="mt-1 px-1 text-[10.5px] text-muted-foreground">{sendNote}</p> : null}
      </div>
    </div>
  );
}
