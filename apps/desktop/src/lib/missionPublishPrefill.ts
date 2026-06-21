import type { MissionBoardItem } from "./missionBoardModel";
import type { GithubPublishPanelInitial } from "../components/coding/GithubPublishPanel";

/**
 * Mission/AppBuild 결과를 GithubPublishPanel 초기값으로 변환하는 순수 함수.
 *
 * 정직성(러시아 심판 기준):
 *   - 추측은 모두 planned/draft 표식 유지 — Mission 데이터에 없는 값은 비워둔다.
 *   - branch name은 missionId를 안전 슬러그로 변환해서 W2 prefix `agent/mission-<slug>`로.
 *     (사용자가 수정 가능 — 자동 실행은 절대 일어나지 않음, prefill ≠ execute.)
 *   - PR title은 mission.title 그대로(160자 캡 안에서). PR body는 mission.goal + provenance 한 줄.
 *   - file path/content는 호출자가 scaffoldFiles로 명시적으로 넘긴 경우에만 자동 채움.
 *     binary/large/secret-suspect는 모두 스킵하고, 다중 파일이면 첫 안전 파일만 + 명시 notice.
 *     (Mission scaffold 메타가 MissionBoardItem 스키마에 노출되어 있지 않아도, 호출자가
 *      getScaffoldFiles로 제공하면 prefill이 작동한다.)
 */

const SLUG_SAFE = /[^a-z0-9-]/g;

/** missionId(예: "mission_8eab...") → "8eab" 같은 짧은 slug. 안전 문자만. */
function shortSlug(missionId: string, maxLen = 12): string {
  const trimmed = missionId.replace(/^mission_?/i, "").toLowerCase();
  const safe = trimmed.replace(SLUG_SAFE, "");
  return safe.slice(0, Math.max(4, maxLen));
}

/** PR body draft — mission.goal 본문 + missionId provenance 한 줄. body가 비어 있어도 GitHub PR은 허용. */
function buildPrBody(item: MissionBoardItem): string {
  const lines: string[] = [];
  if (item.goal && item.goal.trim()) lines.push(item.goal.trim());
  // provenance — 사용자가 지워도 무방. mission lineage를 한 줄로 남긴다.
  lines.push("", `_Generated from Mission ${item.missionId} (draft — review before approving)._`);
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Scaffold file 가드 — prefill 단계의 첫 안전선(server의 W3a guard가 두 번째).
// ──────────────────────────────────────────────────────────────────────────────

export type MissionScaffoldFile = {
  /** repo-root-relative path(예: "src/util.ts"). 비어 있으면 자동 스킵. */
  path: string;
  /** UTF-8 텍스트 — binary 파일은 호출자가 미리 거르거나 NUL을 포함시켜 스킵되게 한다. */
  newContent: string;
  /** create / update 표시. UI 라벨에 사용(미제공 시 비표시). */
  operation?: "create" | "update";
};

/** W3a와 동일한 256 KiB. 이 한도를 넘으면 prefill 스킵(서버도 동일 한도로 차단). */
export const SCAFFOLD_FILE_BYTE_MAX = 256 * 1024;

/**
 * 클라이언트 측 보조 secret scan — 서버의 W1 scanner가 항상 진실의 원본이지만,
 * prefill 단계에서 명백한 비밀이 들어가지 않도록 첫 필터를 둔다.
 * (가짜 양성보다 가짜 음성을 더 두려워한다 — 모호하면 스킵.)
 */
const CLIENT_SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgho_[A-Za-z0-9]{20,}\b/,
  /\bghs_[A-Za-z0-9]{20,}\b/,
  /\bghu_[A-Za-z0-9]{20,}\b/,
  /\bghr_[A-Za-z0-9]{20,}\b/,
  // 세분화(fine-grained) PAT(github_pat_) — 2022+ GitHub 권장 형식. prefix·underscore가
  // classic과 달라 위 ghp_/gho_/… 규칙으로는 안 잡힌다(서버 W1 scanner와 동일한 별도 패턴).
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{40,}\b/,
  // 모던(2024+) OpenAI 키 sk-proj-…/sk-svcacct-…/sk-admin- 는 본문에 '-'·'_'가 섞여
  // 위 pure-alnum sk-{40,} run이 끊겨 안 잡힌다. 서버 W1 scanner와 동일한 누락이라
  // 같은 정밀 패턴으로 parity(문서화된 prefix 한정 — 광범위 sk-<word>-는 산문
  // "sk-learn"=scikit-learn 오탐하므로 회피).
  /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bAuthorization\s*:\s*Bearer\s+\S+/i,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
];

/** utf-8 byte length — 브라우저에서 `Buffer` 없이도 정확. */
function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export type ScaffoldGateReason = "empty_path" | "binary" | "too_large" | "secret_suspect";

export type ScaffoldGateResult =
  | { ok: true; file: MissionScaffoldFile }
  | { ok: false; reason: ScaffoldGateReason };

/** 단일 파일이 prefill에 안전한지 결정적 검사 — 외부 호출 0. */
export function evaluateScaffoldFile(file: MissionScaffoldFile): ScaffoldGateResult {
  if (!file.path || !file.path.trim()) return { ok: false, reason: "empty_path" };
  if (file.newContent.includes("\0")) return { ok: false, reason: "binary" };
  if (utf8ByteLength(file.newContent) > SCAFFOLD_FILE_BYTE_MAX) return { ok: false, reason: "too_large" };
  if (CLIENT_SECRET_PATTERNS.some((pattern) => pattern.test(file.newContent))) {
    return { ok: false, reason: "secret_suspect" };
  }
  return { ok: true, file };
}

export type ScaffoldPickResult = {
  /** 안전 가드를 통과해서 prefill에 쓸 파일(없으면 undefined). */
  pick?: MissionScaffoldFile;
  /** 전체 scaffold 파일 개수. */
  total: number;
  /** 가드 통과한 파일 개수(첫 통과 파일을 pick으로 노출). */
  safeCount: number;
  /** 스킵된 사유별 카운트(UI에서 "스캔된 N개 — 1개 사용" 같은 메시지 만들 때 쓰기 좋음). */
  skipped: Record<ScaffoldGateReason, number>;
};

/**
 * 안전 가드를 통과한 첫 파일을 선택. 다중 파일이면 사용자가 나머지를 별도 plan으로 진행해야 함.
 * 정직성: 추측 금지 — 입력이 비어 있으면 pick은 undefined.
 */
export function pickFirstSafeScaffoldFile(files: ReadonlyArray<MissionScaffoldFile>): ScaffoldPickResult {
  const result: ScaffoldPickResult = {
    total: files.length,
    safeCount: 0,
    skipped: { empty_path: 0, binary: 0, too_large: 0, secret_suspect: 0 },
  };
  for (const file of files) {
    const gate = evaluateScaffoldFile(file);
    if (gate.ok) {
      result.safeCount += 1;
      if (!result.pick) result.pick = gate.file;
    } else {
      result.skipped[gate.reason] += 1;
    }
  }
  return result;
}

/** 명시 notice 한 줄 — 사용자가 "여러 파일 중 첫 파일" 상황을 알 수 있게. */
function buildFileNotice(pick: ScaffoldPickResult): string | undefined {
  if (!pick.pick) {
    if (pick.total === 0) return undefined;
    // 모든 파일이 스킵된 경우 — 사용자가 손으로 입력해야 한다는 신호.
    const skippedTotal = Object.values(pick.skipped).reduce((sum, count) => sum + count, 0);
    return `scaffold ${pick.total}개 모두 가드에 막혀 자동 채움 없음 (${skippedTotal}개 스킵 — binary/대용량/시크릿 의심)`;
  }
  if (pick.total === 1) {
    return `scaffold 1개 — 그대로 채움(검토 후 plan)`;
  }
  // 다중 파일 — 첫 안전 파일만 보이고 나머지는 별도 plan으로 진행.
  const skippedBits: string[] = [];
  if (pick.skipped.binary > 0) skippedBits.push(`${pick.skipped.binary} binary`);
  if (pick.skipped.too_large > 0) skippedBits.push(`${pick.skipped.too_large} 대용량`);
  if (pick.skipped.secret_suspect > 0) skippedBits.push(`${pick.skipped.secret_suspect} 시크릿 의심`);
  if (pick.skipped.empty_path > 0) skippedBits.push(`${pick.skipped.empty_path} 빈 경로`);
  const skippedNote = skippedBits.length > 0 ? ` · 스킵 ${skippedBits.join(", ")}` : "";
  return `scaffold ${pick.total}개 중 1개 자동 채움 — 나머지는 별도 plan${skippedNote}`;
}

/**
 * 기본 prefill resolver — Mission 메타로부터 안전한 첫 초기값을 만든다.
 * 호출자(MissionBoardPanel)가 별도 resolver를 안 주면 이걸 사용한다.
 *
 *   - sourceRef는 비워두지 않고 "main"(가장 흔한 기본). 안 맞으면 사용자가 수정.
 *   - newBranchName: agent/mission-<slug>
 *   - prBase: "main"
 *   - prTitle: mission.title(160자 캡)
 *   - prBody: mission.goal + provenance
 *   - filePath / fileNewContent: scaffoldFiles가 있을 때만 가드 통과한 첫 안전 파일에서 가져옴.
 *     없으면 undefined로 비움(사용자가 직접 입력) — 추측 금지.
 *   - fileNotice: 다중 파일/전체 스킵 상황을 명시 텍스트로.
 */
export function builtinMissionPrefill(
  item: MissionBoardItem,
  scaffoldFiles?: ReadonlyArray<MissionScaffoldFile>,
): GithubPublishPanelInitial {
  const slug = shortSlug(item.missionId);
  const titleCapped = item.title ? item.title.slice(0, 160) : "";
  const initial: GithubPublishPanelInitial = {
    sourceRef: "main",
    newBranchName: `agent/mission-${slug}`,
    prBase: "main",
    prTitle: titleCapped,
    prBody: buildPrBody(item),
  };
  if (scaffoldFiles && scaffoldFiles.length > 0) {
    const pick = pickFirstSafeScaffoldFile(scaffoldFiles);
    if (pick.pick) {
      initial.filePath = pick.pick.path;
      initial.fileNewContent = pick.pick.newContent;
    }
    initial.fileNotice = buildFileNotice(pick);
  }
  return initial;
}

/** 호출자 측 resolver 시그니처(MissionPublishEnvironment에서 사용). */
export type MissionPublishPrefillResolver = (
  item: MissionBoardItem,
  scaffoldFiles?: ReadonlyArray<MissionScaffoldFile>,
) => GithubPublishPanelInitial | undefined;

// ──────────────────────────────────────────────────────────────────────────────
// Publish history — Mission Workspace에 "GitHub로 어디까지 나갔는지" 한눈 요약.
// trace event(github.publish.{step}.{status})를 단계별 latest entry로 누적.
// 정직성: 보여줄 수 있는 건 'GithubPublishPanel.emit가 발행한 trace만'. 영속화 없음(세션 메모리).
// ──────────────────────────────────────────────────────────────────────────────

export type PublishStep = "branch" | "file" | "pr";
export type PublishStepStatus =
  | "planned"
  | "observed"
  | "blocked"
  | "failed"
  | "already_exists"
  | "approval_required";

export type PublishHistoryEntry = {
  step: PublishStep;
  status: PublishStepStatus;
  /** GithubPublishPanel.emit의 summary 그대로(짧은 한 줄). */
  summary: string;
  /** ISO 시각 — trace event ts 그대로. */
  ts: string;
  /**
   * GitHub HTML URL(observed 단계의 경우). pr.observed의 PR 페이지, file.observed의 blob 페이지 등.
   * 사용자가 trace에 의도적으로 노출시킬 때만 채워지며, https://github.com/ 으로 시작하는 값만 신뢰.
   */
  htmlUrl?: string;
};

/** 단계별 latest entry. branch/file/pr 각각 마지막 trace만 보관(단계 재시도해도 최신만 노출). */
export type PublishHistoryByStep = {
  branch?: PublishHistoryEntry;
  file?: PublishHistoryEntry;
  pr?: PublishHistoryEntry;
};

const STEP_SET = new Set<PublishStep>(["branch", "file", "pr"]);
const STATUS_SET = new Set<PublishStepStatus>([
  "planned",
  "observed",
  "blocked",
  "failed",
  "already_exists",
  "approval_required",
]);

/**
 * "github.publish.{step}.{status}" trace event를 PublishHistoryEntry로 파싱.
 *
 * 순수 함수: 외부 호출 0, 부수효과 0, 같은 입력 → 같은 출력(단, ts 미제공 시 new Date 한 번 호출).
 *
 * 알 수 없는 step/status, 또는 prefix가 "github.publish."가 아닐 때는 undefined(추측 금지).
 * type이 정확히 "github.publish.{step}.{status}"이 아니면(점 4개 초과 등) 거부.
 */
export function parsePublishTrace(
  type: string,
  payload: Record<string, unknown> | null | undefined,
): PublishHistoryEntry | undefined {
  if (!type || !type.startsWith("github.publish.")) return undefined;
  const parts = type.split(".");
  if (parts.length !== 4) return undefined; // 정확히 4 토큰만 허용 — 확장 prefix 거부
  const [, , step, status] = parts;
  if (!step || !status) return undefined;
  if (!STEP_SET.has(step as PublishStep)) return undefined;
  if (!STATUS_SET.has(status as PublishStepStatus)) return undefined;
  const safePayload = payload ?? undefined;
  const summary = typeof safePayload?.summary === "string" ? safePayload.summary : "";
  const ts = typeof safePayload?.ts === "string" ? safePayload.ts : new Date().toISOString();
  // htmlUrl은 payload에 있을 때만, 그리고 github.com 호스트만 신뢰(prefix 가드).
  const rawUrl = typeof safePayload?.htmlUrl === "string" ? safePayload.htmlUrl : undefined;
  const htmlUrl = rawUrl && rawUrl.startsWith("https://github.com/") ? rawUrl : undefined;
  return { step: step as PublishStep, status: status as PublishStepStatus, summary, ts, htmlUrl };
}

// ──────────────────────────────────────────────────────────────────────────────
// computeNextPublishStep — "다음 할 일 1개" 결정 로직. 정직성:
//   - 단계 순서는 항상 branch → file → pr (의존성).
//   - blocked/failed인 단계는 retry_step(같은 단계 재시도). 자동으로 다음 단계 추천 절대 금지.
//   - planned/approval_required 단계는 continue_step(execute 준비됨). 같은 단계.
//   - observed/already_exists는 통과 → 다음 단계.
//   - 모두 통과 → done.
//   - history 자체가 비어 있으면 첫 단계 start_step.
// ──────────────────────────────────────────────────────────────────────────────

export type PublishNextAction =
  | { kind: "start_step"; step: PublishStep; label: string }
  | { kind: "retry_step"; step: PublishStep; label: string; reason: string }
  | { kind: "continue_step"; step: PublishStep; label: string }
  | { kind: "done"; label: string };

const NEXT_LABEL_START: Record<PublishStep, string> = {
  branch: "브랜치 준비",
  file: "파일 변경 준비",
  pr: "PR 준비",
};

const NEXT_LABEL_CONTINUE: Record<PublishStep, string> = {
  branch: "브랜치 실행 준비됨",
  file: "파일 변경 실행 준비됨",
  pr: "PR 실행 준비됨",
};

const NEXT_LABEL_RETRY: Record<PublishStep, string> = {
  branch: "브랜치 재시도",
  file: "파일 변경 재시도",
  pr: "PR 재시도",
};

const STEP_ORDER: ReadonlyArray<PublishStep> = ["branch", "file", "pr"];

const PASSING_STATUSES: ReadonlyArray<PublishStepStatus> = ["observed", "already_exists"];
const RETRY_STATUSES: ReadonlyArray<PublishStepStatus> = ["blocked", "failed"];
const CONTINUE_STATUSES: ReadonlyArray<PublishStepStatus> = ["planned", "approval_required"];

/**
 * Branch/File/PR history에서 사용자가 지금 해야 할 1개 행동을 결정한다.
 * undefined가 아닌 entry가 없으면 첫 단계부터 시작.
 */
export function computeNextPublishStep(
  history: Readonly<PublishHistoryByStep> | undefined,
): PublishNextAction {
  const h = history ?? {};
  for (const step of STEP_ORDER) {
    const entry = h[step];
    if (!entry) return { kind: "start_step", step, label: NEXT_LABEL_START[step] };
    if (RETRY_STATUSES.includes(entry.status)) {
      return {
        kind: "retry_step",
        step,
        label: NEXT_LABEL_RETRY[step],
        reason: entry.summary || entry.status,
      };
    }
    if (CONTINUE_STATUSES.includes(entry.status)) {
      return { kind: "continue_step", step, label: NEXT_LABEL_CONTINUE[step] };
    }
    if (PASSING_STATUSES.includes(entry.status)) continue;
    // 알 수 없는 상태 — 정직하게 start_step으로 fallback(추측 금지하면서도 next CTA는 줘야).
    return { kind: "start_step", step, label: NEXT_LABEL_START[step] };
  }
  return { kind: "done", label: "GitHub PR 완주됨" };
}

/**
 * publishHistoryByMission 상태에 새 trace를 누적한다.
 *   - parsePublishTrace로 파싱 실패 또는 missionId 누락 → prev를 그대로 반환(no-op).
 *   - 같은 mission/step 재시도 시 새 entry로 덮어쓴다(최신만 유지).
 * 순수 함수 — Container useState updater 안에서 그대로 사용한다.
 */
export function accumulatePublishHistory(
  prev: Readonly<Record<string, PublishHistoryByStep>>,
  type: string,
  payload: Record<string, unknown> | null | undefined,
): Record<string, PublishHistoryByStep> {
  const parsed = parsePublishTrace(type, payload);
  const missionId = typeof payload?.missionId === "string" ? payload.missionId : undefined;
  if (!parsed || !missionId) return prev as Record<string, PublishHistoryByStep>;
  const existing = prev[missionId] ?? {};
  return { ...prev, [missionId]: { ...existing, [parsed.step]: parsed } };
}
