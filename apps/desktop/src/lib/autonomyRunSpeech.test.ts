import { describe, expect, it } from "vitest";
import { buildRunSpeechText } from "./autonomyRunSpeech";
import type { PersonaTaskOutcome } from "./personaTaskRunner";

const okOutcome = (loopStatus: "completed" | "failed" | "awaiting_human"): PersonaTaskOutcome =>
  ({
    ok: true,
    loopStatus,
    registry: { panes: [] } as never,
    session: { role: "code" } as never,
  }) as PersonaTaskOutcome;

describe("buildRunSpeechText", () => {
  it("실행 중이거나 결과 없으면 null", () => {
    expect(buildRunSpeechText({ running: true })).toBeNull();
    expect(buildRunSpeechText({ outcome: null })).toBeNull();
    expect(buildRunSpeechText({})).toBeNull();
  });

  it("완료는 <chuckle> 감정 태그 + 완료 문구", () => {
    const text = buildRunSpeechText({ personaName: "architect", outcome: okOutcome("completed") })!;
    expect(text).toContain("<chuckle>");
    expect(text).toContain("architect입니다.");
    expect(text).toContain("완료했어요");
    expect(text).toContain("code pane");
  });

  it("실패는 <sigh> 감정 태그", () => {
    const text = buildRunSpeechText({ outcome: okOutcome("failed") })!;
    expect(text).toContain("<sigh>");
    expect(text).toContain("실패했어요");
  });

  it("사람 승인 대기 문구", () => {
    const text = buildRunSpeechText({ outcome: okOutcome("awaiting_human") })!;
    expect(text).toContain("승인을 기다리고");
  });

  it("소환 실패(no_free_pane)는 <sigh> + 사유", () => {
    const outcome: PersonaTaskOutcome = { ok: false, reason: "no_free_pane" };
    const text = buildRunSpeechText({ outcome })!;
    expect(text).toContain("<sigh>");
    expect(text).toContain("비어 있는 pane");
  });

  it("페르소나 이름이 없으면 이름 없이 발화", () => {
    const text = buildRunSpeechText({ outcome: okOutcome("completed") })!;
    expect(text).not.toContain("입니다. 작업"); // who 접두 없음
    expect(text).toContain("완료했어요");
  });
});
