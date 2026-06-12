/**
 * Search/replace block edit engine (P0-1, KIMI 브리프).
 *
 * 기존 edit 도구는 전체 파일 write(토큰 4~5배)나 적용 안 되는 diff 메시지뿐이라
 * 큰 파일·부분 수정에서 정합성이 깨졌다. 이 엔진은 Aider 스타일 search/replace
 * 블록을 받아 4단계 계층 매칭(exact → whitespace-insensitive → indentation-flexible
 * → difflib fuzzy)으로 적용한다.
 *
 * 우리 아키텍처는 클라이언트가 파일시스템에 직접 접근하지 않고 원격 tmux pane으로
 * 명령을 보낸다. 따라서:
 *   - applySearchReplace / applyEdits: 순수 TS 구현 — 알고리즘 명세를 단위 테스트로
 *     고정하고, 미리보기 diff·검증에 사용.
 *   - buildEditApplyScript: 동일한 4단계 알고리즘을 수행하는 python 인라인 스크립트를
 *     생성 — dgx-02에서 실제 파일에 원자적으로 적용(임시파일 → os.replace). edits는
 *     base64(JSON)로 전달해 heredoc 따옴표/이스케이프 문제를 원천 차단한다.
 */

export type EditBlock = {
  /** 찾을 원문 (정확히 일치 우선, 실패 시 단계적 완화) */
  search: string;
  /** 교체할 새 내용 */
  replace: string;
};

export type EditMatchStrategy =
  | "exact"
  | "whitespace"
  | "indentation"
  | "fuzzy"
  | "append" // search가 빈 문자열이면 파일 끝에 추가 (새 콘텐츠 삽입)
  | "failed";

export type EditApplyResult = {
  ok: boolean;
  strategy: EditMatchStrategy;
  /** 매칭 신뢰도 (fuzzy일 때 0~1, 그 외 1) */
  confidence: number;
  /** 실패 시 사람이 읽을 사유 */
  reason?: string;
};

const FENCE_PATTERN =
  /(?:^|\n)([^\n<]*?)\n?<{5,9}\s*SEARCH\s*\n([\s\S]*?)\n={5,9}\s*\n([\s\S]*?)\n>{5,9}\s*REPLACE/g;

/**
 * 모델 응답 텍스트에서 search/replace 블록을 추출한다. 파일명 라벨이 블록 바로
 * 위에 오면 함께 캡처한다. (도구 input으로 직접 줄 수도 있으므로 보조 경로)
 */
export function parseSearchReplaceBlocks(
  text: string,
): Array<EditBlock & { filepath?: string }> {
  const blocks: Array<EditBlock & { filepath?: string }> = [];
  FENCE_PATTERN.lastIndex = 0;
  for (let match = FENCE_PATTERN.exec(text); match; match = FENCE_PATTERN.exec(text)) {
    const filepath = match[1]?.trim() || undefined;
    blocks.push({ filepath, search: match[2] ?? "", replace: match[3] ?? "" });
  }
  return blocks;
}

/** 라인별 trailing 공백 제거 + CRLF 정규화 (whitespace-insensitive 매칭용) */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
}

/** 라인 앞 공백 제거 (indentation-flexible 매칭용) */
function stripIndent(text: string): string {
  return normalizeWhitespace(text)
    .split("\n")
    .map((line) => line.replace(/^\s+/, ""))
    .join("\n");
}

/** difflib.SequenceMatcher.ratio()와 동치인 유사도 (0~1) */
export function similarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 && b.length === 0) return 1;
  const matches = countMatchingChars(a, b);
  return (2 * matches) / (a.length + b.length);
}

/** SequenceMatcher의 matching-block 합계 (재귀 LCS-유사) */
function countMatchingChars(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  // 가장 긴 공통 부분문자열을 찾아 좌/우로 재귀 (difflib 방식)
  let bestA = 0;
  let bestB = 0;
  let bestSize = 0;
  const bIndex = new Map<string, number[]>();
  for (let j = 0; j < b.length; j += 1) {
    const arr = bIndex.get(b[j]!);
    if (arr) arr.push(j);
    else bIndex.set(b[j]!, [j]);
  }
  let lengthsByJ = new Map<number, number>();
  for (let i = 0; i < a.length; i += 1) {
    const next = new Map<number, number>();
    for (const j of bIndex.get(a[i]!) ?? []) {
      const k = (lengthsByJ.get(j - 1) ?? 0) + 1;
      next.set(j, k);
      if (k > bestSize) {
        bestSize = k;
        bestA = i - k + 1;
        bestB = j - k + 1;
      }
    }
    lengthsByJ = next;
  }
  if (bestSize === 0) return 0;
  return (
    bestSize +
    countMatchingChars(a.slice(0, bestA), b.slice(0, bestB)) +
    countMatchingChars(a.slice(bestA + bestSize), b.slice(bestB + bestSize))
  );
}

export const FUZZY_THRESHOLD = 0.85;

/**
 * 단일 search/replace 블록을 콘텐츠에 적용한다. 4단계 계층 매칭:
 *   1. exact            — 문자열 완전 일치
 *   2. whitespace       — 라인 trailing 공백/CRLF 무시
 *   3. indentation      — 라인 앞 공백까지 무시
 *   4. fuzzy(difflib)   — 슬라이딩 윈도우 유사도 ≥ 0.85
 * search가 빈 문자열이면 파일 끝에 replace를 추가(append).
 */
export function applySearchReplace(
  content: string,
  block: EditBlock,
): { content: string; result: EditApplyResult } {
  const { search, replace } = block;

  if (search.length === 0) {
    const joined = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
    return {
      content: `${joined}${replace}`,
      result: { ok: true, strategy: "append", confidence: 1 },
    };
  }

  // 1. exact
  const exactIndex = content.indexOf(search);
  if (exactIndex !== -1) {
    return {
      content: content.slice(0, exactIndex) + replace + content.slice(exactIndex + search.length),
      result: { ok: true, strategy: "exact", confidence: 1 },
    };
  }

  // 2. whitespace-insensitive — 정규화된 텍스트에서 위치를 찾아 원본 구간 교체
  const wsHit = findNormalizedRange(content, search, normalizeWhitespace);
  if (wsHit) {
    return {
      content: content.slice(0, wsHit.start) + replace + content.slice(wsHit.end),
      result: { ok: true, strategy: "whitespace", confidence: 1 },
    };
  }

  // 3. indentation-flexible
  const indentHit = findNormalizedRange(content, search, stripIndent);
  if (indentHit) {
    return {
      content: content.slice(0, indentHit.start) + replace + content.slice(indentHit.end),
      result: { ok: true, strategy: "indentation", confidence: 1 },
    };
  }

  // 4. fuzzy — 라인 단위 슬라이딩 윈도우
  const fuzzy = findBestFuzzyRange(content, search);
  if (fuzzy && fuzzy.ratio >= FUZZY_THRESHOLD) {
    return {
      content: content.slice(0, fuzzy.start) + replace + content.slice(fuzzy.end),
      result: { ok: true, strategy: "fuzzy", confidence: fuzzy.ratio },
    };
  }

  return {
    content,
    result: {
      ok: false,
      strategy: "failed",
      confidence: fuzzy?.ratio ?? 0,
      reason:
        fuzzy && fuzzy.ratio > 0.5
          ? `검색 블록을 찾지 못함 (최대 유사도 ${(fuzzy.ratio * 100).toFixed(0)}%) — SEARCH가 현재 파일과 일치하는지 확인하세요`
          : "검색 블록을 파일에서 찾지 못함",
    },
  };
}

/** 정규화 함수로 매칭되는 원본 구간 [start,end)를 찾는다 */
function findNormalizedRange(
  content: string,
  search: string,
  normalize: (text: string) => string,
): { start: number; end: number } | null {
  const normContent = normalize(content);
  const normSearch = normalize(search);
  if (normSearch.length === 0) return null;
  const normIndex = normContent.indexOf(normSearch);
  if (normIndex === -1) return null;
  // 정규화는 라인 단위라 라인 경계가 보존된다 → 라인 인덱스로 원본 구간 환산
  const searchLineCount = normSearch.split("\n").length;
  const startLine = normContent.slice(0, normIndex).split("\n").length - 1;
  return rangeForLines(content, startLine, searchLineCount);
}

/** content에서 [startLine, startLine+count) 라인의 문자 오프셋 구간 */
function rangeForLines(
  content: string,
  startLine: number,
  count: number,
): { start: number; end: number } {
  const lines = content.split("\n");
  let start = 0;
  for (let i = 0; i < startLine; i += 1) start += lines[i]!.length + 1;
  let end = start;
  for (let i = startLine; i < startLine + count && i < lines.length; i += 1) {
    end += lines[i]!.length + (i < lines.length - 1 ? 1 : 0);
  }
  return { start, end };
}

/** 라인 윈도우를 밀며 search와 가장 유사한 원본 구간을 찾는다 */
function findBestFuzzyRange(
  content: string,
  search: string,
): { start: number; end: number; ratio: number } | null {
  const contentLines = content.split("\n");
  const searchLines = search.split("\n");
  const window = searchLines.length;
  if (window === 0 || contentLines.length < window) {
    const ratio = similarityRatio(content, search);
    return { start: 0, end: content.length, ratio };
  }
  let best: { start: number; end: number; ratio: number } | null = null;
  for (let i = 0; i + window <= contentLines.length; i += 1) {
    const candidate = contentLines.slice(i, i + window).join("\n");
    const ratio = similarityRatio(candidate, search);
    if (!best || ratio > best.ratio) {
      const { start, end } = rangeForLines(content, i, window);
      best = { start, end, ratio };
    }
  }
  return best;
}

export type ApplyEditsResult = {
  content: string;
  applied: number;
  total: number;
  results: EditApplyResult[];
};

/** 여러 블록을 순차 적용한다. 한 블록이 실패해도 나머지는 계속 시도한다. */
export function applyEdits(content: string, blocks: EditBlock[]): ApplyEditsResult {
  let working = content;
  const results: EditApplyResult[] = [];
  let applied = 0;
  for (const block of blocks) {
    const { content: next, result } = applySearchReplace(working, block);
    results.push(result);
    if (result.ok) {
      working = next;
      applied += 1;
    }
  }
  return { content: working, applied, total: blocks.length, results };
}

/** edit 도구 input(유연한 형태)을 EditBlock[]로 정규화 */
export function normalizeEditInput(input: Record<string, unknown>): EditBlock[] {
  if (Array.isArray(input.edits)) {
    return input.edits
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        search: String(entry.search ?? entry.oldText ?? entry.old ?? ""),
        replace: String(entry.replace ?? entry.newText ?? entry.new ?? ""),
      }));
  }
  // 단일 블록 (search/replace 또는 oldText/newText 별칭)
  const search = input.search ?? input.oldText ?? input.old;
  const replace = input.replace ?? input.newText ?? input.new;
  if (typeof search === "string" || typeof replace === "string") {
    return [{ search: String(search ?? ""), replace: String(replace ?? "") }];
  }
  // 마지막 보조: diff 텍스트 안에 fence 블록이 들어온 경우
  if (typeof input.diff === "string") {
    const parsed = parseSearchReplaceBlocks(input.diff);
    if (parsed.length > 0) return parsed.map(({ search, replace }) => ({ search, replace }));
  }
  return [];
}

/** base64(UTF-8) 인코딩 — 노드/브라우저 양쪽 */
function toBase64Utf8(text: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf-8").toString("base64");
  // 브라우저 폴백
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * dgx-02 tmux pane에서 실행할 python 적용 명령을 생성한다. edits를 base64(JSON)로
 * 넘겨 따옴표/특수문자 문제를 제거하고, 임시파일 → os.replace로 원자적 저장한다.
 * 4단계 매칭(exact → whitespace → indentation → difflib fuzzy)을 python 표준
 * 라이브러리(difflib)만으로 수행하므로 추가 의존성이 없다.
 */
export function buildEditApplyScript(path: string, blocks: EditBlock[]): string | null {
  const cleanPath = path.trim();
  if (!cleanPath || blocks.length === 0) return null;
  const payload = toBase64Utf8(JSON.stringify({ path: cleanPath, edits: blocks }));
  // python 본문은 single-quoted heredoc 안에 두어 셸 확장을 막는다.
  const py = String.raw`import base64,json,os,sys,difflib,tempfile
P=json.loads(base64.b64decode("${payload}").decode("utf-8"))
path=P["path"]
try:
    with open(path,"r",encoding="utf-8") as f: src=f.read()
except FileNotFoundError:
    src=""
def norm_ws(t): return "\n".join(l.rstrip() for l in t.replace("\r\n","\n").split("\n"))
def strip_ind(t): return "\n".join(l.strip() for l in norm_ws(t).split("\n"))
def line_range(content,start,count):
    lines=content.split("\n"); s=0
    for i in range(start): s+=len(lines[i])+1
    e=s
    for i in range(start,min(start+count,len(lines))): e+=len(lines[i])+(1 if i<len(lines)-1 else 0)
    return s,e
def find_norm(content,search,fn):
    nc=fn(content); ns=fn(search)
    if not ns: return None
    idx=nc.find(ns)
    if idx<0: return None
    start_line=nc[:idx].count("\n"); cnt=ns.count("\n")+1
    return line_range(content,start_line,cnt)
def find_fuzzy(content,search):
    cl=content.split("\n"); sl=search.split("\n"); w=len(sl)
    if w==0 or len(cl)<w: return (0,len(content),difflib.SequenceMatcher(None,content,search).ratio())
    best=None
    for i in range(0,len(cl)-w+1):
        cand="\n".join(cl[i:i+w]); r=difflib.SequenceMatcher(None,cand,search).ratio()
        if best is None or r>best[2]:
            s,e=line_range(content,i,w); best=(s,e,r)
    return best
applied=0; total=len(P["edits"]); msgs=[]
for k,blk in enumerate(P["edits"]):
    se=blk.get("search",""); rep=blk.get("replace","")
    if se=="":
        if src and not src.endswith("\n"): src+="\n"
        src+=rep; applied+=1; msgs.append("edit %d: append"%(k+1)); continue
    i=src.find(se)
    if i>=0:
        src=src[:i]+rep+src[i+len(se):]; applied+=1; msgs.append("edit %d: exact"%(k+1)); continue
    hit=find_norm(src,se,norm_ws) or find_norm(src,se,strip_ind)
    if hit:
        src=src[:hit[0]]+rep+src[hit[1]:]; applied+=1; msgs.append("edit %d: whitespace"%(k+1)); continue
    fz=find_fuzzy(src,se)
    if fz and fz[2]>=0.85:
        src=src[:fz[0]]+rep+src[fz[1]:]; applied+=1; msgs.append("edit %d: fuzzy %.0f%%"%(k+1,fz[2]*100)); continue
    msgs.append("edit %d: FAILED (max similarity %.0f%%)"%(k+1,(fz[2]*100 if fz else 0)))
d=os.path.dirname(path)
if d and not os.path.isdir(d): os.makedirs(d,exist_ok=True)
fd,tmp=tempfile.mkstemp(dir=d or ".",suffix=".orchedit")
with os.fdopen(fd,"w",encoding="utf-8") as f: f.write(src)
os.replace(tmp,path)
print("applied %d/%d to %s"%(applied,total,path))
for m in msgs: print("  "+m)
if applied<total: sys.exit(1)`;
  return `python3 - <<'__ORCH_PYEDIT__'\n${py}\n__ORCH_PYEDIT__`;
}
