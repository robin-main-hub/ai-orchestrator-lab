import { z } from "zod";
import { truthStatusSchema } from "./productKernel.js";

/**
 * Structured Sandbox Error Card — 터미널 raw log만 보여주지 말고, 실패를 구조화한다.
 * 1차는 **결정적 regex 파서**(AI 요약은 후순위). TS/Python/Node 스택에서 errorClass·
 * targetFile·targetLine·rootCause를 뽑고, errorClass별 결정적 directive를 제안한다.
 *
 * 순수 함수 — 단위 테스트된다. stderrPreview는 redacted preview만(raw secret 금지).
 */

export const sandboxErrorCardSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workerId: z.string().optional(),
  runnerKind: z.string(),
  status: z.enum(["failed", "timeout", "blocked"]),
  errorClass: z.string().optional(),
  targetFile: z.string().optional(),
  targetLine: z.number().int().optional(),
  rootCause: z.string(),
  directive: z.string(),
  stderrPreview: z.string(),
  relatedCheckId: z.string().optional(),
  createdAt: z.string(),
  truthStatus: truthStatusSchema,
});
export type SandboxErrorCard = z.infer<typeof sandboxErrorCardSchema>;

const TS_RE = /(\S+\.tsx?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)/;
const PY_FILE_RE = /File "([^"]+)", line (\d+)/;
const PY_EXC_RE = /^([A-Z][A-Za-z]*Error):\s*(.+)$/m;
const NODE_EXC_RE = /\b([A-Z][A-Za-z]*Error):\s*(.+)/;
const NODE_AT_RE = /\bat\s+(?:.*\()?([^()\s:]+):(\d+):\d+\)?/;

const DIRECTIVE_BY_CLASS: Array<{ test: RegExp; directive: string }> = [
  { test: /TS2532|TS18048|TS2531/, directive: "nullable 결과를 사용하기 전에 가드(?. 또는 if)로 보호하세요" },
  { test: /TS2345|TS2322/, directive: "할당/인자 타입을 좁히거나 변환하세요 (타입 불일치)" },
  { test: /TS2304|TS2552/, directive: "정의되지 않은 식별자 — import 또는 선언을 추가하세요" },
  { test: /TS6133/, directive: "사용하지 않는 선언을 제거하세요" },
  { test: /TypeError/, directive: "undefined/null 접근 또는 잘못된 타입 호출을 가드하세요" },
  { test: /ReferenceError/, directive: "선언 전에 사용된 식별자 — 정의/스코프를 확인하세요" },
  { test: /AssertionError|ExpectationFailed/, directive: "기대값과 실제값 차이를 확인해 구현을 수정하세요" },
  { test: /ModuleNotFoundError|Cannot find module/, directive: "누락된 의존성 설치 또는 경로를 수정하세요" },
];

function directiveFor(errorClass: string | undefined, rootCause: string): string {
  const haystack = `${errorClass ?? ""} ${rootCause}`;
  for (const entry of DIRECTIVE_BY_CLASS) {
    if (entry.test.test(haystack)) return entry.directive;
  }
  return "stderr의 첫 에러를 근거로 가장 좁은 수정을 적용하세요";
}

function clip(text: string, max = 2_000): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function parseSandboxError(input: {
  id: string;
  missionId: string;
  workerId?: string;
  runnerKind: string;
  status?: "failed" | "timeout" | "blocked";
  stderr: string;
  stdout?: string;
  relatedCheckId?: string;
  truthStatus?: SandboxErrorCard["truthStatus"];
  now: () => string;
}): SandboxErrorCard {
  const blob = `${input.stderr}\n${input.stdout ?? ""}`;
  let errorClass: string | undefined;
  let targetFile: string | undefined;
  let targetLine: number | undefined;
  let rootCause = clip(input.stderr || input.stdout || "", 240) || "알 수 없는 실패";

  const ts = TS_RE.exec(blob);
  const pyFile = PY_FILE_RE.exec(blob);
  const pyExc = PY_EXC_RE.exec(blob);
  if (ts) {
    targetFile = ts[1];
    targetLine = Number(ts[2]);
    errorClass = ts[3];
    rootCause = clip(ts[4]!, 240);
  } else if (pyFile && pyExc) {
    // Python: `File "...", line N` 컨텍스트가 있을 때만(TypeError 등 Node 에러도
    // ...Error로 끝나 PY_EXC_RE에 걸리므로, 파이썬 파일 라인을 동반조건으로 둔다)
    errorClass = pyExc[1];
    rootCause = clip(pyExc[2]!, 240);
    targetFile = pyFile[1];
    targetLine = Number(pyFile[2]);
  } else {
    const nodeExc = NODE_EXC_RE.exec(blob);
    if (nodeExc) {
      errorClass = nodeExc[1];
      rootCause = clip(nodeExc[2]!, 240);
      const at = NODE_AT_RE.exec(blob);
      if (at) {
        targetFile = at[1];
        targetLine = Number(at[2]);
      }
    } else if (pyExc) {
      errorClass = pyExc[1];
      rootCause = clip(pyExc[2]!, 240);
    }
  }

  return {
    id: input.id,
    missionId: input.missionId,
    workerId: input.workerId,
    runnerKind: input.runnerKind,
    status: input.status ?? "failed",
    errorClass,
    targetFile,
    targetLine,
    rootCause,
    directive: directiveFor(errorClass, rootCause),
    stderrPreview: clip(input.stderr),
    relatedCheckId: input.relatedCheckId,
    createdAt: input.now(),
    truthStatus: input.truthStatus ?? "observed",
  };
}

/** 같은 에러인지 비교용 서명 — self-correction loop가 무한루프를 막는 데 쓴다. */
export function sandboxErrorSignature(card: Pick<SandboxErrorCard, "errorClass" | "targetFile" | "targetLine" | "rootCause">): string {
  return [card.errorClass ?? "?", card.targetFile ?? "?", card.targetLine ?? "?", card.rootCause.slice(0, 80)].join("|");
}
