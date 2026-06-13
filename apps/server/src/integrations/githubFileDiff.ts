/**
 * W3a — bounded unified diff for file change plan preview.
 *
 * 외부 라이브러리 없이 LCS 백트래킹으로 단순 unified diff를 만든다. 입력은 W3a 가드가
 * 미리 텍스트/사이즈를 강제하므로 여기서는 길이/라인 수만 한 번 더 가드한다.
 *
 *   - 콘텐츠 한도 64KiB / 라인 한도 2000 → DP O(n*m) 메모리 64 MB 미만(Uint32Array)
 *   - 한도 초과 시 LCS를 돌리지 않고 정직하게 "diff omitted"를 반환(truncated=true)
 *   - 결과 diff 문자열도 한도(DIFF_PREVIEW_MAX_CHARS) 초과 시 잘라낸다
 *
 * 출력은 사람이 읽는 preview 용도 — execute(W3b)에서 GitHub로 보내는 PUT 본문이 아니다.
 */

const MAX_CONTENT_FOR_DIFF = 64 * 1024; // 64 KiB per side
const MAX_LINES_FOR_DIFF = 2000;
const DIFF_PREVIEW_MAX_CHARS = 16 * 1024; // 16 KiB preview cap
const CONTEXT_LINES = 3;

export type UnifiedDiffResult = {
  diff: string;
  truncated: boolean;
  additions: number;
  deletions: number;
};

function omittedHeader(oldLabel: string, newLabel: string, reason: string): UnifiedDiffResult {
  return {
    diff: `--- ${oldLabel}\n+++ ${newLabel}\n# ${reason}`,
    truncated: true,
    additions: 0,
    deletions: 0,
  };
}

/**
 * old → new 라인 시퀀스 LCS 표를 만들고 백트래킹으로 편집 스크립트 생성.
 * 표는 dp[i][j] = LCS 길이로 정의. i는 oldLines 길이, j는 newLines 길이.
 */
function lcsBacktrack(oldLines: string[], newLines: string[]): Array<{ op: "="|"-"|"+"; line: string; oldIdx?: number; newIdx?: number }> {
  const n = oldLines.length;
  const m = newLines.length;
  // 메모리: (n+1)개의 Uint32Array. 2000*2000*4B = 16 MB 정도.
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = 0; i < n; i++) {
    const oi = oldLines[i]!;
    const dpi = dp[i]!;
    const dpi1 = dp[i + 1]!;
    for (let j = 0; j < m; j++) {
      if (oi === newLines[j]!) dpi1[j + 1] = dpi[j]! + 1;
      else dpi1[j + 1] = Math.max(dpi1[j]!, dpi[j + 1]!);
    }
  }
  const ops: Array<{ op: "="|"-"|"+"; line: string; oldIdx?: number; newIdx?: number }> = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1]! === newLines[j - 1]!) {
      ops.push({ op: "=", line: oldLines[i - 1]!, oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ op: "+", line: newLines[j - 1]!, newIdx: j - 1 });
      j--;
    } else {
      ops.push({ op: "-", line: oldLines[i - 1]!, oldIdx: i - 1 });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

export function generateUnifiedDiff(
  oldText: string,
  newText: string,
  oldLabel: string,
  newLabel: string,
): UnifiedDiffResult {
  if (oldText.length > MAX_CONTENT_FOR_DIFF || newText.length > MAX_CONTENT_FOR_DIFF) {
    return omittedHeader(
      oldLabel,
      newLabel,
      `파일이 너무 커서 diff 프리뷰를 생성하지 않습니다(old=${oldText.length}B, new=${newText.length}B, max=${MAX_CONTENT_FOR_DIFF}B)`,
    );
  }
  const oldLines = oldText.length === 0 ? [] : oldText.split("\n");
  const newLines = newText.length === 0 ? [] : newText.split("\n");
  if (oldLines.length > MAX_LINES_FOR_DIFF || newLines.length > MAX_LINES_FOR_DIFF) {
    return omittedHeader(
      oldLabel,
      newLabel,
      `라인 수가 너무 많아 diff 프리뷰를 생성하지 않습니다(old=${oldLines.length}, new=${newLines.length}, max=${MAX_LINES_FOR_DIFF})`,
    );
  }

  const ops = lcsBacktrack(oldLines, newLines);
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.op === "+") additions++;
    else if (op.op === "-") deletions++;
  }
  if (additions === 0 && deletions === 0) {
    // no-op은 호출자가 가드에서 차단 — 여기 도달하면 0/0 헤더만 반환.
    return {
      diff: `--- ${oldLabel}\n+++ ${newLabel}\n`,
      truncated: false,
      additions: 0,
      deletions: 0,
    };
  }

  const parts: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];

  // hunk 그룹화: 변경이 있는 위치를 중심으로 CONTEXT 줄씩 묶는다.
  // 인접 변경 사이의 동일 라인이 2*CONTEXT 이하면 한 hunk로 병합.
  let idx = 0;
  while (idx < ops.length) {
    // leading equals 건너뛰기 + 첫 변경 찾기
    while (idx < ops.length && ops[idx]!.op === "=") idx++;
    if (idx >= ops.length) break;
    // hunk 시작 = max(첫 변경 - CONTEXT, 0)
    const firstChange = idx;
    const hunkStart = Math.max(firstChange - CONTEXT_LINES, 0);
    let cursor = firstChange;
    let lastChange = firstChange;
    while (cursor < ops.length) {
      if (ops[cursor]!.op !== "=") {
        lastChange = cursor;
        cursor++;
        continue;
      }
      // 동일 라인 런 길이 측정
      let runStart = cursor;
      while (cursor < ops.length && ops[cursor]!.op === "=") cursor++;
      const runLen = cursor - runStart;
      if (cursor >= ops.length || runLen > CONTEXT_LINES * 2) {
        // hunk 끝 = lastChange + CONTEXT, 그러나 op 배열 길이 안쪽
        break;
      }
      // 그 외에는 같은 hunk로 흡수
    }
    const hunkEnd = Math.min(lastChange + 1 + CONTEXT_LINES, ops.length);

    // header @@ -oldStart,oldLen +newStart,newLen @@ 계산
    let oldStart = -1, oldLen = 0, newStart = -1, newLen = 0;
    for (let k = hunkStart; k < hunkEnd; k++) {
      const op = ops[k]!;
      if (op.op === "=" || op.op === "-") {
        if (oldStart < 0 && op.oldIdx !== undefined) oldStart = op.oldIdx;
        oldLen++;
      }
      if (op.op === "=" || op.op === "+") {
        if (newStart < 0 && op.newIdx !== undefined) newStart = op.newIdx;
        newLen++;
      }
    }
    // 1-based for unified diff convention. 빈 쪽이면 0,0.
    const oldHeader = oldLen === 0 ? "0,0" : `${oldStart + 1},${oldLen}`;
    const newHeader = newLen === 0 ? "0,0" : `${newStart + 1},${newLen}`;
    parts.push(`@@ -${oldHeader} +${newHeader} @@`);
    for (let k = hunkStart; k < hunkEnd; k++) {
      const op = ops[k]!;
      const prefix = op.op === "=" ? " " : op.op === "-" ? "-" : "+";
      parts.push(`${prefix}${op.line}`);
    }
    idx = hunkEnd;
  }

  let diff = parts.join("\n");
  let truncated = false;
  if (diff.length > DIFF_PREVIEW_MAX_CHARS) {
    diff = `${diff.slice(0, DIFF_PREVIEW_MAX_CHARS - 60)}\n# … diff truncated for preview (bounded)`;
    truncated = true;
  }
  return { diff, truncated, additions, deletions };
}
