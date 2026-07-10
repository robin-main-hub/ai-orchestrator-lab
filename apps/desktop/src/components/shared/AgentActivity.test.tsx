import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AgentPortrait,
  AgentStatePill,
  ThinkingDots,
  agentStateConfig,
  type AgentState,
} from "./AgentActivity";

describe("AgentActivity", () => {
  it("keeps the v0 activity state vocabulary and Korean labels stable", () => {
    const states: AgentState[] = [
      "idle",
      "thinking",
      "responding",
      "working",
      "waiting_approval",
      "blocked",
      "error",
      "success",
    ];

    expect(states.map((state) => agentStateConfig[state].label)).toEqual([
      "대기",
      "사고 중",
      "응답 중",
      "작업 중",
      "승인 대기",
      "차단됨",
      "오류",
      "완료",
    ]);
  });

  it("renders state pills with the operator-facing label", () => {
    const html = renderToStaticMarkup(<AgentStatePill state="waiting_approval" />);

    expect(html).toContain("승인 대기");
    expect(html).toContain("text-warning");
  });

  it("uses motion indicators for thinking and responding portraits", () => {
    const thinkingHtml = renderToStaticMarkup(
      <AgentPortrait initials="마키" state="thinking" />,
    );
    const respondingHtml = renderToStaticMarkup(
      <AgentPortrait initials="마키" state="responding" />,
    );

    expect(thinkingHtml).toContain("animate-spin");
    expect(respondingHtml).toContain("animate-spin");
    expect(respondingHtml).toContain("os-glow-running");
  });

  it("renders the shared thinking dots animation", () => {
    const html = renderToStaticMarkup(<ThinkingDots />);

    expect(html.match(/os-thinking-dot/g)).toHaveLength(3);
  });
});
