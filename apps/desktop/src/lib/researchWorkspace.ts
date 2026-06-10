/**
 * 리서치 노트 워크스페이스 — 경로 검증/슬러그화 + markdown 빌더.
 *
 * 적대 검증 반영(#4): write_file 경로는 절대 셸에 그대로 내려보내지 않는다.
 * research/ 프리픽스 강제, `..` 탈출 거부, 파일명 슬러그화(영숫자/하이픈/한글),
 * heredoc 종료 마커 충돌 회피. 노트는 클라이언트가 보유하고 사용자가 다운로드
 * 하거나(서버 무관), 검증된 경로로만 게이트 쓰기에 사용한다.
 */

export const RESEARCH_NOTE_ROOT = "research";

/** 파일명을 안전한 슬러그로: 영숫자/한글/하이픈만, 길이 제한, 빈값 폴백 */
export function slugifyNoteName(raw: string): string {
  const base = raw
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[^0-9A-Za-z가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base.length > 0 ? base : "note";
}

export type SafeNotePath = { ok: true; path: string } | { ok: false; reason: string };

/**
 * 사용자/LLM이 준 경로를 research/ 아래의 안전한 .md 경로로 정규화.
 * 절대경로·상위탈출·하위디렉터리 전부 거부하고 단일 슬러그 파일만 허용한다.
 */
export function safeNotePath(raw: string): SafeNotePath {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "빈 경로" };
  if (trimmed.includes("..")) return { ok: false, reason: "상위 디렉터리 탈출 금지" };
  if (/^([a-zA-Z]:|\/|\\|~)/.test(trimmed)) return { ok: false, reason: "절대 경로 금지" };
  // research/ 프리픽스를 떼고 마지막 경로 요소만 슬러그화 (하위 디렉터리 무시)
  const tail = trimmed.replace(/^research[/\\]/i, "").split(/[/\\]/).pop() ?? "";
  const slug = slugifyNoteName(tail);
  return { ok: true, path: `${RESEARCH_NOTE_ROOT}/${slug}.md` };
}

/** heredoc 종료 마커 충돌 회피용 — 본문에 등장하지 않는 마커를 만든다 */
export function safeHeredocMarker(content: string, seed: string): string {
  let marker = "__ORCH_NOTE__";
  let salt = seed.replace(/[^0-9A-Za-z]/g, "").slice(0, 6) || "X";
  while (content.includes(marker)) {
    marker = `__ORCH_NOTE_${salt}__`;
    salt += "X";
  }
  return marker;
}

export type ResearchNote = {
  topic: string;
  agentName: string;
  task: string;
  /** 본문 마크다운 */
  body: string;
  createdAt: string;
};

/** 요원 한 명의 조사 결과를 인용 가능한 마크다운 노트로 */
export function buildResearchNote(note: ResearchNote): string {
  return [
    `# ${note.topic} — ${note.agentName} 조사 노트`,
    "",
    `> 임무: ${note.task}`,
    `> 작성: ${note.createdAt}`,
    "",
    note.body.trim(),
    "",
  ].join("\n");
}

/** 스웜 전체 노트를 하나의 보고서로 합본 (Manus 최종 보고서 스타일) */
export function combineResearchReport(input: {
  topic: string;
  createdAt: string;
  sections: Array<{ agentName: string; task: string; body: string }>;
}): string {
  const lines = [
    `# ${input.topic} — 리서치 스웜 종합 보고서`,
    "",
    `> 작성: ${input.createdAt} · 요원 ${input.sections.length}명`,
    "",
    "## 목차",
    ...input.sections.map((section, index) => `${index + 1}. ${section.agentName} — ${section.task}`),
    "",
  ];
  for (const [index, section] of input.sections.entries()) {
    lines.push(`## ${index + 1}. ${section.agentName} — ${section.task}`, "", section.body.trim(), "");
  }
  return lines.join("\n");
}
