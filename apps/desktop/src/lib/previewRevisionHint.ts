/**
 * Preview Run vertical 후속 — preview가 실패했을 때 사용자가 "뭘 고쳐야 하는지"를 정직하게
 * 보여주기 위한 분류 함수.
 *
 * 정직성/안전:
 *   - LLM 호출 0. 입력의 outcome/status/detail/message를 패턴 매칭으로만 분류한다.
 *   - "fake observed fix" 금지 — hint는 "이걸 확인해보라"는 안내일 뿐, 실제로 고친 것은 아니다.
 *   - 자동 수정/자동 scaffold refresh 0(이번 vertical 범위 밖). CTA는 trace만 남긴다.
 *   - 미분류는 "unknown" — 결과를 추측하지 않고 "로그 확인 필요"로 둔다.
 *
 * 입력은 MissionPreviewRunScaffoldResponse의 일부만 추려서 받는다(@ai-orchestrator/protocol
 * 의존성을 이 모듈에 들이지 않기 위해서 — pure하게 유지).
 */

export type PreviewRevisionHintInput = {
  /** PreviewRunCard가 받는 outcome — 본 모듈은 *_failed/preview_not_running/error만 처리. */
  outcome:
    | "observed"
    | "preview_not_running"
    | "no_scaffold"
    | "materialize_failed"
    | "not_configured"
    | "mission_not_found"
    | "error";
  /** AppWorkspacePreview 형태 — 있을 때만 detail/status 보고 분류. */
  preview?: {
    status?: string;
    truthStatus?: string;
    detail?: string;
    command?: string;
  };
  /** 응답의 top-level message — materialize_failed/error 분류 보조. */
  message?: string;
};

export type PreviewRevisionHintKind =
  /** dependency/install 의심 — spawn ENOENT, command not found, node_modules 누락 등. */
  | "install_dependency"
  /** Vite startup 실패 — import 실패/SyntaxError/main.tsx App.tsx 관련. */
  | "vite_startup"
  /** HTTP probe 실패 — 프로세스는 spawn 됐지만 포트가 안 떠 있음. */
  | "http_probe"
  /** materialize 실패 — fs write/path 문제. */
  | "materialize"
  /** 분류 불가 — 추측 금지, "로그 확인 필요". */
  | "unknown";

export type PreviewRevisionHint = {
  kind: PreviewRevisionHintKind;
  /** 한 줄 요약(사용자가 첫 눈에 읽는 헤더). */
  summary: string;
  /** 다음에 확인할 항목들(짧고 행동 가능한 step 2-4개). */
  steps: string[];
};

/** 패턴 매칭에 쓸 텍스트를 합쳐 lowercase로 만들어 둔다(detail+message). */
function joinedLower(input: PreviewRevisionHintInput): string {
  return [input.preview?.detail ?? "", input.message ?? "", input.preview?.command ?? ""]
    .join(" ")
    .toLowerCase();
}

/**
 * 입력 → 수정 힌트(또는 undefined). observed/no_scaffold/not_configured/mission_not_found는
 * hint가 필요한 상태가 아니라 undefined(카드에서 다른 안내가 이미 있음).
 */
export function buildPreviewRevisionHint(input: PreviewRevisionHintInput): PreviewRevisionHint | undefined {
  if (input.outcome === "observed") return undefined;
  if (input.outcome === "no_scaffold") return undefined;
  if (input.outcome === "not_configured") return undefined;
  if (input.outcome === "mission_not_found") return undefined;

  if (input.outcome === "materialize_failed") {
    const text = joinedLower(input);
    const steps: string[] = [
      "임시 디렉터리(/tmp/preview/...)에 쓰기 권한이 있는지 확인하세요.",
      "scaffold/latest 응답의 files 경로에 절대경로/'..'가 들어 있지 않은지 확인하세요.",
    ];
    if (text.includes("eacces") || text.includes("permission denied")) {
      steps.unshift("권한 오류(EACCES)입니다 — preview 디렉터리의 owner/perm을 확인하세요.");
    }
    if (text.includes("enospc") || text.includes("no space")) {
      steps.unshift("디스크 공간 부족(ENOSPC)입니다 — preview 디렉터리 위치를 옮겨야 합니다.");
    }
    return {
      kind: "materialize",
      summary: "scaffold 파일을 디렉터리에 풀지 못했습니다. 디렉터리 권한 또는 path를 확인하세요.",
      steps,
    };
  }

  // preview_not_running / error는 preview 객체와 메시지를 같이 본다.
  const text = joinedLower(input);
  // 1) install/dependency 의심.
  const installSignals = [
    "enoent",
    "command not found",
    "is not recognized",
    "cannot find module",
    "module not found",
    "node_modules",
    "no such file or directory",
  ];
  if (installSignals.some((s) => text.includes(s))) {
    return {
      kind: "install_dependency",
      summary: "preview 명령을 실행할 수 없습니다. 의존성 설치가 필요해 보입니다.",
      steps: [
        "scaffold 디렉터리에서 `pnpm install`(또는 `npm install`)을 한 번 실행하세요.",
        "package.json의 dependencies/devDependencies가 빠짐없이 들어 있는지 확인하세요.",
        "`pnpm`/`vite` 바이너리가 서버 환경 PATH에 있는지 확인하세요.",
      ],
    };
  }
  // 2) Vite startup/import 실패.
  const viteSignals = [
    "failed to load",
    "cannot resolve",
    "syntaxerror",
    "parse error",
    "vite",
    "esbuild",
    "main.tsx",
    "app.tsx",
    "rollup",
  ];
  if (viteSignals.some((s) => text.includes(s))) {
    return {
      kind: "vite_startup",
      summary: "Vite가 시작 직후 에러를 냈습니다. import/문법 오류 가능성이 높습니다.",
      steps: [
        "src/main.tsx와 src/App.tsx의 import 경로/이름을 확인하세요.",
        "Blueprint screens가 생성한 JSX의 따옴표/괄호가 닫혀 있는지 확인하세요.",
        "scaffold/latest 응답의 src/App.tsx, src/main.tsx 본문을 직접 열어 비교해보세요.",
      ],
    };
  }
  // 3) HTTP probe 실패(프로세스는 떴는데 포트가 안 떠 있음).
  if (input.outcome === "preview_not_running" && (input.preview?.status === "failed" || input.preview?.status === "starting")) {
    const probeSignals = ["port", "address already in use", "eaddrinuse", "timeout", "probe", "did not bind"];
    const isProbe = probeSignals.some((s) => text.includes(s)) || input.preview?.detail === undefined;
    if (isProbe) {
      return {
        kind: "http_probe",
        summary: "preview 프로세스는 시작됐지만 HTTP 응답이 관측되지 않았습니다.",
        steps: [
          "dev server가 워크스페이스 디렉터리에서 시작했는지 확인하세요(cwd 일치 여부).",
          "포트가 이미 사용 중인지(EADDRINUSE), 다른 포트를 지정해보세요.",
          "프로세스 stderr 로그에서 \"Local:\" 또는 \"ready in\" 메시지가 떴는지 확인하세요.",
        ],
      };
    }
  }
  // 4) 분류 불가 — 추측 금지.
  return {
    kind: "unknown",
    summary: "preview가 떠지지 않았는데 분류 가능한 단서가 없습니다 — 직접 로그 확인이 필요합니다.",
    steps: [
      "서버 콘솔에서 mission.preview.run-scaffold.* trace를 확인하세요.",
      "preview 프로세스의 stderr preview(있다면)를 그대로 읽으세요.",
      "수동으로 디렉터리에 들어가 `pnpm dev`를 직접 실행해 동일 에러를 재현하세요.",
    ],
  };
}

/** kind별 한국어 라벨 — UI에서 배지/타이틀에 쓰기 위해서. */
export const PREVIEW_REVISION_HINT_KIND_LABEL: Record<PreviewRevisionHintKind, string> = {
  install_dependency: "의존성 설치",
  vite_startup: "Vite 시작 실패",
  http_probe: "포트 응답 없음",
  materialize: "파일 풀기 실패",
  unknown: "분류 불가",
};
