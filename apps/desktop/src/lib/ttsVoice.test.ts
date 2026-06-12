import { describe, expect, it, vi } from "vitest";
import {
  buildTtsRequest,
  parseEmotionTags,
  resolveCharacterVoice,
  selectTtsEngine,
  speak,
} from "./ttsVoice";

describe("parseEmotionTags", () => {
  it("감정 태그를 추출하고 본문을 정리", () => {
    const r = parseEmotionTags("<laugh> 정말 웃기네 <sigh> 하지만 일하자");
    expect(r.tags).toEqual(["<laugh>", "<sigh>"]);
    expect(r.cleanText).toBe("정말 웃기네 하지만 일하자");
  });
  it("태그 없으면 빈 배열 + 원문", () => {
    expect(parseEmotionTags("안녕하세요")).toEqual({ cleanText: "안녕하세요", tags: [] });
  });
});

describe("selectTtsEngine — 라우팅", () => {
  it("감정 태그가 있으면 orpheus", () => {
    expect(selectTtsEngine({ text: "<laugh> 좋아" })).toBe("orpheus");
  });
  it("짧은 알림은 kokoro(초저지연)", () => {
    expect(selectTtsEngine({ text: "완료" })).toBe("kokoro");
    expect(selectTtsEngine({ text: "긴 문장".repeat(20), priority: "speed" })).toBe("kokoro");
  });
  it("품질 우선은 openai", () => {
    expect(selectTtsEngine({ text: "긴 설명 문장입니다", priority: "quality" })).toBe("openai");
  });
  it("로컬 불가면 openai 폴백", () => {
    expect(selectTtsEngine({ text: "<laugh> 좋아", localAvailable: false })).toBe("openai");
  });
});

describe("resolveCharacterVoice", () => {
  it("프리셋별 엔진 voice 매핑 + 오버라이드 병합", () => {
    const v = resolveCharacterVoice("calm");
    expect(v.kokoro).toBe("af_bella");
    expect(v.openai).toBe("sage");
    const o = resolveCharacterVoice("calm", { speed: 1.5 });
    expect(o.speed).toBe(1.5);
    expect(o.kokoro).toBe("af_bella");
  });
  it("알 수 없는 프리셋은 기본 voice", () => {
    expect(resolveCharacterVoice("unknown").kokoro).toBe("af_sky");
    expect(resolveCharacterVoice().orpheus).toBe("tara");
  });
});

describe("buildTtsRequest — 엔진별 감정 처리", () => {
  const voice = resolveCharacterVoice("direct");

  it("orpheus는 감정 태그를 그대로 유지", () => {
    const r = buildTtsRequest("<laugh> 좋네", "orpheus", voice)!;
    expect(r.engine).toBe("orpheus");
    expect(r.text).toContain("<laugh>");
    expect(r.voice).toBe(voice.orpheus);
  });

  it("openai는 태그를 제거하고 자연어 prosody 지시로 변환", () => {
    const r = buildTtsRequest("<sigh> 어쩔 수 없지", "openai", voice)!;
    expect(r.text).not.toContain("<sigh>");
    expect(r.instructions).toContain("한숨");
    expect(r.voice).toBe(voice.openai);
  });

  it("kokoro는 태그를 제거(미지원)", () => {
    const r = buildTtsRequest("<laugh> 하하", "kokoro", voice)!;
    expect(r.text).toBe("하하");
    expect(r.instructions).toBeUndefined();
  });

  it("빈 텍스트(태그만)는 null", () => {
    expect(buildTtsRequest("<laugh>", "kokoro", voice)).toBeNull();
  });
});

describe("speak — 라우팅→요청→합성", () => {
  it("감정 태그 발화를 orpheus로 합성", async () => {
    const synth = vi.fn(async () => ({ audioUrl: "blob://x" }));
    const out = await speak("<chuckle> 흥미롭네", { voicePreset: "calm", synthesize: synth });
    expect(out.request?.engine).toBe("orpheus");
    expect(out.audioUrl).toBe("blob://x");
    expect(synth).toHaveBeenCalledOnce();
  });
  it("빈 텍스트는 합성 호출 없이 에러", async () => {
    const synth = vi.fn(async () => ({ audioUrl: "x" }));
    const out = await speak("<laugh>", { synthesize: synth });
    expect(out.request).toBeNull();
    expect(out.error).toBeTruthy();
    expect(synth).not.toHaveBeenCalled();
  });
});
