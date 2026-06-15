import { useRef, useState } from "react";
import { CircleStop, FileDiff, Play, TerminalSquare } from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import {
  appendRunnerLog,
  createMockCodingRunner,
  initialRunnerState,
  isMutatingRun,
  settleRunnerState,
  startRunnerState,
  setRunnerStatus,
  summarizeChangedFiles,
  type CodingRunHandle,
  type CodingRunner,
  type CodingRunnerState,
  type CodingRunnerTool,
} from "../../lib/codingRunner";
import { createLocalShellCodingRunner } from "../../lib/localShellRunner";
import { createServerShellExecutor } from "../../lib/serverShellExecutor";
import { createOpenCodeRunner } from "../../lib/openCodeRunner";
import { createServerOpenCodeExecutor } from "../../lib/serverOpenCodeExecutor";
import { cn } from "@/lib/utils";

/** opencode runner 기본 모델 (provider/model) */
const OPENCODE_MODEL = "anthropic/claude-sonnet-4-6";

/**
 * H8 — Mission Workspace의 "Coding Runner" 섹션.
 *
 * OpenCode 스타일 코딩 run을 미션 워크스페이스에서 직접: Run / Stop / 라이브 로그 /
 * 변경 제안 diff / 테스트 요약 / 실패 시 에러 요약. 첫 버전은 mock runner를 기본으로
 * 물린다(runner prop으로 진짜 runner 주입 가능). runner는 변경을 *제안*만 하고,
 * 적용·GitHub write는 별도 승인 단계의 몫 — 이 카드는 절대 자동 적용하지 않는다.
 */

const STATUS_BADGE: Record<CodingRunnerState["status"], { label: string; variant: StatusBadgeVariant }> = {
  idle: { label: "대기", variant: "muted" },
  running: { label: "실행 중", variant: "primary" },
  completed: { label: "완료", variant: "success" },
  failed: { label: "실패", variant: "danger" },
  stopped: { label: "중지됨", variant: "warning" },
};

export function CodingRunnerCard({
  missionId,
  repoRoot,
  defaultPrompt,
  allowedTools = ["read", "grep", "glob", "edit", "test"],
  runner,
  sessionId,
  serverBaseUrl,
}: {
  missionId: string;
  repoRoot?: string;
  defaultPrompt?: string;
  allowedTools?: CodingRunnerTool[];
  /** 주입 안 하면 kind 토글(mock/local) — 진짜 OpenCode runner도 같은 인터페이스로 교체 */
  runner?: CodingRunner;
  /** local 실행을 dgx-02 게이트로 보낼 때 필요 */
  sessionId?: string;
  serverBaseUrl?: string | string[];
}) {
  const [prompt, setPrompt] = useState(defaultPrompt ?? "");
  const [kind, setKind] = useState<"mock" | "local" | "opencode">("mock");
  const [state, setState] = useState<CodingRunnerState>(initialRunnerState);
  const handleRef = useRef<CodingRunHandle | null>(null);
  const activeRunner =
    runner ??
    (kind === "local" && sessionId
      ? createLocalShellCodingRunner({ execute: createServerShellExecutor({ serverBaseUrl, sessionId }) })
      : kind === "opencode" && sessionId
        ? createOpenCodeRunner({ execute: createServerOpenCodeExecutor({ serverBaseUrl, sessionId }), model: OPENCODE_MODEL })
        : createMockCodingRunner());

  const canRun = state.status !== "running" && prompt.trim().length > 0 && Boolean(repoRoot);
  const mutating = isMutatingRun(allowedTools);

  const run = () => {
    if (!canRun || !repoRoot) return;
    setState(startRunnerState(initialRunnerState(), { missionId, repoRoot, prompt: prompt.trim(), allowedTools }));
    const handle = activeRunner.run(
      { missionId, repoRoot, prompt: prompt.trim(), allowedTools },
      {
        onLog: (chunk) => setState((prev) => appendRunnerLog(prev, chunk)),
        onStatus: (status) => setState((prev) => setRunnerStatus(prev, status)),
      },
    );
    handleRef.current = handle;
    void handle.done.then((result) => setState((prev) => settleRunnerState(prev, result)));
  };

  const stop = () => handleRef.current?.stop();

  const result = state.result;
  const badge = STATUS_BADGE[state.status];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <header className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
          <TerminalSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-zinc-100">Coding Runner</p>
          <p className="truncate text-[10.5px] text-zinc-500">
            {repoRoot ? `${activeRunner.label} · ${repoRoot}` : "repo 워크스페이스 미연결"}
          </p>
        </div>
        {!runner ? (
          <div className="mr-1 hidden items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5 sm:inline-flex">
            <button
              aria-pressed={kind === "mock"}
              className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium", kind === "mock" ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-500 hover:text-zinc-200")}
              disabled={state.status === "running"}
              onClick={() => setKind("mock")}
              title="시뮬레이션 — 실제 실행 없음"
              type="button"
            >
              mock
            </button>
            <button
              aria-pressed={kind === "local"}
              className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium", kind === "local" ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-500 hover:text-zinc-200")}
              disabled={state.status === "running" || !sessionId}
              onClick={() => setKind("local")}
              title={sessionId ? "local shell — preset 진단 명령을 dgx-02 게이트로 실행" : "세션 필요"}
              type="button"
            >
              local
            </button>
            <button
              aria-pressed={kind === "opencode"}
              className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium", kind === "opencode" ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-500 hover:text-zinc-200")}
              disabled={state.status === "running" || !sessionId}
              onClick={() => setKind("opencode")}
              title={sessionId ? "opencode — 읽기전용 코딩 에이전트를 dgx-02 게이트로 실행" : "세션 필요"}
              type="button"
            >
              opencode
            </button>
          </div>
        ) : null}
        <StatusBadge size="sm" variant={badge.variant}>{badge.label}</StatusBadge>
      </header>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          className="min-h-[40px] min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus-visible:border-cyan-400/40"
          disabled={state.status === "running"}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={!repoRoot ? "프리뷰가 관측된 미션에서만 실행 가능" : kind === "local" ? "local: preset 진단(status/diff/typecheck)을 실행 — 프롬프트는 의도 메모" : "이 repo에서 코딩 에이전트에게 시킬 일…"}
          rows={2}
          value={prompt}
        />
        {state.status === "running" ? (
          <button
            className="flex shrink-0 items-center gap-1 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-[12px] font-semibold text-rose-100"
            onClick={stop}
            type="button"
          >
            <CircleStop className="h-3.5 w-3.5" /> 중지
          </button>
        ) : (
          <button
            className="flex shrink-0 items-center gap-1 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-[12px] font-semibold text-cyan-100 disabled:opacity-40"
            disabled={!canRun}
            onClick={run}
            title={!repoRoot ? "repo 워크스페이스가 필요합니다" : "코딩 run 시작"}
            type="button"
          >
            <Play className="h-3.5 w-3.5" /> 실행
          </button>
        )}
      </div>

      {mutating ? (
        <p className="mt-1.5 text-[10px] text-amber-300/80">
          변경 도구 허용됨 — runner는 변경을 <strong>제안</strong>만 하고, 적용·커밋·PR은 승인 후 별도 단계입니다.
        </p>
      ) : (
        <p className="mt-1.5 text-[10px] text-zinc-500">읽기 전용 run — 변경 제안 없음.</p>
      )}

      {state.logs.length > 0 ? (
        <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-[#07070a] p-2 font-mono text-[10.5px] leading-relaxed">
          {state.logs.map((chunk, index) => (
            <div className={cn("whitespace-pre-wrap", logTone(chunk.stream))} key={index}>
              <span className="text-zinc-600">{chunk.stream}</span> {chunk.text}
            </div>
          ))}
        </pre>
      ) : null}

      {result ? (
        <div className="mt-2 space-y-2">
          {result.errorSummary ? (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
              {result.errorSummary}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <FileDiff className="h-3.5 w-3.5 text-zinc-500" /> {summarizeChangedFiles(result.changedFiles)}
            </span>
            {result.testResult.ran ? (
              <span className={result.testResult.failed > 0 ? "text-rose-300" : "text-teal-300"}>
                테스트 {result.testResult.passed}통과{result.testResult.failed > 0 ? ` · ${result.testResult.failed}실패` : ""}
                {result.testResult.durationMs ? ` (${(result.testResult.durationMs / 1000).toFixed(1)}s)` : ""}
              </span>
            ) : null}
            {!result.observed ? <span className="text-[10px] text-zinc-600">시뮬레이션 (미관측)</span> : null}
          </div>

          {result.changedFiles.length > 0 ? (
            <ul className="space-y-0.5">
              {result.changedFiles.map((file) => (
                <li className="flex items-center gap-2 font-mono text-[10.5px]" key={file.path}>
                  <span className={changeTone(file.change)}>{file.change[0]!.toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{file.path}</span>
                  <span className="shrink-0 text-zinc-600">+{file.additions} / -{file.deletions}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {result.diffSummary ? (
            <pre className="max-h-44 overflow-auto rounded-lg bg-[#07070a] p-2 font-mono text-[10.5px] leading-relaxed">
              {result.diffSummary.split("\n").map((line, index) => (
                <div className={diffTone(line)} key={index}>{line}</div>
              ))}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function logTone(stream: string): string {
  return stream === "stderr" ? "text-rose-300" : stream === "tool" ? "text-violet-200" : stream === "system" ? "text-zinc-500" : "text-zinc-300";
}
function changeTone(change: string): string {
  return change === "added" ? "text-teal-300" : change === "deleted" ? "text-rose-300" : "text-amber-300";
}
function diffTone(line: string): string {
  if (line.startsWith("+")) return "text-teal-300";
  if (line.startsWith("-")) return "text-rose-300";
  if (line.startsWith("@@")) return "text-cyan-300";
  return "text-zinc-500";
}
