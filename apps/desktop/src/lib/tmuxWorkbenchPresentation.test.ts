import { describe, expect, it } from "vitest";
import {
  compactTmuxPreview,
  formatTmuxPaneSurfaceLabel,
  formatTmuxDifficultyLabel,
  formatTmuxPaneCountLabel,
  sanitizeTmuxWorkbenchText,
  tmuxPaneStateLabel,
  tmuxPaneRoleLabel,
  tmuxWorkbenchCopy,
} from "./tmuxWorkbenchPresentation";

describe("tmuxWorkbenchPresentation", () => {
  it("Tmux 작업대의 주요 라벨을 한국어로 제공한다", () => {
    expect(tmuxWorkbenchCopy.kicker).toBe("터미널 작업대");
    expect(tmuxWorkbenchCopy.recommendationLabel).toBe("작업 배치 추천");
    expect(formatTmuxPaneCountLabel(6)).toBe("패널 6개");
    expect(formatTmuxDifficultyLabel("critical")).toBe("고위험");
  });

  it("pane role을 작업대용 한국어 라벨로 변환한다", () => {
    expect(tmuxPaneRoleLabel("discussion")).toBe("논의");
    expect(tmuxPaneRoleLabel("orchestrator")).toBe("지휘");
    expect(tmuxPaneRoleLabel("frontend")).toBe("프론트");
    expect(tmuxPaneRoleLabel("memory")).toBe("기억");
  });

  it("내부 pane id를 사용자 표면용 작업창 라벨로 변환한다", () => {
    expect(formatTmuxPaneSurfaceLabel("pane-0")).toBe("작업창 1");
    expect(formatTmuxPaneSurfaceLabel("pane-7")).toBe("작업창 8");
    expect(formatTmuxPaneSurfaceLabel("%4")).toBe("작업창 %4");
    expect(formatTmuxPaneSurfaceLabel("role:status")).toBe("작업창 기타");
  });

  it("pane 상태 라벨을 사용자 표면에서 한국어로 바꾼다", () => {
    expect(tmuxPaneStateLabel("chat active")).toBe("대화 중");
    expect(tmuxPaneStateLabel("blocked")).toBe("차단됨");
    expect(tmuxPaneStateLabel("dispatch gated")).toBe("승인 필요");
    expect(tmuxPaneStateLabel("watch only")).toBe("감시 전용");
    expect(tmuxPaneStateLabel("idle")).toBe("대기");
  });

  it("작업대 공지와 출력 미리보기에서 비밀/경로/원문 입력을 마스킹한다", () => {
    const text = [
      "tool input: open /Users/robin/private.txt",
      "https://token-plan-sgp.xiaomimimo.com/v1",
      "Bearer abc.secret",
      "MIMO_API_KEY=tp-1234567890abcdef",
    ].join("\n");

    const sanitized = sanitizeTmuxWorkbenchText(text);

    expect(sanitized).toContain("[redacted:internal]");
    expect(sanitized).not.toContain("/Users/robin/private.txt");
    expect(sanitized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(sanitized).not.toContain("tp-1234567890abcdef");
  });

  it("긴 출력은 마스킹 후 짧은 공개 미리보기로 줄인다", () => {
    const preview = compactTmuxPreview(`line ${"x".repeat(500)} sk-1234567890abcdef`, 80);

    expect(preview.length).toBeLessThanOrEqual(81);
    expect(preview).toContain("…");
    expect(preview).not.toContain("sk-1234567890abcdef");
  });
});
