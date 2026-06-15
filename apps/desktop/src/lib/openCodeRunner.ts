import type {
  ChangedFileSummary,
  CodingLogStream,
  CodingRunHandle,
  CodingRunRequest,
  CodingRunResult,
  CodingRunner,
  CodingRunnerHooks,
  CodingRunnerTool,
  TestResultSummary,
} from "./codingRunner";
import { redactSecrets } from "./localShellRunner";

/**
 * H8b — OpenCode adapter (same CodingRunner interface, NOT a full port).
 *
 * `opencode run --format json --dir <repoRoot> --model <p/m> --allowedTools <…> <prompt>`
 * 를 감싸는 얇은 어댑터. 실제 프로세스 실행은 주입된 OpenCodeExecutor(서버 경유)에
 * 위임 → 코어는 순수·헤드리스 테스트 가능. 출력(--format json 이벤트 스트림)을
 * 우리 CodingRunResult로 환원한다.
 *
 * 안전(불변, H8a와 동일선):
 *  - 읽기전용 강제 — allowedTools를 read/grep/glob/list/webfetch로 필터(write/edit/bash 제거).
 *    파일 수정/적용은 별도 승인 단계. opencode가 보고한 file_edit는 *제안*으로만 표시.
 *  - `--dangerously-skip-permissions` 절대 안 붙인다.
 *  - 자동 GitHub write/PR/commit 0. observed=true는 실제 실행 관측 시에만.
 */

/** opencode가 --format json으로 흘리는 이벤트의 관용 union (스키마 변동에 방어적) */
export type OpenCodeEvent =
  | { type: "message"; text: string }
  | { type: "tool"; name: string; status?: string; detail?: string }
  | { type: "file_edit"; path: string; additions?: number; deletions?: number; diff?: string }
  | { type: "test"; passed?: number; failed?: number }
  | { type: "error"; message: string }
  | { type: "done"; ok: boolean };

export type OpenCodeExecInput = {
  /** "opencode" 다음의 argv (run --format json …) */
  argv: string[];
  repoRoot: string;
  signal: AbortSignal;
};

export type OpenCodeExecResult = {
  events: OpenCodeEvent[];
  /** 실제 opencode 프로세스가 실행됐는가 (미설치/게이트 off면 false) */
  observed: boolean;
  blockedReason?: string;
};

export type OpenCodeExecutor = (
  input: OpenCodeExecInput,
  onEvent: (event: OpenCodeEvent) => void,
) => Promise<OpenCodeExecResult>;

export type OpenCodeRunnerDeps = {
  execute: OpenCodeExecutor;
  /** provider/model (예: anthropic/claude-sonnet-4-6) */
  model: string;
  /** 떠 있는 `opencode serve`에 attach (cold boot 회피) */
  attachUrl?: string;
  now?: () => string;
  redact?: (text: string) => string;
  label?: string;
};

// ── 도구 매핑 + 읽기전용 안전 필터 (순수) ──

/** 우리 CodingRunnerTool → opencode 도구 이름 */
const TOOL_TO_OPENCODE: Record<CodingRunnerTool, string> = {
  read: "read",
  grep: "grep",
  glob: "glob",
  bash: "bash",
  write: "write",
  edit: "edit",
  test: "bash", // 테스트 실행은 bash 경유 — 읽기전용 필터에서 걸러짐
};

/** 읽기전용 안전 집합 — 변경/실행 도구 제외 */
const READ_ONLY_OPENCODE_TOOLS = new Set(["read", "grep", "glob", "list", "webfetch"]);

/** allowedTools를 opencode 이름으로 매핑하고 읽기전용으로 필터. dropped도 함께 반환(로그용) */
export function safeOpenCodeTools(tools: ReadonlyArray<CodingRunnerTool>): { allowed: string[]; dropped: string[] } {
  const mapped = Array.from(new Set(tools.map((tool) => TOOL_TO_OPENCODE[tool])));
  const allowed = mapped.filter((tool) => READ_ONLY_OPENCODE_TOOLS.has(tool));
  const dropped = mapped.filter((tool) => !READ_ONLY_OPENCODE_TOOLS.has(tool));
  // 읽기 도구가 하나도 없으면 최소 read는 보장
  if (allowed.length === 0) allowed.push("read");
  return { allowed, dropped };
}

/** opencode run argv 빌더 (순수). --dangerously-skip-permissions 안 붙임. */
export function buildOpenCodeArgv(
  request: CodingRunRequest,
  opts: { model: string; attachUrl?: string },
): { argv: string[]; droppedTools: string[] } {
  const { allowed, dropped } = safeOpenCodeTools(request.allowedTools);
  const argv = ["run", "--format", "json", "--dir", request.repoRoot, "--model", opts.model, "--allowedTools", allowed.join(",")];
  if (opts.attachUrl) argv.push("--attach", opts.attachUrl);
  argv.push(request.prompt);
  return { argv, droppedTools: dropped };
}

// ── --format json pane 출력 → 이벤트 (순수, 관용 파서) ──

/**
 * opencode `--format json`은 JSON 이벤트를 줄단위로 흘린다(정확한 스키마는 버전마다
 * 다를 수 있어 방어적으로 파싱). 알 수 없는 줄은 message로 흡수해 실제 출력을 잃지 않는다.
 */
export function parseOpenCodeJsonStream(text: string): OpenCodeEvent[] {
  const events: OpenCodeEvent[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (!(line.startsWith("{") && line.endsWith("}"))) continue; // 사람용 줄/프롬프트 무시
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = String(obj.type ?? obj.event ?? "");
    if (type.includes("error") || obj.error) {
      events.push({ type: "error", message: String(obj.message ?? obj.error ?? "error") });
    } else if (type.includes("edit") || type.includes("file") || obj.path) {
      events.push({
        type: "file_edit",
        path: String(obj.path ?? obj.file ?? "unknown"),
        additions: numberOr(obj.additions),
        deletions: numberOr(obj.deletions),
        diff: typeof obj.diff === "string" ? obj.diff : undefined,
      });
    } else if (type.includes("tool")) {
      events.push({ type: "tool", name: String(obj.name ?? obj.tool ?? "tool"), status: optString(obj.status), detail: optString(obj.detail) });
    } else if (type.includes("test")) {
      events.push({ type: "test", passed: numberOr(obj.passed), failed: numberOr(obj.failed) });
    } else if (type.includes("done") || type.includes("finish") || type.includes("complete")) {
      events.push({ type: "done", ok: obj.ok !== false });
    } else {
      const text = String(obj.text ?? obj.content ?? obj.message ?? "");
      if (text) events.push({ type: "message", text });
    }
  }
  return events;
}

function numberOr(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function optString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// ── 이벤트 스트림 → CodingRunResult 필드 (순수) ──

export function reduceOpenCodeEvents(
  events: ReadonlyArray<OpenCodeEvent>,
  now: () => string,
  redact: (text: string) => string,
): {
  logChunks: { at: string; stream: CodingLogStream; text: string }[];
  changedFiles: ChangedFileSummary[];
  diffSummary: string;
  testResult: TestResultSummary;
  errorSummary?: string;
} {
  const logChunks: { at: string; stream: CodingLogStream; text: string }[] = [];
  const changedFiles: ChangedFileSummary[] = [];
  const diffs: string[] = [];
  let testResult: TestResultSummary = { ran: false, passed: 0, failed: 0 };
  let errorSummary: string | undefined;
  const log = (stream: CodingLogStream, text: string) => logChunks.push({ at: now(), stream, text: redact(text) });

  for (const event of events) {
    switch (event.type) {
      case "message":
        log("stdout", event.text);
        break;
      case "tool":
        log("tool", `${event.name}${event.status ? ` → ${event.status}` : ""}${event.detail ? `: ${event.detail}` : ""}`);
        break;
      case "file_edit":
        // 제안일 뿐 — 우리가 적용하지 않는다
        changedFiles.push({
          path: event.path,
          change: "modified",
          additions: event.additions ?? 0,
          deletions: event.deletions ?? 0,
        });
        if (event.diff) diffs.push(event.diff);
        log("tool", `edit 제안: ${event.path}`);
        break;
      case "test":
        testResult = { ran: true, passed: event.passed ?? 0, failed: event.failed ?? 0 };
        break;
      case "error":
        errorSummary = redact(event.message).slice(0, 240);
        log("stderr", event.message);
        break;
      case "done":
        break;
      default:
        break;
    }
  }
  return { logChunks, changedFiles, diffSummary: redact(diffs.join("\n")), testResult, errorSummary };
}

export function createOpenCodeRunner(deps: OpenCodeRunnerDeps): CodingRunner {
  const now = deps.now ?? (() => new Date().toISOString());
  const redact = deps.redact ?? redactSecrets;

  return {
    id: "opencode",
    label: deps.label ?? "OpenCode Runner",
    observes: true,
    run(request, hooks?: CodingRunnerHooks): CodingRunHandle {
      const controller = new AbortController();
      const live: { at: string; stream: CodingLogStream; text: string }[] = [];
      const emit = (stream: CodingLogStream, text: string) => {
        const chunk = { at: now(), stream, text: redact(text) };
        live.push(chunk);
        hooks?.onLog?.(chunk);
      };

      const done = (async (): Promise<CodingRunResult> => {
        const startedAt = now();
        hooks?.onStatus?.("running");
        const { argv, droppedTools } = buildOpenCodeArgv(request, { model: deps.model, attachUrl: deps.attachUrl });
        emit("system", `opencode ${argv.join(" ")}`);
        if (droppedTools.length > 0) {
          emit("system", `읽기전용 강제 — 제외된 변경 도구: ${droppedTools.join(", ")} (적용은 별도 승인)`);
        }

        let result: OpenCodeExecResult;
        try {
          result = await deps.execute({ argv, repoRoot: request.repoRoot, signal: controller.signal }, (event) => {
            // 라이브 스트리밍 — message/tool/error만 즉시 로그
            if (event.type === "message") emit("stdout", event.text);
            else if (event.type === "tool") emit("tool", `${event.name}${event.status ? ` → ${event.status}` : ""}`);
            else if (event.type === "error") emit("stderr", event.message);
          });
        } catch (error) {
          const reason = `opencode 실행 실패: ${error instanceof Error ? error.message : String(error)}`;
          emit("stderr", reason);
          hooks?.onStatus?.("failed");
          return base("failed", live, [], "", { ran: false, passed: 0, failed: 0 }, startedAt, now(), false, reason);
        }

        if (controller.signal.aborted) {
          emit("system", "사용자 중지 — opencode 프로세스 종료");
          hooks?.onStatus?.("stopped");
          return base("stopped", live, [], "", { ran: false, passed: 0, failed: 0 }, startedAt, now(), result.observed);
        }

        if (!result.observed) {
          const reason = result.blockedReason ?? "opencode 미설치 또는 실행 게이트 off — dgx-02에 opencode가 있어야 합니다.";
          emit("system", reason);
          hooks?.onStatus?.("failed");
          return base("failed", live, [], "", { ran: false, passed: 0, failed: 0 }, startedAt, now(), false, reason);
        }

        const reduced = reduceOpenCodeEvents(result.events, now, redact);
        const failed = Boolean(reduced.errorSummary) || reduced.testResult.failed > 0;
        // 라이브 로그 + 환원 로그를 합쳐 최종 logChunks 구성(중복 없이 환원본 우선)
        const status = failed ? "failed" : "completed";
        hooks?.onStatus?.(status);
        return base(
          status,
          reduced.logChunks.length > 0 ? reduced.logChunks : live,
          reduced.changedFiles,
          reduced.diffSummary,
          reduced.testResult,
          startedAt,
          now(),
          true,
          reduced.errorSummary,
        );
      })();

      return { stop: () => controller.abort(), done };
    },
  };
}

function base(
  status: CodingRunResult["status"],
  logChunks: CodingRunResult["logChunks"],
  changedFiles: ChangedFileSummary[],
  diffSummary: string,
  testResult: TestResultSummary,
  startedAt: string,
  endedAt: string,
  observed: boolean,
  errorSummary?: string,
): CodingRunResult {
  return { status, logChunks, changedFiles, diffSummary, testResult, errorSummary, startedAt, endedAt, observed };
}
