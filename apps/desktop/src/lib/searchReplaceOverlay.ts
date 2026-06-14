import type { ScaffoldOverlayFile } from "@ai-orchestrator/protocol";
import { applySearchReplace, parseSearchReplaceBlocks, type EditApplyResult } from "./editEngine";
import { evaluateScaffoldFile, type MissionScaffoldFile, type ScaffoldGateReason } from "./missionPublishPrefill";

/**
 * Search/Replace 편집 텍스트를 ScaffoldOverlay 형태로 변환하는 순수 다리.
 *
 * 입력: 현재 scaffold 파일 + Aider-style search/replace 텍스트
 * 출력:
 *   - blocks: 블록별 적용 결과(strategy/ok/reason)
 *   - overlayFiles: 한 블록 이상 적용되고 가드 통과한 파일들만(POST body로 직행)
 *   - skippedByGate: 가드에 막힌 파일들(secret/binary/too_large)
 *   - errors: 파일 매칭 자체가 안 된 블록(filepath 없음 / 새 파일 충돌 등)
 *
 * 정직성:
 *   - 결정적 — LLM 호출 0, 추측 0.
 *   - 한 파일에 여러 블록이 있으면 순서대로 적용한다(앞 결과가 뒤에 영향). 다음 블록의
 *     SEARCH가 안 맞으면 그 블록만 failed로 표시하고 진행 — 사일런트 폴백 X.
 *   - 가드는 result 파일에도 동일 적용. overlay라고 면제 X.
 *   - 자동 실행 0 — UI가 buildOverlayPlan으로 미리보기를 만들고, 사용자가 명시 클릭한
 *     경우에만 호출자가 scaffold/overlay POST를 한다.
 */

export type BlockOutcome =
  | { kind: "applied"; filepath: string; result: EditApplyResult }
  | { kind: "created"; filepath: string }
  | { kind: "failed"; filepath: string; result: EditApplyResult }
  | { kind: "error"; reason: BlockError; raw: { search: string; replace: string; filepath?: string } };

export type BlockError =
  | "missing_filepath"
  | "create_conflict";

export type FileOverlayResult = {
  path: string;
  /** 적용 후 content. 가드는 별도로 확인. */
  content: string;
  /** 이 파일에 들어간 블록 수(적용된 + 실패한). */
  blockTotal: number;
  blockApplied: number;
  /** 이 파일이 새로 만들어진 것인지 — search="" + 기존 파일 없음. */
  created: boolean;
  /** evaluateScaffoldFile 결과 — overlay에 포함되려면 ok=true여야 함. */
  gate: { ok: true } | { ok: false; reason: ScaffoldGateReason };
};

export type SearchReplaceOverlayPlan = {
  blocks: ReadonlyArray<BlockOutcome>;
  files: ReadonlyArray<FileOverlayResult>;
  /** overlay POST에 그대로 실을 파일들(gate.ok=true + 한 블록 이상 적용). */
  overlayFiles: ReadonlyArray<ScaffoldOverlayFile>;
  /** 가드에 막혀 overlayFiles에서 빠진 파일들. */
  skippedByGate: ReadonlyArray<{ path: string; reason: ScaffoldGateReason }>;
  /** 한 블록도 적용 안 된 파일(전체 실패) — overlay에서 빠짐. */
  noChangeFiles: ReadonlyArray<string>;
};

export function buildSearchReplaceOverlayPlan(
  currentFiles: ReadonlyArray<MissionScaffoldFile>,
  editText: string,
): SearchReplaceOverlayPlan {
  const rawBlocks = parseSearchReplaceBlocks(editText);
  // path → 현재 content (mutate해서 누적 적용)
  const fileContent = new Map<string, string>();
  for (const f of currentFiles) fileContent.set(f.path, f.newContent);

  // path → 적용 통계
  const fileStats = new Map<
    string,
    { blockTotal: number; blockApplied: number; created: boolean; existedAtStart: boolean }
  >();
  function stat(path: string): { blockTotal: number; blockApplied: number; created: boolean; existedAtStart: boolean } {
    let s = fileStats.get(path);
    if (!s) {
      s = {
        blockTotal: 0,
        blockApplied: 0,
        created: false,
        existedAtStart: fileContent.has(path),
      };
      fileStats.set(path, s);
    }
    return s;
  }

  const outcomes: BlockOutcome[] = [];

  for (const block of rawBlocks) {
    if (!block.filepath) {
      outcomes.push({
        kind: "error",
        reason: "missing_filepath",
        raw: { search: block.search, replace: block.replace },
      });
      continue;
    }
    const filepath = block.filepath;
    const existingContent = fileContent.get(filepath);

    // 새 파일 만들기: 기존에 없고 search가 비어 있을 때만.
    if (existingContent === undefined) {
      if (block.search.length === 0) {
        fileContent.set(filepath, block.replace);
        const s = stat(filepath);
        s.created = true;
        s.blockTotal += 1;
        s.blockApplied += 1;
        outcomes.push({ kind: "created", filepath });
      } else {
        // SEARCH가 있는데 파일이 없으면 적용 불가 — 사일런트 폴백 X.
        outcomes.push({
          kind: "error",
          reason: "create_conflict",
          raw: { search: block.search, replace: block.replace, filepath },
        });
      }
      continue;
    }

    const { content, result } = applySearchReplace(existingContent, {
      search: block.search,
      replace: block.replace,
    });
    const s = stat(filepath);
    s.blockTotal += 1;
    if (result.ok) {
      fileContent.set(filepath, content);
      s.blockApplied += 1;
      outcomes.push({ kind: "applied", filepath, result });
    } else {
      outcomes.push({ kind: "failed", filepath, result });
    }
  }

  // 결과 파일 빌드 — 한 블록 이상 적용된 파일만 후보.
  const files: FileOverlayResult[] = [];
  for (const [path, s] of fileStats.entries()) {
    if (s.blockApplied === 0) continue;
    const content = fileContent.get(path) ?? "";
    const gateRaw = evaluateScaffoldFile({ path, newContent: content });
    files.push({
      path,
      content,
      blockTotal: s.blockTotal,
      blockApplied: s.blockApplied,
      created: s.created && !s.existedAtStart,
      gate: gateRaw.ok ? { ok: true } : { ok: false, reason: gateRaw.reason },
    });
  }

  const overlayFiles: ScaffoldOverlayFile[] = files
    .filter((f) => f.gate.ok)
    .map((f) => ({ path: f.path, content: f.content }));

  const skippedByGate = files
    .filter((f) => !f.gate.ok)
    .map((f) => ({ path: f.path, reason: (f.gate as { ok: false; reason: ScaffoldGateReason }).reason }));

  const noChangeFiles: string[] = [];
  for (const [path, s] of fileStats.entries()) {
    if (s.blockApplied === 0) noChangeFiles.push(path);
  }

  return { blocks: outcomes, files, overlayFiles, skippedByGate, noChangeFiles };
}
