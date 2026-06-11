import { describe, expect, it } from "vitest";
import {
  createAgentConversationPromptSuggestions,
  extractAnswerSignals,
} from "./agentConversationPrompts";

const base = {
  displayName: "마키마",
  memoryRecordCount: 4,
  messageCount: 2,
  pendingApprovalCount: 1,
  role: "orchestrator" as const,
};

describe("createAgentConversationPromptSuggestions", () => {
  it("에이전트 답변이 아직 없으면 아무 제안도 만들지 않는다", () => {
    expect(createAgentConversationPromptSuggestions({ ...base, activity: "idle" })).toEqual([]);
  });

  it("에이전트가 생각/응답 중일 때는 제안을 숨긴다 (답변 전 노출 금지)", () => {
    for (const activity of ["preparing", "tooling", "dispatching", "responding"] as const) {
      expect(
        createAgentConversationPromptSuggestions({
          ...base,
          activity,
          lastAssistantMessageContent: "이전 턴의 답변이 남아 있어도 새 답변 전에는 띄우지 않는다.",
        }),
      ).toEqual([]);
    }
  });

  it("세 제안 전부 방금 답변에서 파생된다 — 네트워크 오류 보고 시나리오", () => {
    const suggestions = createAgentConversationPromptSuggestions({
      ...base,
      activity: "idle",
      lastAssistantMessageContent:
        "마키마가 MiMo Token Plan OpenAI 호출에서 막혔어. 원인은 네트워크 계열로 보여.\n다음 조치: MiMo 직접 경로 재시도: 기본 인증값이 연결되어 있으면 DGX 프록시 없이 같은 공급자 경로로 다시 호출해줘.",
    });
    expect(suggestions).toHaveLength(3);
    // ① 핵심 문장을 인용해 원인 진단을 요구
    expect(suggestions[0]).toContain("호출에서 막혔어");
    expect(suggestions[0]).toContain("진단");
    // ② 답변이 제안한 다음 조치를 그대로 실행 지시로
    expect(suggestions[1]).toContain("다음 조치");
    expect(suggestions[1]).toContain("그대로 진행해줘");
    // ③ 단정("네트워크 계열로 보여")의 근거 검증
    expect(suggestions[2]).toContain("근거");
  });

  it("에이전트가 확인 질문을 던지면 추천이 '보낼 수 있는 답변' 3개로 바뀐다", () => {
    const suggestions = createAgentConversationPromptSuggestions({
      ...base,
      activity: "idle",
      lastAssistantMessageContent: "두 가지 경로가 있어. 어느 쪽으로 진행할까?",
    });
    expect(suggestions).toHaveLength(3);
    // ① 질문을 인용한 긍정 답변
    expect(suggestions[0]).toContain("어느 쪽으로 진행할까?");
    expect(suggestions[0]).toContain("응, 그렇게 진행해줘");
    // ② 대안 요구 답변
    expect(suggestions[1]).toContain("다른 대안");
    // ③ 전부 위임하고 시작
    expect(suggestions[2]).toContain("네 판단대로");
    expect(suggestions[2]).toContain("바로 시작해줘");
  });

  it("마크다운 표 안의 확인 질문도 답변 후보로 변환한다 (테트리스 시나리오)", () => {
    const suggestions = createAgentConversationPromptSuggestions({
      ...base,
      activity: "idle",
      lastAssistantMessageContent: [
        "테트리스, 좋네요. 실행 전에 몇 가지 확인하겠습니다.",
        "| 항목 | 질문 |",
        "|------|------|",
        "| **플랫폼** | 웹 브라우저(HTML/Canvas)로 만들까요? |",
        "| **조작** | 키보드 기본으로 갈까요? |",
      ].join("\n"),
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toContain("웹 브라우저(HTML/Canvas)로 만들까요?");
    expect(suggestions[0]).not.toContain("|");
    expect(suggestions[0]).toContain("응, 그렇게 진행해줘");
    expect(suggestions[1]).toContain("키보드 기본으로 갈까요?");
    expect(suggestions[2]).toContain("네 판단대로");
  });

  it("일반 답변도 세 슬롯(파고들기/실행/검증)이 모두 답변 기반", () => {
    const suggestions = createAgentConversationPromptSuggestions({
      ...base,
      activity: "idle",
      displayName: "렘",
      role: "executor",
      lastAssistantMessageContent: "배포 스크립트를 정리했습니다. 환경 변수 검증 단계를 추가하면 더 안전합니다.",
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.startsWith("렘,"))).toBe(true);
    // "추가하면" 행동 큐 → 실행 슬롯이 제안을 인용
    expect(suggestions.some((s) => s.includes("그대로 진행해줘"))).toBe(true);
  });
});

describe("extractAnswerSignals", () => {
  it("오류/행동/질문/주제를 분해한다", () => {
    const signals = extractAnswerSignals(
      "호출이 실패했어. 다음 조치: 직접 경로로 재시도해줘. 이대로 진행할까?",
    );
    expect(signals.isError).toBe(true);
    expect(signals.proposedAction).toContain("다음 조치");
    expect(signals.openQuestion).toContain("진행할까?");
    expect(signals.headline).toContain("호출이 실패했어");
  });

  it("긴 문장은 60자로 클램프한다", () => {
    const signals = extractAnswerSignals(`${"가".repeat(120)}.`);
    expect(signals.headline.length).toBeLessThanOrEqual(61);
    expect(signals.headline.endsWith("…")).toBe(true);
  });
});
