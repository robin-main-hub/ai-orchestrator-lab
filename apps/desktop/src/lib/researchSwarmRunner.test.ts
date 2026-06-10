import { describe, expect, it, vi } from "vitest";
import {
  buildResearchSystemPrompt,
  createKnowledgeStepExecutor,
  parseResearchReply,
  runResearchAgent,
  type ResearchAgentEvent,
  type ResearchWireMessage,
} from "./researchSwarmRunner";

describe("parseResearchReply", () => {
  it("텍스트는 think로, 펜스는 지시로 분해하고 꼬리를 결론으로", () => {
    const reply = [
      "먼저 생태계를 파악합니다.",
      "```step",
      '{"kind":"search","query":"opencode multi-agent","title":"오픈코드 멀티에이전트"}',
      "```",
      "정리하면 다음과 같습니다.",
    ].join("\n");
    const { directives, conclusion } = parseResearchReply(reply);
    expect(directives[0]).toMatchObject({ kind: "think" });
    expect(directives[1]).toMatchObject({ kind: "search", query: "opencode multi-agent" });
    expect(conclusion).toBe("정리하면 다음과 같습니다.");
  });

  it("알 수 없는 kind/불량 JSON은 think로 강등", () => {
    const { directives } = parseResearchReply('```step\n{"kind":"hack","x":1}\n```\n```step\n{nope\n```');
    expect(directives.every((d) => d.kind === "think")).toBe(true);
  });
});

describe("runResearchAgent", () => {
  it("스텝을 실행해 결과를 회신하고 결론에서 종료한다", async () => {
    const replies = [
      '조사 시작.\n```step\n{"kind":"search","query":"q","title":"q"}\n```',
      '노트를 남깁니다.\n```step\n{"kind":"write_file","path":"research/x.md","content":"본문","title":"x"}\n```\n핵심 결론 요약.',
    ];
    const complete = vi.fn(async (messages: ResearchWireMessage[]) => {
      void messages;
      return { content: replies.shift()!, usage: { inputTokens: 10, outputTokens: 4 } };
    });
    const notes: Array<[string, string]> = [];
    const executeStep = createKnowledgeStepExecutor((path, content) => notes.push([path, content]));
    const events: ResearchAgentEvent[] = [];

    const outcome = await runResearchAgent({
      systemPrompt: "sys",
      kickoff: "시작",
      complete,
      executeStep,
      onEvent: (event) => events.push(event),
      makeStepId: (round, index) => `r${round}s${index}`,
    });

    expect(outcome.status).toBe("done");
    expect(outcome.conclusion).toContain("핵심 결론");
    expect(outcome.usage.inputTokens).toBe(20);
    expect(notes).toEqual([["research/x.md", "본문"]]);
    // search와 write_file 각각 begin+settle
    const settles = events.filter((e) => e.type === "step_settle");
    expect(settles.length).toBeGreaterThanOrEqual(2);
  });

  it("외부 스텝 없는 첫 응답(결론만)이면 즉시 종료", async () => {
    const complete = vi.fn(async () => ({ content: "도구 없이 바로 결론." }));
    const outcome = await runResearchAgent({
      systemPrompt: "sys",
      kickoff: "x",
      complete,
      executeStep: vi.fn(),
      onEvent: () => {},
      makeStepId: (r, i) => `${r}-${i}`,
    });
    expect(outcome.status).toBe("done");
    expect(outcome.rounds).toBe(1);
  });

  it("취소 신호로 라운드 사이에서 멈춘다", async () => {
    let cancelled = false;
    const complete = vi.fn(async () => {
      cancelled = true;
      return { content: '```step\n{"kind":"search","query":"q","title":"q"}\n```' };
    });
    const outcome = await runResearchAgent({
      systemPrompt: "s",
      kickoff: "x",
      complete,
      executeStep: createKnowledgeStepExecutor(() => {}),
      onEvent: () => {},
      makeStepId: (r, i) => `${r}-${i}`,
      isCancelled: () => cancelled,
    });
    expect(outcome.status).toBe("cancelled");
  });
});

describe("buildResearchSystemPrompt", () => {
  it("주제·임무·스텝 펜스 형식을 담는다", () => {
    const prompt = buildResearchSystemPrompt({ topic: "T", persona: "마오마오", task: "검색" });
    expect(prompt).toContain("마오마오");
    expect(prompt).toContain("T");
    expect(prompt).toContain('"kind":"search"');
    expect(prompt).toContain("write_file");
  });
});
