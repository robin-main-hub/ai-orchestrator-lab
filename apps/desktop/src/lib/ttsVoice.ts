/**
 * TTS character voice routing (P2-9, KIMI 브리프 / 서브컬처 축).
 *
 * 캐릭터별 보이스 프리셋 + 감정 태그(<laugh> 등) 파싱 + 로컬(dgx)/API 엔진
 * 라우팅을 추상화한다. 실제 합성(HTTP)은 TtsSynthesizer 인터페이스 뒤로 두고,
 * 이 모듈은 "어떤 엔진에 어떤 페이로드를 보낼지"를 순수 함수로 결정한다.
 *
 * 라우팅(브리프 4.2): 감정 태그가 있으면 Orpheus(감정 표현), 짧은 알림은
 * Kokoro(초저지연 로컬), 품질 우선이면 OpenAI(폴백). 로컬 우선 — 비용/지연/
 * 프라이버시.
 */

export type TtsEngine = "kokoro" | "orpheus" | "openai";

/** Orpheus가 인라인으로 지원하는 감정 태그 (브리프 3.7.2) */
export const EMOTION_TAGS = [
  "<laugh>", "<chuckle>", "<sigh>", "<gasp>", "<groan>", "<yawn>", "<cough>", "<sniffle>",
] as const;
export type EmotionTag = (typeof EMOTION_TAGS)[number];

const EMOTION_TAG_DESC: Record<string, string> = {
  "<laugh>": "웃으며",
  "<chuckle>": "가볍게 웃으며",
  "<sigh>": "한숨을 쉬며",
  "<gasp>": "놀라 숨을 들이쉬며",
  "<groan>": "신음하며",
  "<yawn>": "하품하며",
  "<cough>": "헛기침하며",
  "<sniffle>": "훌쩍이며",
};

export type ParsedSpeech = {
  /** 태그를 제거한 순수 발화 텍스트 */
  cleanText: string;
  /** 발견된 감정 태그 (등장 순서) */
  tags: EmotionTag[];
};

/** 텍스트에서 감정 태그를 추출하고 정리된 본문을 반환 */
export function parseEmotionTags(text: string): ParsedSpeech {
  const tags: EmotionTag[] = [];
  for (const m of text.matchAll(/<(laugh|chuckle|sigh|gasp|groan|yawn|cough|sniffle)>/g)) {
    tags.push(`<${m[1]}>` as EmotionTag);
  }
  const cleanText = text.replace(/<(?:laugh|chuckle|sigh|gasp|groan|yawn|cough|sniffle)>/g, "").replace(/\s{2,}/g, " ").trim();
  return { cleanText, tags };
}

export type EngineSelectionInput = {
  text: string;
  /** "speed"=초저지연, "quality"=고품질, "balanced"=기본 */
  priority?: "speed" | "quality" | "balanced";
  /** 로컬 엔진 사용 가능 여부 (서버 헬스 등). 기본 true */
  localAvailable?: boolean;
  /**
   * Orpheus(감정 엔진) 가용 여부. 기본 true. dgx에는 Kokoro만 설치돼 있고
   * Orpheus가 아직 없으면 false를 줘서, 감정 태그가 있어도 Kokoro(태그 제거)나
   * OpenAI로 우회시킨다.
   */
  orpheusAvailable?: boolean;
};

/** 짧은 알림 기준 (자) */
const SHORT_TEXT_CHARS = 50;

/** 발화에 맞는 엔진을 선택한다 (브리프 4.2 계층 라우팅의 경량판) */
export function selectTtsEngine(input: EngineSelectionInput): TtsEngine {
  const { tags } = parseEmotionTags(input.text);
  const priority = input.priority ?? "balanced";
  const localAvailable = input.localAvailable ?? true;
  const orpheusAvailable = input.orpheusAvailable ?? true;

  if (!localAvailable) return "openai"; // 로컬 불가 → API 폴백
  if (priority === "quality") return "openai";
  if (tags.length > 0) {
    if (orpheusAvailable) return "orpheus"; // 감정 태그 → 감정 지원 엔진
    return "kokoro"; // Orpheus 미설치 → Kokoro로 우회(태그는 buildTtsRequest에서 제거)
  }
  if (priority === "speed" || input.text.trim().length <= SHORT_TEXT_CHARS) return "kokoro";
  return "kokoro"; // 로컬 우선 기본
}

export type CharacterVoice = {
  /** 로컬 감정 엔진(Orpheus) voice id */
  orpheus?: string;
  /** 로컬 경량 엔진(Kokoro) voice id */
  kokoro?: string;
  /** API 폴백(OpenAI) voice id */
  openai?: string;
  /** 말하기 속도 배수 (기본 1.0) */
  speed?: number;
};

/** 페르소나 음색 프리셋 → 엔진별 기본 voice 매핑 */
const VOICE_PRESET_DEFAULTS: Record<string, CharacterVoice> = {
  direct: { kokoro: "af_sky", orpheus: "leah", openai: "alloy", speed: 1.05 },
  calm: { kokoro: "af_bella", orpheus: "mia", openai: "sage", speed: 0.92 },
  architect: { kokoro: "am_adam", orpheus: "leo", openai: "onyx", speed: 1.0 },
  reviewer: { kokoro: "af_nicole", orpheus: "jess", openai: "fable", speed: 1.0 },
  executor: { kokoro: "am_michael", orpheus: "zac", openai: "echo", speed: 1.1 },
};
const DEFAULT_VOICE: CharacterVoice = { kokoro: "af_sky", orpheus: "tara", openai: "alloy", speed: 1.0 };

/** 페르소나 음색 프리셋으로 캐릭터 voice를 해석 (오버라이드 병합) */
export function resolveCharacterVoice(
  voicePreset?: string,
  override?: Partial<CharacterVoice>,
): CharacterVoice {
  const base = (voicePreset && VOICE_PRESET_DEFAULTS[voicePreset]) || DEFAULT_VOICE;
  return { ...base, ...override };
}

export type TtsRequest = {
  engine: TtsEngine;
  voice: string;
  /** 엔진에 보낼 최종 텍스트(엔진별 감정 표현 적용) */
  text: string;
  speed: number;
  /** OpenAI gpt-4o-mini-tts용 자연어 prosody 지시 (해당 엔진일 때만) */
  instructions?: string;
};

/**
 * 엔진과 캐릭터 voice로 최종 합성 요청을 만든다. 감정 태그를 엔진 특성에 맞게
 * 적용: Orpheus는 태그를 그대로 두고(인라인 지원), OpenAI는 자연어 prosody
 * 지시로 변환, Kokoro는 태그를 제거(미지원).
 */
export function buildTtsRequest(
  text: string,
  engine: TtsEngine,
  voice: CharacterVoice,
): TtsRequest | null {
  const { cleanText, tags } = parseEmotionTags(text);
  if (!cleanText) return null;
  const speed = voice.speed ?? 1.0;

  if (engine === "orpheus") {
    return { engine, voice: voice.orpheus ?? DEFAULT_VOICE.orpheus!, text, speed }; // 태그 유지
  }
  if (engine === "openai") {
    const instructions =
      tags.length > 0
        ? `${tags.map((t) => EMOTION_TAG_DESC[t] ?? "").filter(Boolean).join(", ")} 말하세요.`
        : undefined;
    return { engine, voice: voice.openai ?? DEFAULT_VOICE.openai!, text: cleanText, speed, instructions };
  }
  // kokoro: 태그 제거
  return { engine, voice: voice.kokoro ?? DEFAULT_VOICE.kokoro!, text: cleanText, speed };
}

/** 실제 합성 백엔드 (dgx Kokoro/Orpheus 서버, OpenAI API 등)가 구현할 인터페이스 */
export type TtsSynthesizer = (request: TtsRequest) => Promise<{ audioUrl?: string; error?: string }>;

/** 발화 1건을 라우팅→요청생성→합성까지 수행하는 편의 진입점 */
export async function speak(
  text: string,
  options: {
    voicePreset?: string;
    voiceOverride?: Partial<CharacterVoice>;
    priority?: EngineSelectionInput["priority"];
    localAvailable?: boolean;
    orpheusAvailable?: boolean;
    synthesize: TtsSynthesizer;
  },
): Promise<{ request: TtsRequest | null; audioUrl?: string; error?: string }> {
  const engine = selectTtsEngine({
    text,
    priority: options.priority,
    localAvailable: options.localAvailable,
    orpheusAvailable: options.orpheusAvailable,
  });
  const voice = resolveCharacterVoice(options.voicePreset, options.voiceOverride);
  const request = buildTtsRequest(text, engine, voice);
  if (!request) return { request: null, error: "발화할 텍스트가 없습니다." };
  const result = await options.synthesize(request);
  return { request, ...result };
}
