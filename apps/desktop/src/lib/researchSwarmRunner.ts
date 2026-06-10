import type { ResearchStepKind } from "./researchSwarm";

/**
 * 리서치 스웜 러너 — 요원 한 명을 LLM completion으로 구동해, 응답을 스텝
 * 스트림으로 분해하고 실행기(주입)로 도구를 돌린다.
 *
 * 1차 설계 결정(적대 검증 반영): 기본은 **completion 기반**이라 tmux pane /
 * curl 게이트 / dispatch-capture 레이스 등 치명 결함을 우회한다. 모델이 도구
 * 펜스를 내면 주입된 executeStep이 처리하는데, 기본 executor는 search/browse를
 * "지식 기반 요약 의도"로 처리(실웹 호출 없음, 정직)하고, 서버가 살아 있고
 * 게이트 도구가 활성화된 배포에서는 executor를 게이트 dispatch+센티널 폴링
 * capture로 교체할 수 있다.
 *
 * 와이어 프로토콜 — 모델은 스텝을 펜스로 낸다:
 *   ```step
 *   {"kind":"search","title":"opencode multi-agent","detail":"..."}
 *   ```
 * 텍스트는 think 스텝으로 간주. 마지막 텍스트(펜스 없는)는 conclusion.
 */

export type ResearchStepDirective = {
  kind: ResearchStepKind;
  title: string;
  detail?: string;
  /** write_file 전용 */
  path?: string;
  content?: string;
  /** search/browse 전용 */
  query?: string;
  url?: string;
};

export type ResearchStepResult = {
  status: "done" | "failed";
  output?: string;
  resultCount?: number;
};

export type ResearchWireMessage = { role: "user" | "assistant" | "system"; content: string };

export type ResearchCompleteFn = (
  messages: ResearchWireMessage[],
  hooks: { onDelta?: (textSoFar: string) => void },
) => Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number } }>;

/** 스텝 지시 → 결과 (게이트 dispatch / 지식기반 / 노트쓰기 등 주입) */
export type ResearchStepExecutor = (directive: ResearchStepDirective) => Promise<ResearchStepResult>;

export type ResearchAgentEvent =
  | { type: "step_begin"; id: string; directive: ResearchStepDirective }
  | { type: "step_settle"; id: string; result: ResearchStepResult }
  | { type: "conclusion"; text: string };

const STEP_FENCE = /```step\s*\n([\s\S]*?)```/g;
const STEP_KINDS: ReadonlySet<string> = new Set([
  "think",
  "todo",
  "search",
  "browse",
  "terminal",
  "write_file",
]);

/** 어시스턴트 응답을 스텝 지시 + 꼬리 결론 텍스트로 분해. 불량 JSON은 think로 강등. */
export function parseResearchReply(text: string): {
  directives: ResearchStepDirective[];
  conclusion: string;
} {
  const directives: ResearchStepDirective[] = [];
  let cursor = 0;
  let conclusion = "";
  STEP_FENCE.lastIndex = 0;
  for (let match = STEP_FENCE.exec(text); match; match = STEP_FENCE.exec(text)) {
    const before = text.slice(cursor, match.index).trim();
    if (before) directives.push({ kind: "think", title: clampLine(before) });
    cursor = match.index + match[0].length;
    const raw = match[1]!.trim();
    let parsed: ResearchStepDirective | null = null;
    try {
      const candidate = JSON.parse(raw) as Record<string, unknown>;
      if (candidate && STEP_KINDS.has(String(candidate.kind))) {
        parsed = {
          kind: candidate.kind as ResearchStepKind,
          title: String(candidate.title ?? candidate.query ?? candidate.url ?? candidate.path ?? "단계"),
          detail: candidate.detail ? String(candidate.detail) : undefined,
          path: candidate.path ? String(candidate.path) : undefined,
          content: candidate.content ? String(candidate.content) : undefined,
          query: candidate.query ? String(candidate.query) : undefined,
          url: candidate.url ? String(candidate.url) : undefined,
        };
      }
    } catch {
      parsed = null;
    }
    directives.push(parsed ?? { kind: "think", title: clampLine(raw) });
  }
  const tail = text.slice(cursor).trim();
  if (tail) conclusion = tail;
  return { directives, conclusion };
}

function clampLine(text: string, limit = 90): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > limit ? `${single.slice(0, limit)}…` : single;
}

export const RESEARCH_DEFAULT_MAX_ROUNDS = 16;

export function buildResearchSystemPrompt(input: { topic: string; persona: string; task: string }): string {
  return [
    `당신은 리서치 스웜의 요원 "${input.persona}"입니다. 전체 주제: "${input.topic}".`,
    `당신의 임무: ${input.task}`,
    "조사 과정을 스텝으로 드러내세요. 도구가 필요하면 reply 안에 펜스를 포함하세요:",
    '```step',
    '{"kind":"search","title":"검색어","query":"검색어","detail":"왜 검색하는지"}',
    "```",
    '사용 가능한 kind: think(생각) · todo(할 일 목록) · search(검색) · browse(열람, url) · write_file(노트 저장, path+content).',
    "텍스트만 쓰면 think 스텝이 됩니다. 충분히 조사한 뒤, 펜스 없이 결론을 마크다운으로 정리하면 종료됩니다.",
    "마지막에는 반드시 write_file 스텝으로 조사 노트를 남기고, 핵심 발견을 결론 텍스트로 요약하세요.",
    "출처가 불확실하면 단정하지 말고 '추정'이라고 표시하세요.",
  ].join("\n");
}

export type RunResearchAgentInput = {
  systemPrompt: string;
  kickoff: string;
  complete: ResearchCompleteFn;
  executeStep: ResearchStepExecutor;
  onEvent: (event: ResearchAgentEvent) => void;
  makeStepId: (round: number, index: number) => string;
  maxRounds?: number;
  isCancelled?: () => boolean;
};

export type ResearchAgentOutcome = {
  status: "done" | "cancelled" | "max_rounds";
  rounds: number;
  conclusion: string;
  usage: { inputTokens: number; outputTokens: number };
};

/** 요원 한 명의 리서치 루프: completion → 스텝 실행 → 결과 회신 → 반복. */
export async function runResearchAgent(input: RunResearchAgentInput): Promise<ResearchAgentOutcome> {
  const maxRounds = input.maxRounds ?? RESEARCH_DEFAULT_MAX_ROUNDS;
  const conversation: ResearchWireMessage[] = [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: input.kickoff },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let lastConclusion = "";

  for (let round = 0; round < maxRounds; round += 1) {
    if (input.isCancelled?.()) return { status: "cancelled", rounds: round, conclusion: lastConclusion, usage };

    const reply = await input.complete(conversation, {});
    usage.inputTokens += reply.usage?.inputTokens ?? 0;
    usage.outputTokens += reply.usage?.outputTokens ?? 0;
    conversation.push({ role: "assistant", content: reply.content });

    const { directives, conclusion } = parseResearchReply(reply.content);
    const hasConclusion = Boolean(conclusion);
    if (conclusion) {
      lastConclusion = conclusion;
      input.onEvent({ type: "conclusion", text: conclusion });
    }

    // 실행할 외부 스텝(think/todo 제외)이 없으면 종료
    const actionable = directives.filter((d) => d.kind !== "think" && d.kind !== "todo");
    // think/todo 스텝도 타임라인에 남긴다
    for (const [index, directive] of directives.entries()) {
      const id = input.makeStepId(round, index);
      input.onEvent({ type: "step_begin", id, directive });
      if (directive.kind === "think" || directive.kind === "todo") {
        input.onEvent({ type: "step_settle", id, result: { status: "done" } });
      }
    }

    if (actionable.length === 0) {
      return { status: "done", rounds: round + 1, conclusion: lastConclusion, usage };
    }

    const results: string[] = [];
    for (const [index, directive] of directives.entries()) {
      if (directive.kind === "think" || directive.kind === "todo") continue;
      if (input.isCancelled?.()) return { status: "cancelled", rounds: round + 1, conclusion: lastConclusion, usage };
      const id = input.makeStepId(round, index);
      let result: ResearchStepResult;
      try {
        result = await input.executeStep(directive);
      } catch (error) {
        result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
      }
      input.onEvent({ type: "step_settle", id, result });
      const tag = result.status === "done" ? "" : " FAILED";
      results.push(`[${directive.kind}${tag}] ${directive.title}\n${result.output ?? ""}`.slice(0, 4000));
    }

    // 결론 텍스트를 동봉한 라운드는 (도구 실행 후) 종료 — 모델이 최종 정리를
    // 끝낸 신호. 노트 저장과 결론을 한 응답에 담아 불필요한 추가 라운드를 없앤다.
    if (hasConclusion) {
      return { status: "done", rounds: round + 1, conclusion: lastConclusion, usage };
    }

    let payload = results.join("\n\n");
    if (round >= maxRounds - 4) {
      payload += `\n\n[시스템] 라운드 ${round + 1}/${maxRounds}. 곧 종료해야 합니다 — write_file로 노트를 저장하고 결론을 정리하세요.`;
    }
    conversation.push({ role: "user", content: payload });
  }

  return { status: "max_rounds", rounds: maxRounds, conclusion: lastConclusion, usage };
}

// ─── 기본 실행기 (서버 무관, 지식 기반) ──────────────────────────────────────

/**
 * 서버/게이트 없이 동작하는 기본 실행기 — search/browse는 "지식 기반 의도"로
 * 표시(실웹 호출 없음, 정직), write_file은 클라이언트 메모리에 보관해 사용자가
 * 다운로드. 게이트 도구가 활성화된 배포에서는 이 자리를 게이트 executor로 교체.
 */
export function createKnowledgeStepExecutor(onNote: (path: string, content: string) => void): ResearchStepExecutor {
  return async (directive) => {
    switch (directive.kind) {
      case "search":
        return {
          status: "done",
          output: `지식 기반 요약 (실시간 웹 호출 아님): "${directive.query ?? directive.title}" 관련 핵심을 다음 단계에서 정리합니다.`,
          resultCount: 0,
        };
      case "browse":
        return {
          status: "done",
          output: `열람 의도: ${directive.url ?? directive.title} — 지식 기반으로 핵심만 추립니다.`,
        };
      case "write_file": {
        const path = directive.path ?? `${directive.title}.md`;
        onNote(path, directive.content ?? "");
        return { status: "done", output: `노트 작성됨: ${path} (다운로드 가능)` };
      }
      case "terminal":
        return { status: "failed", output: "터미널은 게이트 실행기에서만 사용 가능합니다." };
      default:
        return { status: "done" };
    }
  };
}
