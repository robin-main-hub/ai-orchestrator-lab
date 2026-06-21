import type {
  ChangedFileSummary,
  CodingRunHandle,
  CodingRunResult,
  CodingRunner,
  CodingRunnerHooks,
  CodingLogStream,
  TestResultSummary,
} from "./codingRunner";

/**
 * H8a — Local Shell Coding Runner.
 *
 * #521의 CodingRunner 인터페이스 뒤에 끼우는 *실제* runner. OpenCode를 통째로 이식하지
 * 않는다. 안전을 위해 **preset 진단 명령만** 실행한다(사용자 입력 arbitrary shell 금지,
 * 변경 도구 금지). git status/diff(읽기 전용) + typecheck/test/build(진단)만 — 디스크를
 * 바꾸지 않는다. 자동 GitHub write/PR/commit 0.
 *
 * 실제 실행은 주입된 ShellExecutor(서버 게이트 경유)에 위임 → 코어는 순수·헤드리스
 * 테스트 가능. 실행 게이트(send-keys)가 꺼져 있으면 executor가 정직하게 blocked를 낸다.
 */

export type ShellPreset = "git_status" | "git_diff" | "typecheck" | "test" | "build";

export const SHELL_PRESETS: Record<ShellPreset, { label: string; command: string; mutating: false }> = {
  git_status: { label: "git status", command: "git status --short", mutating: false },
  git_diff: { label: "git diff", command: "git -c core.pager=cat diff --stat && git -c core.pager=cat diff", mutating: false },
  typecheck: { label: "typecheck", command: "corepack pnpm -s typecheck", mutating: false },
  test: { label: "test", command: "corepack pnpm -s test --run", mutating: false },
  build: { label: "build", command: "corepack pnpm -s build", mutating: false },
};

export const DEFAULT_PRESET_SEQUENCE: ShellPreset[] = ["git_status", "git_diff", "typecheck"];

export type ShellExecInput = {
  command: string;
  repoRoot: string;
  /** stop() → abort */
  signal: AbortSignal;
};

export type ShellExecOutput = {
  /** 0=성공, 그 외=실패. -1=실행 불가(게이트 off/도달 불가) */
  exitCode: number;
  stdout: string;
  stderr: string;
  /** 실제 실행이 관측됐는가 (게이트 off/mock이면 false) */
  observed: boolean;
  /** observed=false 사유 */
  blockedReason?: string;
};

export type ShellExecutor = (
  input: ShellExecInput,
  onLog: (stream: CodingLogStream, text: string) => void,
) => Promise<ShellExecOutput>;

export type LocalShellRunnerDeps = {
  execute: ShellExecutor;
  /** 실행할 preset 시퀀스 (기본 status→diff→typecheck) */
  presets?: ShellPreset[];
  now?: () => string;
  /** 로그/출력 시크릿 마스킹 (기본 redactSecrets) */
  redact?: (text: string) => string;
  label?: string;
};

// ── 시크릿 마스킹 (로그에 토큰/키 그대로 안 나가게) ──

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]+/gi,
  /\bsk-[A-Za-z0-9._\-]{8,}/g,
  // classic(ghp_/gho_/ghu_/ghs_/ghr_) + fine-grained PAT(github_pat_, 2022+ 권장 형식).
  // fine-grained는 prefix·underscore가 달라 classic 규칙으로는 안 잡힌다 — 별도 alternation으로
  // 막지 않으면 평문 PAT가 로그/트레이스에 그대로 노출된다(마스킹 false-negative).
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  /\b([A-Z0-9_]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|ACCESS[_-]?TOKEN|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*)\s*[=:]\s*\S+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      const eq = match.search(/[=:]/);
      return eq > 0 ? `${match.slice(0, eq + 1)} <redacted>` : "<redacted>";
    });
  }
  return out;
}

// ── git diff --stat 파싱 → changedFiles ──

export function parseDiffStat(diffOutput: string): ChangedFileSummary[] {
  const files: ChangedFileSummary[] = [];
  for (const raw of diffOutput.split("\n")) {
    // " src/App.tsx | 12 +++---"  또는  " path => newpath | ..."
    const m = raw.match(/^\s*([^|]+?)\s*\|\s*(\d+|Bin)\s*([+\-]*)/);
    if (!m) continue;
    const path = m[1]!.trim();
    if (!path || path.includes("=>") === false && path.endsWith("/")) continue;
    const plus = (m[3]!.match(/\+/g) ?? []).length;
    const minus = (m[3]!.match(/-/g) ?? []).length;
    files.push({ path, change: "modified", additions: plus, deletions: minus });
  }
  return files;
}

// ── 테스트/타입체크 출력 → TestResultSummary ──

export function parseTestResult(output: string): TestResultSummary {
  const passed = Number(output.match(/(\d+)\s+passed/i)?.[1] ?? 0);
  const failed = Number(output.match(/(\d+)\s+failed/i)?.[1] ?? 0);
  const ran = /passed|failed|tests?\b/i.test(output);
  return { ran, passed, failed };
}

/** preset 시퀀스를 순서 실행하는 CodingRunner */
export function createLocalShellCodingRunner(deps: LocalShellRunnerDeps): CodingRunner {
  const now = deps.now ?? (() => new Date().toISOString());
  const redact = deps.redact ?? redactSecrets;
  const presets = deps.presets ?? DEFAULT_PRESET_SEQUENCE;

  return {
    id: "local_shell",
    label: deps.label ?? "Local Shell Runner",
    observes: true,
    run(request, hooks?: CodingRunnerHooks): CodingRunHandle {
      const controller = new AbortController();
      const logs: { at: string; stream: CodingLogStream; text: string }[] = [];
      const emit = (stream: CodingLogStream, text: string) => {
        const chunk = { at: now(), stream, text: redact(text) };
        logs.push(chunk);
        hooks?.onLog?.(chunk);
      };

      const done = (async (): Promise<CodingRunResult> => {
        const startedAt = now();
        hooks?.onStatus?.("running");
        emit("system", `local shell · ${request.repoRoot} (mission ${request.missionId})`);
        emit("system", `presets: ${presets.join(" → ")}  [읽기전용 진단 · 변경 없음]`);

        let diffOutput = "";
        let testOutput = "";
        let failed = false;
        let errorSummary: string | undefined;
        let anyObserved = false;

        for (const preset of presets) {
          if (controller.signal.aborted) break;
          const spec = SHELL_PRESETS[preset];
          emit("tool", `$ ${spec.command}`);
          let out: ShellExecOutput;
          try {
            out = await deps.execute({ command: spec.command, repoRoot: request.repoRoot, signal: controller.signal }, emit);
          } catch (error) {
            failed = true;
            errorSummary = `${spec.label} 실행 실패: ${error instanceof Error ? error.message : String(error)}`;
            emit("stderr", errorSummary);
            break;
          }
          anyObserved = anyObserved || out.observed;
          if (!out.observed) {
            // 실행 게이트 off / 도달 불가 — 정직하게 멈춘다
            errorSummary = out.blockedReason ?? "실행 불가 — dgx-02 send-keys 게이트가 꺼져 있거나 서버에 도달할 수 없습니다.";
            emit("system", errorSummary);
            failed = true;
            break;
          }
          if (preset === "git_diff") diffOutput += `${out.stdout}\n`;
          if (preset === "typecheck" || preset === "test") testOutput += `${out.stdout}\n${out.stderr}\n`;
          if (out.exitCode !== 0) {
            failed = true;
            const tail = (out.stderr || out.stdout).trim().split("\n").slice(-3).join(" ");
            errorSummary = `${spec.label} exit ${out.exitCode}: ${tail}`.slice(0, 240);
            emit("stderr", `exit ${out.exitCode}`);
            break;
          }
          emit("stdout", `${spec.label} 완료`);
        }

        if (controller.signal.aborted) {
          emit("system", "사용자 중지");
          hooks?.onStatus?.("stopped");
          return baseResult("stopped", logs, [], "", { ran: false, passed: 0, failed: 0 }, startedAt, now(), anyObserved);
        }

        const changedFiles = parseDiffStat(diffOutput);
        const testResult = parseTestResult(testOutput);
        const status = failed ? "failed" : "completed";
        hooks?.onStatus?.(status);
        return baseResult(
          status,
          logs,
          changedFiles,
          redact(diffOutput.trim()),
          testResult,
          startedAt,
          now(),
          anyObserved,
          errorSummary,
        );
      })();

      return { stop: () => controller.abort(), done };
    },
  };
}

function baseResult(
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
