import type { AppFixDraft } from "./appFixDraft";
import { DESIGN_ISSUE_KIND_LABEL } from "./appFixDraft";
import { evaluateScaffoldFile, type MissionScaffoldFile, type ScaffoldGateReason } from "./missionPublishPrefill";
import { parseSearchReplaceBlocks } from "./editEngine";

/**
 * OSS-H5 — Turbo Edits prompt bridge.
 *
 * Visual QA report, AppFixDraft, 또는 사용자 짧은 요청을 받아 LLM에게 Aider-style
 * SEARCH/REPLACE 블록을 만들라고 시키는 prompt를 *결정적으로* 빌드한다. 호출은 호출자가.
 *
 * 정직성:
 *   - 추측 금지를 prompt에 명시: "확실하지 않으면 블록 생성하지 말고 자연어로 'unknown'을 남겨라".
 *   - raw 전체 파일 대신 **excerpt**만 포함(기본 12KiB / 파일). 큰/secret/binary 가드된 파일은 통째로 제외.
 *   - 자동 적용 0: 출력은 SearchReplaceEditCard로 흘러가고, 사용자가 직접 미리보기 → apply.
 *   - 검증(validate)은 텍스트만 보고 결정적 판단 — LLM 무관, 다시 호출 0.
 */

export const DEFAULT_MAX_EXCERPT_BYTES = 12_000;
const SYSTEM_PROMPT_VERSION = "v1.0";

export type TurboEditPromptIssue = {
  id: string;
  kind: string;
  severity: "low" | "medium" | "high";
  summary: string;
  recommendation: string;
};

export type TurboEditPromptInput = {
  appName?: string;
  /** 현재 scaffold 파일. excerpt 추출에 사용. */
  scaffoldFiles: ReadonlyArray<MissionScaffoldFile>;
  /** prompt에 포함할 파일 경로 — UI 선택 결과. 비어 있어도 user 지시문이 있으면 진행. */
  focusPaths: ReadonlyArray<string>;
  /** AppFixDraft가 있으면 mapped suggestions + unmapped issues를 둘 다 prompt에 풀어 둔다. */
  appFixDraft?: AppFixDraft;
  /** AppFixDraft 외의 추가 issue context(예: 사용자가 카드를 안 만들고 issue 직접 선택한 경우). */
  extraIssues?: ReadonlyArray<TurboEditPromptIssue>;
  /** 사용자 자유 입력(짧은 수정 요청). */
  userInstruction?: string;
  /** 파일 excerpt 최대 바이트. 기본 12KiB. */
  maxExcerptBytes?: number;
};

export type TurboEditPromptIncludedFile = {
  path: string;
  bytes: number;
  /** maxExcerptBytes를 넘어 잘린 경우. */
  truncated: boolean;
};

export type TurboEditPromptSkippedFile = {
  path: string;
  reason: ScaffoldGateReason | "not_in_focus" | "not_in_scaffold";
};

export type TurboEditPrompt = {
  systemPrompt: string;
  userPrompt: string;
  includedFiles: ReadonlyArray<TurboEditPromptIncludedFile>;
  skippedFiles: ReadonlyArray<TurboEditPromptSkippedFile>;
  /** prompt가 비정상적으로 비어 있는지(focus 없고 issue 없고 user 지시문 없음). */
  empty: boolean;
};

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function trimToBytes(text: string, max: number): { text: string; truncated: boolean } {
  if (utf8ByteLength(text) <= max) return { text, truncated: false };
  // 라인 경계에서 자른다(중간 라인이 끊겨도 LLM이 혼란스럽지 않게).
  const lines = text.split("\n");
  let out = "";
  for (const line of lines) {
    const next = out.length === 0 ? line : `${out}\n${line}`;
    if (utf8ByteLength(next) > max) break;
    out = next;
  }
  return { text: `${out}\n# … (truncated — 이 아래는 prompt 한도로 제외됨)`, truncated: true };
}

const SYSTEM_PROMPT = `You are a search/replace edit producer for an App Builder Mission Workspace.
You will be given current source files (or excerpts) and one or more issues to address.
Output ONLY Aider-style SEARCH/REPLACE blocks. Each block has this exact format:

<path>
<<<<<<< SEARCH
<exact existing code, preserving whitespace>
=======
<new code>
>>>>>>> REPLACE

Rules:
- Output ZERO prose, ZERO summary, ZERO commentary outside SEARCH/REPLACE blocks.
- Preserve exact whitespace from the original file in the SEARCH section.
- For a NEW file, leave SEARCH empty and put the full file content in REPLACE.
- If you are not confident about the exact existing text or location, OMIT that block. Do NOT guess.
- If you cannot address an issue safely, OMIT a block for it. Do NOT invent code.
- One block per logical change. Multiple blocks per file are fine; they will be applied in order.
- Never include raw secrets, API keys, or tokens in REPLACE.
- The execution layer applies your blocks via 4-tier matching (exact → whitespace → indentation → fuzzy ≥ 0.85). SEARCH text quality matters.
` /* version pinned so downstream contract changes are visible */ +
  `\n[turbo_edit_prompt_${SYSTEM_PROMPT_VERSION}]\n`;

function buildIssuesSection(input: TurboEditPromptInput): string {
  const lines: string[] = [];
  const draft = input.appFixDraft;
  if (draft) {
    if (draft.status === "no_issues") {
      lines.push("## Visual QA: no issues — pass through.");
    } else if (draft.status === "blocked") {
      lines.push("## Visual QA: blocked (preview not observed). Do not invent fixes.");
    } else {
      lines.push("## Visual QA mapped suggestions (file → what / why):");
      for (const s of draft.fileSuggestions) {
        const kindLabel = s.kindHints
          .map((k) => DESIGN_ISSUE_KIND_LABEL[k] ?? k)
          .join(", ");
        lines.push(`- ${s.file}: ${s.what} — ${s.why}${kindLabel ? ` [${kindLabel}]` : ""}`);
      }
      if (draft.unmappedIssues.length > 0) {
        lines.push("");
        lines.push("## Unmapped issues (auto-classifier was unsure):");
        lines.push("If you cannot confidently locate the change, omit a block. Do not guess.");
        for (const u of draft.unmappedIssues) {
          lines.push(`- [${u.severity}] ${u.kind}: ${u.summary} — ${u.recommendation}`);
        }
      }
    }
  }
  if (input.extraIssues && input.extraIssues.length > 0) {
    lines.push("");
    lines.push("## Additional issues:");
    for (const i of input.extraIssues) {
      lines.push(`- [${i.severity}] ${i.kind}: ${i.summary} — ${i.recommendation}`);
    }
  }
  if (input.userInstruction && input.userInstruction.trim()) {
    lines.push("");
    lines.push("## User instruction:");
    lines.push(input.userInstruction.trim());
  }
  return lines.join("\n");
}

function buildFilesSection(
  input: TurboEditPromptInput,
): { text: string; included: TurboEditPromptIncludedFile[]; skipped: TurboEditPromptSkippedFile[] } {
  const filesByPath = new Map<string, MissionScaffoldFile>();
  for (const f of input.scaffoldFiles) filesByPath.set(f.path, f);
  const included: TurboEditPromptIncludedFile[] = [];
  const skipped: TurboEditPromptSkippedFile[] = [];
  const maxBytes = input.maxExcerptBytes ?? DEFAULT_MAX_EXCERPT_BYTES;
  const lines: string[] = ["## Current files (excerpts):"];
  for (const path of input.focusPaths) {
    const file = filesByPath.get(path);
    if (!file) {
      skipped.push({ path, reason: "not_in_scaffold" });
      continue;
    }
    const gate = evaluateScaffoldFile(file);
    if (!gate.ok) {
      skipped.push({ path, reason: gate.reason });
      continue;
    }
    const { text, truncated } = trimToBytes(file.newContent, maxBytes);
    included.push({ path, bytes: utf8ByteLength(text), truncated });
    lines.push("");
    lines.push(`### ${path}`);
    lines.push("```");
    lines.push(text);
    lines.push("```");
  }
  if (included.length === 0) {
    lines.push("(no files in focus)");
  }
  return { text: lines.join("\n"), included, skipped };
}

export function buildTurboEditPrompt(input: TurboEditPromptInput): TurboEditPrompt {
  const issuesSection = buildIssuesSection(input);
  const filesResult = buildFilesSection(input);

  const userPromptLines: string[] = [];
  if (input.appName?.trim()) {
    userPromptLines.push(`# App: ${input.appName.trim()}`);
  }
  if (issuesSection) {
    userPromptLines.push(issuesSection);
  }
  userPromptLines.push("");
  userPromptLines.push(filesResult.text);
  userPromptLines.push("");
  userPromptLines.push("## Output");
  userPromptLines.push(
    "Respond with ONLY SEARCH/REPLACE blocks for the changes you are confident about. If you cannot make any safe change, respond with the single line: NO_CONFIDENT_EDITS",
  );

  const hasIssues =
    !!(input.appFixDraft && input.appFixDraft.status === "has_fixes") ||
    (input.extraIssues && input.extraIssues.length > 0) ||
    !!(input.userInstruction && input.userInstruction.trim());

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: userPromptLines.join("\n"),
    includedFiles: filesResult.included,
    skippedFiles: filesResult.skipped,
    empty:
      !hasIssues && filesResult.included.length === 0 && (input.focusPaths?.length ?? 0) === 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Validator — LLM 출력 텍스트를 결정적으로 평가. 다시 호출 0.
// ─────────────────────────────────────────────────────────────

export type TurboEditValidation =
  | { ok: true; blockCount: number; filePaths: ReadonlyArray<string>; noConfidentEdits: false }
  | { ok: true; blockCount: 0; filePaths: []; noConfidentEdits: true }
  | { ok: false; reason: "empty" | "no_blocks" | "missing_filepath" };

export function validateTurboEditOutput(text: string): TurboEditValidation {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (/^NO_CONFIDENT_EDITS\s*$/m.test(trimmed)) {
    return { ok: true, blockCount: 0, filePaths: [], noConfidentEdits: true };
  }
  const blocks = parseSearchReplaceBlocks(text);
  if (blocks.length === 0) return { ok: false, reason: "no_blocks" };
  // 최소 한 블록은 filepath 라벨이 있어야 한다 — SearchReplaceEditCard apply 경로 요구사항.
  if (!blocks.some((b) => b.filepath && b.filepath.trim().length > 0)) {
    return { ok: false, reason: "missing_filepath" };
  }
  const filePaths = Array.from(
    new Set(blocks.map((b) => (b.filepath ?? "").trim()).filter((p) => p.length > 0)),
  );
  return { ok: true, blockCount: blocks.length, filePaths, noConfidentEdits: false };
}
