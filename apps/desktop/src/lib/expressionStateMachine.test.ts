import { describe, expect, it } from "vitest";
import {
  ExpressionStateMachine,
  expressionCooldownMs,
  expressionPolarity,
} from "./expressionStateMachine";

describe("expressionPolarity / cooldown", () => {
  it("28키를 극성으로 분류", () => {
    expect(expressionPolarity("joy")).toBe("positive");
    expect(expressionPolarity("anger")).toBe("negative");
    expect(expressionPolarity("curiosity")).toBe("ambiguous");
    expect(expressionPolarity("neutral")).toBe("neutral");
  });
  it("부정/강한 감정은 긴 쿨다운, 긍정은 짧게", () => {
    expect(expressionCooldownMs("anger")).toBeGreaterThan(expressionCooldownMs("joy"));
    expect(expressionCooldownMs("neutral")).toBeLessThan(expressionCooldownMs("joy"));
  });
});

describe("ExpressionStateMachine — 히스테리시스/쿨다운", () => {
  it("같은 표정 후보는 전환 없음", () => {
    const sm = new ExpressionStateMachine({}, "joy");
    const d = sm.update({ candidate: "joy", confidence: 1, nowMs: 5000 });
    expect(d).toMatchObject({ changed: false, heldReason: "same" });
  });

  it("미세 신호(낮은 신뢰도)는 무시", () => {
    const sm = new ExpressionStateMachine({ entryConfidence: 0.4 });
    const d = sm.update({ candidate: "joy", confidence: 0.2, nowMs: 5000 });
    expect(d).toMatchObject({ changed: false, heldReason: "low_confidence" });
    expect(sm.current()).toBe("neutral");
  });

  it("쿨다운 내 재전환은 보류, 경과 후 전환", () => {
    const sm = new ExpressionStateMachine({}, "neutral");
    // neutral→joy 전환 (neutral 쿨다운 800ms, changedAt=0)
    expect(sm.update({ candidate: "joy", confidence: 1, nowMs: 1000 }).changed).toBe(true);
    // joy 쿨다운 1500ms 내 (1000~2500) 같은 극성(excitement) 시도 → cooldown 보류
    const held = sm.update({ candidate: "excitement", confidence: 1, nowMs: 1800 });
    expect(held.changed).toBe(false);
    expect(held.heldReason).toBe("cooldown");
    // joy 쿨다운 경과 후 전환 (positive→positive, flip 아님)
    const after = sm.update({ candidate: "excitement", confidence: 1, nowMs: 1000 + 1500 + 1 });
    expect(after.changed).toBe(true);
    expect(sm.current()).toBe("excitement");
  });

  it("극성 반전(positive↔negative)은 추가 딜레이", () => {
    const sm = new ExpressionStateMachine({ polarityFlipExtraMs: 500 }, "neutral");
    sm.update({ candidate: "joy", confidence: 1, nowMs: 1000 }); // neutral→joy
    // joy(positive)→anger(negative): cooldown 1500 + flip 500 = 2000 필요
    const tooEarly = sm.update({ candidate: "anger", confidence: 1, nowMs: 1000 + 1500 + 100 });
    expect(tooEarly.changed).toBe(false);
    expect(tooEarly.heldReason).toBe("polarity_flip");
    const ok = sm.update({ candidate: "anger", confidence: 1, nowMs: 1000 + 2000 + 1 });
    expect(ok.changed).toBe(true);
  });

  it("ambiguous↔positive는 극성 반전 아님 (cooldown만)", () => {
    const sm = new ExpressionStateMachine({}, "neutral");
    sm.update({ candidate: "curiosity", confidence: 1, nowMs: 1000 }); // neutral→curiosity(ambiguous)
    // curiosity 쿨다운(기본 2000) 경과 후 joy(positive) — flip 아님
    const ok = sm.update({ candidate: "joy", confidence: 1, nowMs: 1000 + 2000 + 1 });
    expect(ok.changed).toBe(true);
  });
});

describe("tick — neutral 자동 복귀", () => {
  it("마지막 후보 후 neutralReturnMs 지나면 neutral 복귀", () => {
    const sm = new ExpressionStateMachine({ neutralReturnMs: 4000 }, "neutral");
    sm.update({ candidate: "joy", confidence: 1, nowMs: 1000 });
    // joy 쿨다운(1500)도 지났고 마지막 후보(1000) 후 4000 경과 → 복귀
    const d = sm.tick(1000 + 4000 + 1);
    expect(d).toMatchObject({ expression: "neutral", changed: true });
  });
  it("neutralReturnMs=0이면 복귀 안 함", () => {
    const sm = new ExpressionStateMachine({}, "neutral");
    sm.update({ candidate: "joy", confidence: 1, nowMs: 1000 });
    expect(sm.tick(999999).changed).toBe(false);
    expect(sm.current()).toBe("joy");
  });
});
